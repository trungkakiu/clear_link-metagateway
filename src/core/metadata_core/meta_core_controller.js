import crypto from "crypto";
import { pendingRequests } from "../../../meta_server.js";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import Helper__funtion from "../../utils/Helper__funtion.js";
import pair_validate from "../../core_API/pair_validate.js";
import { Op } from "sequelize";
import axios from "axios";
import meta_controller from "./meta_controller.js";
import meta_ws_controller from "./meta_ws_controller.js";

const version = process.env.APP_VERSION;

const getPendingRequest = (db) => async (req, res) => {
  try {
    const ROLE_MODELS = {
      Retailer: {
        DB: db.Retailer,
        AS: "actor_owner",
      },
      Manufacturer: { DB: db.Manufacturer, AS: "actor_owner" },
      Distributor: { DB: db.Distributor, AS: "actor_owner" },
      Transporter: { DB: db.Transporter, AS: "actor_owner" },
    };

    const result = {};
    for (const [role, { DB, AS }] of Object.entries(ROLE_MODELS)) {
      const list = await DB.findAll({
        where: { status: "pending" },
        include: [
          {
            model: db.Actor_model,
            as: AS,
            attributes: {
              exclude: ["password"],
            },
            where: { role_active: "pending" },
          },
        ],
      });

      result[role] = list;
    }

    return res.status(200).json({
      RM: "Pending role active list!",
      RC: 200,
      RD: result,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const changeStatus_user = (db) => async (req, res) => {
  try {
    const { role_id, user_id } = req?.body;
    const { UserStage, role, RoleStage } = req?.params;
    if (!role_id) {
      return res.status(200).json({
        RM: "Thiếu dữ liệu!",
        RC: -203,
      });
    }

    if (!user_id || !role || !UserStage || !RoleStage) {
      return res.status(403).json({
        RM: "token của người dùng sai!",
        RC: -403,
      });
    }

    const user = await db.Actor_model.findByPk(user_id);
    if (!user) {
      return res.status(400).json({
        RM: "Không tìm thấy người dùng!",
        RC: -403,
      });
    }

    const role_requset = await db[role].findByPk(role_id);
    if (!role_requset) {
      return res.status(400).json({
        RM: "Không tìm thấy người dùng!",
        RC: -403,
      });
    }

    const user_stage_validator = ["pending", "not_active", "active"];
    const role_stage_validator = [
      "active",
      "pending",
      "in_down_progess",
      "donw",
      "not_active",
    ];

    if (
      !user_stage_validator.includes(UserStage) ||
      !role_stage_validator.includes(RoleStage)
    ) {
      return res.status(400).json({
        RM: "Trạng thái thay đổi không phù hợp!",
        RC: -400,
      });
    }

    user.role_active = UserStage;
    user.status = UserStage;
    role_requset.status = RoleStage;
    await user.save();
    await role_requset.save();

    return res.status(200).json({
      RM: `Đã kích hoạt role của người dùng ${user.id}`,
      RC: 200,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const generate_node_keypair = async (user_id) => {
  try {
    if (!user_id) {
      return res.status(200).json({
        RM: "Thiếu user_id!",
        RC: -203,
      });
    }

    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    });

    return {
      publicKey: publicKey,
      privateKey: privateKey,
    };
  } catch (err) {
    console.error(err);
    return null;
  }
};

const create_nodeinfo = (db) => async (req, res) => {
  try {
    const {
      id,
      user_id,
      address_ip,
      port,
      is_prime,
      role,
      peers,
      Owner_actor,
    } = req.body;

    if (!id || !user_id || !address_ip || !port || !role || !peers) {
      return res.json({ RM: "Thiếu dữ liệu!", RC: -203 });
    }

    const user = await db.Actor_model.findByPk(user_id);
    if (!user) {
      return res.json({ RM: "Không tìm thấy người dùng!", RC: -400 });
    }

    const activePeers = await db.peer_map.findAll({
      where: { status: "active" },
      attributes: ["full_address"],
    });

    const dbPeerList = activePeers.map((p) => p.full_address);
    if (peers.length !== dbPeerList.length) {
      return res.json({
        RM: "Danh sách peers không khớp (sai số lượng)!",
        RC: -400,
      });
    }

    for (const peer of peers) {
      if (!dbPeerList.includes(peer)) {
        return res.json({
          RM: "Danh sách peers không hợp lệ (sai nội dung)!",
          RC: -400,
        });
      }

      if (dbPeerList.includes(`${address_ip}:${port}`)) {
        return res.json({
          RM: "Địa chỉ ip này đã tồn tại trong hệ thống!",
          RC: -400,
        });
      }
    }

    const keypem = await generate_node_keypair(user_id);
    const initial_signature = Buffer.from(id + keypem.publicKey).toString(
      "base64",
    );

    const new_node = {
      id,
      full_address: `${address_ip}:${port}`,
      address_ip,
      port,
      Owner_actor: user_id,
      public_key: keypem.publicKey,
      initial_signature,
      node_version: "beta_0.0.0",
      agent: "none",
      is_prime: Boolean(is_prime),
      role: role,
      status: "pending",
      health: "ok",
    };

    await db.peer_map.create(new_node);
    user.setup_status = "pending";
    await user.save();

    return res.json({
      RM: "Đã ghi nhận thông tin node!",
      RC: 200,
      RD: keypem.privateKey,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ RM: "Internal server error!", RC: 500 });
  }
};

const bindWsResponse = (msg) => {
  const timeoutMs = 10000;

  const timer = setTimeout(() => {
    if (pendingRequests.has(requestId)) {
      pendingRequests.delete(requestId);
      resolve({ timeout: true });
    }
  }, timeoutMs);

  pendingRequests.set(requestId, {
    resolve,
    timer,
  });
};

const getAllNodeInfo = (nodes, db) => async (req, res) => {
  try {
    const peerList = await db.peer_map.findAll({
      attributes: [
        "id",
        "full_address",
        "node_version",
        "role",
        "public_key",
        "status",
        "node_type",
      ],
      raw: true,
    });

    const result = peerList.map((node) => {
      const nodeId = node.id;
      const isActive = nodes.has(nodeId);

      return {
        ...node,
        ws_active: isActive ? true : false,
      };
    });

    return res.status(200).json({
      RC: 200,
      RM: "Success",
      RD: result,
    });
  } catch (error) {
    console.error("getAllNodeInfo error:", error);
    return res.status(500).json({
      RC: 500,
      RM: "Internal server error",
      RD: null,
    });
  }
};

const getNodeInfomation = (nodes, db) => async (req, res) => {
  try {
    const { node_id } = req?.params;

    if (!node_id || !nodes) {
      return res.status(400).json({ RM: "Thiếu dữ liệu", RC: -401 });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.flushHeaders();

    const send = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send({ step: 1, progress: 40, msg: "Collecting system information" });
    const nodeMetaSystem = await db.peer_map.findByPk(node_id);

    send({ step: 2, progress: 80, msg: "Checking WS Node status" });
    const nodeWsSystem = await meta_ws_controller.requestNodeStatus(
      nodes,
      node_id,
      pendingRequests,
    );

    console.log("nodeWsSystem:", nodeWsSystem);

    if (nodeWsSystem) {
      if (nodeWsSystem.RC !== 200) {
        nodeWsSystem.RD = nodeWsSystem.RM;
      }
    }

    send({
      step: 3,
      progress: 100,
      msg: "Node status fetched successfully",
      result: {
        nodeMetaSystem: nodeMetaSystem,
        nodeWsSystem: nodeWsSystem.RD,
      },
    });
    res.end();
  } catch (err) {
    console.error("[getNodeStatusSSE ERROR]", err);
    res.write(
      `data: ${JSON.stringify({
        step: -1,
        progress: 0,
        msg: "Internal error",
        error: err.message,
      })}\n\n`,
    );

    res.end();
  }
};

const get_dashboard = (db) => async (req, res) => {
  try {
    const { user_id } = req.params;
    if (!user_id) {
      return res.status(200).json({
        RM: "Thiếu dữ liệu!",
        RC: -203,
      });
    }

    const dashboard = await db.Actor_model.findOne({
      where: { id: user_id },
      include: [
        {
          model: db.Manufacturer,
          as: "manufacturers",
        },
        {
          model: db.Distributor,
          as: "distributors",
        },
        {
          model: db.Retailer,
          as: "retailers",
        },
        {
          model: db.Transporter,
          as: "Transporters",
        },
      ],
    });

    if (!dashboard) {
      return res.status(200).json({
        RC: -203,
        RM: "User not found!",
      });
    }
    return res.status(200).json({
      RM: "User dashboard",
      RC: 200,
      RD: dashboard,
    });
  } catch (error) {
    console.error("requestNodeStatus error:", error);
    return res.status(500).json({
      RC: 500,
      RM: "Internal server error",
    });
  }
};

const product_upload = (db) => async (req, res) => {
  const mainFiles = req.files?.main_cardimage || [];
  const subFiles = req.files?.sub_images || [];
  const allFiles = [...mainFiles, ...subFiles];

  const company_id = req?.user?.company_id;

  if (!company_id) {
    cleanupUploadedFiles(allFiles);
    return res.status(400).json({
      RC: -203,
      RM: "Thiếu dữ liệu!",
    });
  }

  const {
    name,
    price,
    description,
    type,
    stock_quantity,
    status,
    category_id,
  } = req.body;

  if (!name || !price || !status || !type || !stock_quantity || !category_id) {
    cleanupUploadedFiles(allFiles);
    return res.status(400).json({
      RC: -203,
      RM: "Thiếu dữ liệu!",
    });
  }

  if (mainFiles.length === 0) {
    cleanupUploadedFiles(allFiles);
    return res.status(400).json({
      RC: -203,
      RM: "Thiếu hình ảnh đại diện!",
    });
  }

  const mainImage = mainFiles[0];

  const t = await db.sequelize.transaction();
  try {
    let product_id;
    do {
      product_id = Helper__funtion.genId("PRODUCT_");
    } while (await Helper__funtion.validCheckID(product_id, db.Product, "id"));

    const product = await db.Product.create(
      {
        id: product_id,
        name,
        price,
        author: req?.user?.company_id,
        type,
        responsible_person: req?.user?.id,
        description: description || "",
        main_cardimage: mainImage.filename,
        status,
        stock_quantity,
        category_id,
      },
      { transaction: t },
    );

    let indexCount = 1;
    for (const card of subFiles) {
      let subcard_id;
      do {
        subcard_id = Helper__funtion.genId(`${product_id}_`);
      } while (
        await Helper__funtion.validCheckID(subcard_id, db.Item_image, "id")
      );

      await db.Item_image.create(
        {
          id: subcard_id,
          image_name: card.filename,
          image_type: "product",
          owner_id: req?.user?.id,
          url: card.path,
          img_des: `Ảnh con của sản phẩm ${product_id}`,
          index: indexCount++,
          status: "censored",
        },
        { transaction: t },
      );
    }

    await t.commit();

    return res.status(200).json({
      RC: 200,
      RM: "Thêm sản phẩm thành công!",
      RD: product,
    });
  } catch (error) {
    await t.rollback();
    cleanupUploadedFiles(allFiles);
    console.error("product_upload error:", error);
    return res.status(500).json({
      RC: 500,
      RM: "Internal server error",
    });
  }
};

const safeUnlink = (filePath) => {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error("Xóa file lỗi:", filePath, err.message);
    }
  });
};

const cleanupUploadedFiles = (files) => {
  if (!files) return;
  files.forEach((f) => {
    if (!f || !f.path) return;
    safeUnlink(f.path);
  });
};

const getUserProductPending = (db) => async (req, res) => {
  try {
    const company_id = req?.user?.company_id;
    if (!company_id) {
      return res.status(200).json({
        RM: "thiếu dữ liệu đầu vào!",
        RC: -203,
      });
    }

    const product_list = await db.Product.findAll({
      where: {
        author: company_id,
      },
    });

    return res.status(200).json({
      RM: "Sản phẩm của người dùng",
      RC: 200,
      RD: product_list,
    });
  } catch (error) {
    console.error(error);
    return res.status(200).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const repair_block = (db, nodes) => async (req, res) => {
  try {
    const node_map = await db.peer_map.findAll({
      where: { status: "active" },
    });
    const { data, type_db } = req.body;

    const quorum = Math.ceil((2 * node_map.length) / 3);
    const result_map = [];

    const product_item = await db.Product;

    let item = null;
    let raw = null;
    if (type_db == "user") {
      item = await db.Actor_model.findByPk(item.item_id);
      raw = `${item.id}|${item.email}|${item.public_key}|${item.role}`;
    } else if (type_db == "product") {
      item = await db.Product.findByPk(item.item_id);
      raw = `${item.id}|${item.author}|${item.responsible_person}|${item.price}`;
    }
    const client_hash = crypto.createHash("sha256").update(raw).digest("hex");

    const item_hash = crypto.createHash("sha256").update(data).digest("hex");

    const payload = {
      timestamp: Date.now(),
      payload: {
        item_id: data.item_id,
        hash: item_hash,
        version: version,
        Owner_id: data.id,
        status: data.status,
        detail: data.detail,
        first_price: data?.price || "",
      },
    };

    const vote_results = await pair_validate.get_vote(
      db,
      client_hash,
      data.item_id,
      type_db == "user" ? "user_create" : "product_create",
      "active",
      nodes,
      "create_block",
    );

    if (vote_results.RC !== 200 || vote_results.RD.vote_true < quorum) {
    }

    const commitResp = await pair_validate.pair_request(
      db,
      payload,
      nodes,
      "override_block",
    );

    if (commitResp.RC !== 200 || commitResp.RD.complate < quorum) {
      return res.status(400).json({
        RM: "Không được đồng thuận!",
        RC: 400,
        RD: commitResp.RD.peer_map_list,
      });
    }

    if (commitResp.RC === 200 && commitResp.RD.complate >= quorum) {
      return res.status(200).json({
        RM: "Đã hoàn thành ghi đè block!",
        RC: 200,
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const create_Admin_node = (db) => async (req, res) => {
  try {
    const {
      id,
      node_type,
      full_address,
      address_ip,
      port,
      public_key,
      initial_signature,
      node_version,
      role,
      status,
      Owner_actor,
      current_height,
    } = req.body.payload;

    const oneTimeOTP = req.body.oneTimeOTP;
    const owner_id = req?.user?.id;
    if (
      !id ||
      !node_type ||
      !full_address ||
      !address_ip ||
      !port ||
      !public_key ||
      !node_version ||
      !role ||
      !status ||
      !owner_id
    ) {
      return res.status(400).json({
        RM: "Thiếu dữ liệu!",
        RC: -203,
      });
    }

    if (!oneTimeOTP) {
      return res.status(400).json({
        RM: "Thiếu OTP!",
        RC: -203,
      });
    }

    const key_valid = await db.Admin_active_history.findOne({
      where: {
        challenge_code: oneTimeOTP,
        status: "valid",
      },
    });

    if (!key_valid) {
      key_valid.status = "done";
      await key_valid.save();
      return res.status(400).json({
        RM: "OTP không hợp lệ hoặc đã sử dụng!",
        RC: -403,
      });
    }

    const node_valid = await db.peer_map.findByPk(id);
    if (node_valid) {
      key_valid.status = "done";
      await key_valid.save();
      return res.status(400).json({
        RM: "Node ID đã tồn tại!",
        RC: -403,
      });
    }

    await db.peer_map.create({
      id,
      node_type,
      full_address,
      address_ip,
      port,
      public_key,
      initial_signature,
      node_version,
      role,
      status,
      Owner_actor,
      current_height: current_height || 0,
    });
    key_valid.status = "done";
    await key_valid.save();
    return res.status(200).json({
      RM: "Đã tạo node admin thành công!",
      RC: 200,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

export default {
  product_upload,
  getPendingRequest,
  get_dashboard,
  bindWsResponse,
  changeStatus_user,
  getAllNodeInfo,
  create_nodeinfo,
  getNodeInfomation,
  repair_block,
  safeUnlink,
  cleanupUploadedFiles,
  getUserProductPending,
  create_Admin_node,
};
