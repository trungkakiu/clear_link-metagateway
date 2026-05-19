import express from "express";
import { pendingRequests } from "../../meta_server.js";
import crypto from "crypto";
import path from "path";
import { createRequire } from "module";
import PDFParser from "pdf2json";
import fs from "fs";
import meta_core_controller from "../core/metadata_core/meta_core_controller.js";
import { SENSITIVE_WEIGHTS } from "./Model_weight.js";
import BaselineService from "./BaselineService.js";
import DetectionService from "./DetectionService.js";
import { broadcastNotification } from "../../client_socket_server.js";
import NotificationService from "../core/metadata_core/NotificationService.js";
import axios from "axios";

const version = process.env.APP_VERSION;
let logQueue = [];
const BATCH_SIZE = 100;
const FLUSH_INTERVAL = 5000;
let flushTimer = null;

const flushLogs = async (db) => {
  if (logQueue.length === 0) return;
  const logsToInsert = [...logQueue];
  logQueue = [];

  let hasError = false;
  logsToInsert.forEach((log, index) => {
    for (const key in log) {
      if (typeof log[key] === "number" && Number.isNaN(log[key])) {
        console.error(
          `🚨 [CẢNH BÁO] Log thứ ${index}: Trường [${key}] đang bị giá trị NaN!`,
        );
        hasError = true;
      }
      if (log[key] === undefined) {
        console.error(
          `🚨 [CẢNH BÁO] Log thứ ${index}: Trường [${key}] đang bị giá trị undefined!`,
        );
        hasError = true;
      }
    }
  });

  try {
    await db.Activity_Log_TraceChain.bulkCreate(logsToInsert);
  } catch (error) {
    console.error("[AI-LOG-BATCH] Lỗi khi ghi log theo lô:", error.message);

    console.error("Data bị từ chối:", JSON.stringify(logsToInsert, null, 2));

    logQueue = [...logsToInsert, ...logQueue];
  }
};
const pushToLogQueue = (db, logData) => {
  logQueue.push(logData);

  if (logQueue.length >= BATCH_SIZE) {
    if (flushTimer) clearTimeout(flushTimer);
    flushLogs(db);
  } else if (logQueue.length === 1) {
    flushTimer = setTimeout(() => flushLogs(db), FLUSH_INTERVAL);
  }
};

const safeDecode = (str) => {
  try {
    return decodeURIComponent(str);
  } catch (e) {
    try {
      return unescape(str);
    } catch (e2) {
      return str.replace(/%/g, "");
    }
  }
};

const genId = (root = "") => {
  const randomDigits = Math.floor(
    100000000 + Math.random() * 900000000,
  ).toString();

  return `${root}${randomDigits}`;
};

const validCheckID = (id, model, option_column) => {
  return model.findOne({ where: { [option_column]: id } });
};

const levellimit = (requiredLevel) => (req, res, next) => {
  try {
    const user_raw_level = req?.user?.level;

    if (!user_raw_level) {
      return res.status(401).json({
        RC: 401,
        RM: "Không tìm thấy thông tin định danh (Headers)!",
      });
    }

    const userLevelNum = parseInt(
      user_raw_level.split("_")[1] || user_raw_level,
    );

    const requiredLevelNum = parseInt(
      requiredLevel.toString().split("_")[1] || requiredLevel,
    );

    if (userLevelNum < requiredLevelNum) {
      return res.status(403).json({
        RC: 403,
        RM: `Quyền hạn cấp ${userLevelNum} không đủ để thực hiện thao tác này (Yêu cầu cấp ${requiredLevelNum})!`,
      });
    }

    next();
  } catch (error) {
    console.error("Error at levellimit Middleware:", error);
    return res.status(500).json({ RC: 500, RM: "Lỗi kiểm soát quyền hạn!" });
  }
};

const waitRpc = async (requestId, timeoutMs = 10000) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve({ timeout: true });
    }, timeoutMs);

    pendingRequests.set(requestId, { resolve, timer });
  });

