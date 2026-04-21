import express from "express";
import { pendingRequests } from "../../meta_server.js";
import crypto from "crypto";
import path from "path";
import { createRequire } from "module";
import PDFParser from "pdf2json";
import fs from "fs";
import meta_core_controller from "../core/metadata_core/meta_core_controller.js";

const version = process.env.APP_VERSION;

// Hàm decode an toàn để tránh lỗi URI malformed
const safeDecode = (str) => {
  try {
    return decodeURIComponent(str);
  } catch (e) {
    try {
      // Thử dùng unescape nếu decodeURIComponent thất bại
      return unescape(str);
    } catch (e2) {
      // Cuối cùng nếu vẫn lỗi thì xóa ký tự % gây nhiễu
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

    console.log(">>> [MW]: OTP verified & locked 'done'. Connection released.");

    next();
  } catch (error) {
    if (t_mw) await t_mw.rollback();
    console.error("!!! Challenge Auth Error:", error);
    return res.status(500).json({ RM: "Lỗi hệ thống xác thực!", RC: 500 });
  }
};

const seapayHeaderCode = () => async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];

    const EXPECTED_KEY = `Apikey ${process.env.SEA_PAY_SCRET_API_KEY}`;

    console.log(`> Đang so sánh: "${authHeader}" với "${EXPECTED_KEY}"`);

    if (!authHeader || authHeader !== EXPECTED_KEY) {
      console.error(`[Security] Chặn! Key không khớp.`);
      return res.status(401).json({ RC: 401, RM: "Mã xác thực không hợp lệ!" });
    }

    console.log("Xác thực thành công! Cho phép xử lý Webhook.");
    next();
  } catch (error) {
    console.error("[Security Error] Lỗi:", error);
    return res.status(500).json({ RC: 500, RM: "Lỗi hệ thống!" });
  }
};

export default {
  genId,
  seapayHeaderCode,
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