export const RouteGroup = (parent, middlewares = [], callback) => {
  const router = express.Router();

  if (middlewares.length > 0) {
    router.use(...middlewares);
  }

  callback(router);

  parent.use(router);
};

function publicKeyFromDb(pemString) {
  if (typeof pemString !== "string") {
    throw new Error("PUBLIC_KEY_NOT_STRING");
  }

  const normalized = pemString.replace(/\\n/g, "\n").trim();

  return crypto.createPublicKey({
    key: normalized,
    format: "pem",
    type: "spki",
  });
}

function canonicalizeVotePayload(votePayload) {
  return {
    votes: [...votePayload.votes]
      .sort((a, b) => a.product_id.localeCompare(b.product_id))
      .map((v) => ({
        product_id: v.product_id,
        approve: v.approve,
        reason: v.reason,
      })),
  };
}

const signVotePayload = async (votePayload) => {
  const canonicalPayload = canonicalizeVotePayload(votePayload);

  const payloadJson = JSON.stringify(canonicalPayload);

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(payloadJson, "utf8");
  signer.end();

  return signer.sign(KeyStore.getPrivateKey(), "base64");
};

function verifyVotePayload(canonicalPayload, signature, publicKeyPem) {
  const payloadJson = JSON.stringify(canonicalPayload);
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(payloadJson, "utf8");
  verifier.end();
  const publicKey = publicKeyFromDb(publicKeyPem);
  return verifier.verify(publicKey, signature, "base64");
}

const removeOldAvatar = (filename, relativeURL) => {
  if (!filename) return;

  const filePath = path.join(relativeURL, filename);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const extractPdfToHtml = (filePath) => {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);
    pdfParser.on("pdfParser_dataError", (errData) =>
      reject(errData.parserError),
    );
    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      let htmlContent = "";

      pdfData.Pages.forEach((page) => {
        let lastY = 0;
        let lastX = 0;
        let currentLine = "";

        page.Texts.forEach((text) => {
          const x = text.x;
          const y = text.y;
          const str = safeDecode(text.R[0].T);
          const isBold = text.R[0].TS[2] === 1;

          // 1. Kiểm tra xuống dòng
          if (Math.abs(y - lastY) > 0.6) {
            htmlContent += `<p>${currentLine}</p>`;
            currentLine = "";
          }

          // 2. Kiểm tra khoảng cách ký tự (QUAN TRỌNG)
          // Nếu khoảng cách x lớn hơn 0.5, ta coi là có dấu cách giữa các chữ
          // Nếu x xấp xỉ lastX, ta viết liền (fix lỗi T R Ư Ờ N G)
          const charGap = x - lastX;

          let prefix = "";
          if (charGap > 1.2) {
            // Khoảng cách lớn -> Dấu cách thực sự
            prefix = " ";
          } else if (charGap > 0.1) {
            // Khoảng cách nhỏ -> Viết liền (ghép ký tự)
            prefix = "";
          }

          const styledText = isBold ? `<b>${str}</b>` : str;
          currentLine += prefix + styledText;

          lastY = y;
          // Tính toán lastX dựa trên độ dài chuỗi (ước tính)
          lastX = x + (text.w || str.length * 0.4);
        });

        htmlContent += `<p>${currentLine}</p><hr/>`;
        currentLine = "";
      });
      resolve(htmlContent);
    });
    pdfParser.loadPDF(filePath);
  });
};

const scanPdfToHtmlApi = (db) => async (req, res) => {
  const file = req?.file;
  try {
    if (!file) {
      return res.status(400).json({ RC: 400, RM: "Không tìm thấy file PDF!" });
    }

    const htmlResult = await extractPdfToHtml(file.path);

    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    return res.status(200).json({
      RC: 200,
      RM: "Quét PDF thành công!",
      RD: htmlResult,
    });
  } catch (error) {
    console.error("Scan PDF Error:", error);
    if (file) {
      meta_core_controller.cleanupSingleFile(file);
    }
    return res
      .status(500)
      .json({ RC: 500, RM: "Lỗi trong quá trình phân tích PDF!" });
  }
};

const userligit = (db) => async (req, res, next) => {
  try {
    const { company_id, id } = req?.user;
    if (!company_id || !id) {
      return res.status(400).json({
        RM: "Thiếu thông tin định danh!",
        RC: -203,
      });
    }

    const user = await db.Company_account_level.findOne({
      where: {
        Actor_id: id,
        Company_id: company_id,
      },
    });

    if (!user) {
      return res.status(403).json({
        RM: "Hành động không được phép!",
        RC: 403,
      });
    }

    next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RM: "Lỗi hệ thống!",
      RC: 500,
    });
  }
};

const checkuserchallengecode = (db) => async (req, res, next) => {
  const t_mw = await db.sequelize.transaction();

  try {
    const challenge_code =
      req.headers["x-challenge-code"] || req.body?.challenge_code;
    const { id } = req?.user || {};

    if (!challenge_code) {
      await t_mw.rollback();
      return res.status(400).json({
        RM: "Hành động bị từ chối, thiếu mã xác thực bảo mật!",
        RC: 400,
      });
    }

    const challen_history = await db.Admin_active_history.findOne({
      where: {
        challenge_code: challenge_code,
        User_id: id,
        status: "pending",
      },
      transaction: t_mw,
    });

    if (!challen_history) {
      await t_mw.rollback();
      return res.status(401).json({
        RC: 401,
        RM: "Mã xác thực không hợp lệ hoặc đã được sử dụng!",
      });
    }

    const timenow = new Date();
    const createdTime = new Date(challen_history.createdAt);

    if (timenow - createdTime > 120000) {
      await challen_history.update(
        { status: "expired" },
        { transaction: t_mw },
      );
      await t_mw.commit();
      return res.status(400).json({
        RC: 400,
        RM: "Mã xác thực đã quá hạn, vui lòng lấy mã mới!",
      });
    }

    await challen_history.update({ status: "done" }, { transaction: t_mw });
    await t_mw.commit();

    next();
  } catch (error) {
    if (t_mw) await t_mw.rollback();
    console.error("Challenge Auth Error:", error);
    return res.status(500).json({ RM: "Lỗi hệ thống xác thực!", RC: 500 });
  }
};

const seapayHeaderCode = () => async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];

    const EXPECTED_KEY = `Apikey ${process.env.SEA_PAY_SCRET_API_KEY}`;

    if (!authHeader || authHeader !== EXPECTED_KEY) {
      console.error(`[Security] Chặn! Key không khớp.`);
      return res.status(401).json({ RC: 401, RM: "Mã xác thực không hợp lệ!" });
    }

    next();
  } catch (error) {
    console.error("[Security Error] Lỗi:", error);
    return res.status(500).json({ RC: 500, RM: "Lỗi hệ thống!" });
  }
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371000; // Bán kính Trái đất (mét)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const mapRequestToAction = (req) => {
  const method = req.method.toUpperCase();
  if (method === "POST") return "CRUD_CREATE";
  if (method === "PUT" || method === "PATCH") return "CRUD_UPDATE";
  if (method === "GET") return "CRUD_GET";
  if (method === "DELETE") return "CRUD_DELETE";
  return "CRUD_READ";
};

const calculatePayloadDiff = (model, oldData, newData) => {
  const modelName = model.name;
  const weights = SENSITIVE_WEIGHTS[modelName] || {};

  const fields = Object.keys(model.rawAttributes).filter(
    (f) => !["id", "createdAt", "updatedAt"].includes(f),
  );

  let totalChangeWeight = 0;
  let totalPossibleWeight = 0;

  const normalize = (val) =>
    val === null || val === undefined || val === "" ? "" : String(val).trim();

  fields.forEach((field) => {
    const newVal =
      newData[field] !== undefined
        ? newData[field]
        : newData.formData
          ? newData.formData[field]
          : undefined;
    const oldVal = oldData[field];

    if (newVal !== undefined) {
      const w = weights[field] || 0.2;
      totalPossibleWeight += w;

      const normNew = normalize(newVal);
      const normOld = normalize(oldVal);

      if (normNew !== normOld) {
        totalChangeWeight += w;
      }
    }
  });

  const finalScore =
    totalPossibleWeight > 0
      ? parseFloat((totalChangeWeight / totalPossibleWeight).toFixed(2))
      : 0;

  console.log(`[KẾT QUẢ] SCORE (Tử / Mẫu) = ${finalScore}`);

  return finalScore;
};

const AIdataCollection =
  (db, modelName = null) =>
  async (req, res, next) => {
    const startTime = Date.now();

    try {
      const {
        id: actor_id = null,
        company_id = null,
        role: actor_role = "",
      } = req?.user || {};

      if (!actor_id || !company_id || !actor_role) return next();

      const action_type = mapRequestToAction(req);

      const roleToModel = {
        manufacturer: db.Manufacturer,
        distributor: db.Distributor,
        transporter: db.Transporter,
        retailer: db.Retailer,
      };

      const TargetModel = roleToModel[actor_role.toLowerCase()];
      const ActualModel = modelName === "company" ? TargetModel : db[modelName];
      if (!TargetModel) return next();

      let resourceId =
        req.headers["x-resource-id"] ||
        req.params?.id ||
        req.body?.id ||
        req.body?.formData?.id ||
        null;

      const session_id = req?.user?.session_id;

      const [oldRecord, lastLog, entityLocation] = await Promise.all([
        ActualModel && resourceId
          ? ActualModel.findByPk(resourceId, { raw: true }).catch(() => null)
          : Promise.resolve(null),
        db.Activity_Log_TraceChain.findOne({
          where: { actor_id },
          order: [["created_at", "DESC"]],
          raw: true,
        }).catch(() => null),
        TargetModel.findByPk(company_id, {
          attributes: [
            "id",
            "latitude",
            "longitude",
            "AI_active",
            "log_counter",
            "training_threshold",
          ],
        }).catch(() => null),
      ]);

      if (oldRecord) req.ai_old_snapshot = oldRecord;

      res.on("finish", async () => {
        try {
          const response_time_ms = Date.now() - startTime;

          const finalDataUsed = req.ai_mapped_payload || {};

          let payload_diff_score = 0;
          if (oldRecord) {
            payload_diff_score = calculatePayloadDiff(
              ActualModel,
              oldRecord,
              finalDataUsed,
            );
          }
          if (Number.isNaN(payload_diff_score)) payload_diff_score = 0;

          const latitude = parseFloat(req.headers["x-tracechain-lat"]) || null;
          const longitude = parseFloat(req.headers["x-tracechain-lon"]) || null;
          let time_since_last_action = 0;

          if (lastLog) {
            const logTime = lastLog.createdAt || lastLog.created_at;
            const parsedTime = new Date(logTime).getTime();
            if (!Number.isNaN(parsedTime))
              time_since_last_action = Math.max(0, startTime - parsedTime);
          }

          const distance =
            latitude !== null &&
            longitude !== null &&
            entityLocation?.latitude !== null
              ? calculateDistance(
                  latitude,
                  longitude,
                  entityLocation.latitude,
                  entityLocation.longitude,
                )
              : null;
          const is_within_geofence =
            distance !== null ? (distance <= 500 ? 1 : 0) : 1;

          const real_ip =
            req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
            req.ip ||
            "127.0.0.1";

          let report = { is_anomaly: false, anomaly_score: 0 };

          if (entityLocation && entityLocation.AI_active) {
            const rawLog = {
              company_id,
              actor_role,
              action_type,
              payload_diff_score,
              latitude: latitude || 0,
              longitude: longitude || 0,
              is_within_geofence,
              blockchain_status: "not_pushed",
              response_time_ms,
              time_since_last_action,
              process_step: finalDataUsed?.step || 1,
              hour_of_day: new Date().getHours(),
              device_fingerprint: req.headers["user-agent"] || "Unknown",
              ip_address: real_ip,
            };

            const aiReport = await DetectionService.predictAnomaly(
              rawLog,
              actor_id,
              session_id,
            );
            if (aiReport) report = aiReport;
          }

          const newLogEntry = {
            actor_id,
            company_id,
            actor_role,
            action_type,
            session_id:
              req.headers["x-session-id"] || req.user?.session_id || null,
            resource_id: resourceId,
            latitude,
            longitude,
            is_within_geofence,
            ip_address: real_ip,
            device_fingerprint: req.headers["user-agent"] || "Unknown",
            response_time_ms,
            time_since_last_action,
            payload_diff_score,
            hour_of_day: new Date().getHours(),
            blockchain_status: "not_pushed",
            anomaly_score: report.anomaly_score,
            anomaly_source: "ai",
            risk_level:
              report.anomaly_score > 0.8
                ? "critical"
                : report.is_anomaly
                  ? "high"
                  : "low",
          };

          if (report.is_anomaly) {
            const savedLog =
              await db.Activity_Log_TraceChain.create(newLogEntry);
            const noti = await db.Notification.create({
              Owner_id: company_id,
              noitfi_level: 4,
              status: "unread",
              message: `Cảnh báo: Phát hiện hành vi ${action_type} bất thường từ ${actor_id}!`,
              linkToAction: `/admin/logs/${savedLog.id}`,
            });

            await NotificationService.sendSmartNotification(
              noti.id,
              company_id,
              "anormaly_detected",
              noti.message,
              [],
              "anormaly_detected",
              "level_4",
              noti.linkToAction,
              false,
            ).catch((err) =>
              console.error("Lỗi gửi cảnh báo Notification:", err.message),
            );
          } else {
            pushToLogQueue(db, newLogEntry);
          }

          if (entityLocation) {
            await entityLocation.increment("log_counter", { by: 1 });

            await entityLocation.reload();
            const currentCount = entityLocation.log_counter;

            const threshold = entityLocation.training_threshold || 5000;

            if (currentCount >= threshold) {
              console.log(
                `[AI_TRIGGER] CHẠM NGƯỠNG TRAINING (${threshold})! Tạm thời reset counter để chống spam. Chờ Python luyện não...`,
              );

              await entityLocation.update({ log_counter: 0 });

              console.log(
                `[AI_TRIGGER] Bắn tín hiệu sang Python Server để RE-TRAIN model cho [${company_id}]...`,
              );

              axios
                .post(
                  `http://localhost:8000/re-train/${company_id}?is_support=true`,
                )
                .then(async (response) => {
                  await entityLocation.update({ AI_active: true });
                  console.log(
                    `[AI_TRIGGER] Python Server xác nhận: ${response.data.message || "Model đã sẵn sàng!"}`,
                  );
                  console.log(
                    `[AI_TRIGGER] ĐÃ BẬT AI_ACTIVE THÀNH CÔNG CHO [${company_id}]!`,
                  );
                })
                .catch((error) => {
                  console.error(
                    `[AI_TRIGGER] GỌI PYTHON THẤT BẠI:`,
                    error.message,
                  );
                });
            }
          }
        } catch (logError) {
          console.error("Lỗi Event Finish AI Task:", logError.message);
        }
      });

      return next();
    } catch (error) {
      console.error("Lỗi AI Middleware:", error.message);
      next();
    }
  };
export default {
  genId,
  flushLogs,
  seapayHeaderCode,
  AIdataCollection,
  checkuserchallengecode,
  scanPdfToHtmlApi,
  removeOldAvatar,
  validCheckID,
  userligit,
  RouteGroup,
  waitRpc,
  publicKeyFromDb,
  canonicalizeVotePayload,
  signVotePayload,
  levellimit,
  verifyVotePayload,
};
