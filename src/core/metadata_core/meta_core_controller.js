import crypto from "crypto";
import { pendingRequests } from "../../../meta_server.js";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import Helper__funtion from "../../utils/Helper__funtion.js";
import pair_validate from "../../core_API/pair_validate.js";
import { Op, where } from "sequelize";
import axios from "axios";
import meta_controller from "./meta_controller.js";
import meta_ws_controller from "./meta_ws_controller.js";
import { broadcastNotification } from "../../../client_socket_server.js";
import { fileURLToPath } from "url";
import NotificationService from "./NotificationService.js";
import InspectionUpload from "../meta_image_controller.js/InspectionUpload.js";
const version = process.env.APP_VERSION;
const SERVER_SECRET = process.env.SERVER_SECRET_KEY || "default_secret_key";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INSPECTION_DIR = path.join(__dirname, "../../Access/InspectionReport");

const generateSecureHash = (content) => {
  return crypto
    .createHmac("sha256", SERVER_SECRET)
    .update(content)
    .digest("hex");
};

const verifyTemplateIntegrity = (template) => {
  const secret =
    process.env.CONTRACT_SECRET_KEY || "AWS_SUPPLY_CHAIN_PRIVATE_KEY_2026";

  const currentHash = crypto
    .createHmac("sha256", secret)
    .update(template.content_html)
    .digest("hex");

  return currentHash === template.content_hash;
};

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

    const global_info = await db.Global_Node.findAll();
    const all_transaction = await db.Pinned_Products.count();
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
      RD: { result, all_transaction, global_info },
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
      RM: "Thiếu dữ liệu định danh công ty!",
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
  } = req?.body;

  if (!name || !price || !status || !type || !stock_quantity || !category_id) {
    cleanupUploadedFiles(allFiles);
    return res.status(400).json({
      RC: -203,
      RM: "Thiếu dữ liệu bắt buộc!",
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

    const product_master = await db.Product.create(
      {
        id: product_id,
        author: company_id,
        type,
        stock_quantity,
        category_id,
      },
      { transaction: t },
    );

    const product_metadata = await db.Product_Metadata.create(
      {
        product_id: product_id,
        version: 1,
        is_latest: true,
        name,
        price,
        responsible_person: req?.user?.id,
        description: description || "",
        main_cardimage: mainImage.filename,
        status,
        chain_status: "pending",
      },
      { transaction: t },
    );

    // ==========================================

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
          parent_id: company_id,
          image_type: "product",
          owner_id: product_id,
          url: card.path,
          img_des: `Ảnh con của sản phẩm ${product_id}`,
          index: indexCount++,
          status: "censored",
        },
        { transaction: t },
      );
    }

    await t.commit();

    const responseData = {
      ...product_master.toJSON(),
      ...product_metadata.toJSON(),
      id: product_id,
    };

    return res.status(200).json({
      RC: 200,
      RM: "Thêm sản phẩm thành công!",
      RD: responseData,
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

const cleanupSingleFile = async (file) => {
  if (!file) return;

  const filePath = typeof file === "string" ? file : file.path;

  if (filePath) {
    try {
      await fs.access(filePath);

      await fs.unlink(filePath);
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.error(`[File System] Error processing file ${filePath}:`, err);
      }
    }
  }
};

const getUserProductList = (db) => async (req, res) => {
  try {
    const company_id = req?.user?.company_id;
    if (!company_id) {
      return res.status(400).json({
        RM: "Thiếu dữ liệu đầu vào!",
        RC: -203,
      });
    }

    const raw_product_list = await db.Product.findAll({
      where: {
        author: company_id,
      },
      include: [
        {
          model: db.Product_Metadata,
          as: "versions",
          where: {
            is_latest: true,
          },
          required: true,
        },
      ],
    });

    const formatted_list = raw_product_list.map((prod) => {
      const prodJson = prod.toJSON();

      const metadata =
        prodJson.versions && prodJson.versions.length > 0
          ? prodJson.versions[0]
          : {};

      delete prodJson.versions;

      return {
        ...prodJson,
        ...metadata,
        id: prodJson.id,
        metadata_id: metadata.id,
      };
    });

    return res.status(200).json({
      RM: "Lấy danh sách Sản phẩm chờ duyệt thành công",
      RC: 200,
      RD: formatted_list,
    });
  } catch (error) {
    console.error("getUserProductPending error:", error);
    return res.status(500).json({
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
      timestamp: String(Date.now()),
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

const getValidProduct = (db) => async (req, res) => {
  try {
    const company_id = req?.user?.company_id;
    if (!company_id) {
      return res.status(400).json({
        RM: "Lỗi thiếu dữ liệu định danh công ty!",
        RC: -203,
      });
    }

    const raw_products = await db.Product.findAll({
      where: {
        author: company_id,
      },
      include: [
        {
          model: db.Product_Metadata,
          as: "versions",
          where: {
            is_latest: true,
            chain_status: "active",
          },
          required: true,
        },
      ],
    });

    const formatted_list = raw_products.map((prod) => {
      const prodJson = prod.toJSON();

      const metadata =
        prodJson.versions && prodJson.versions.length > 0
          ? prodJson.versions[0]
          : {};

      delete prodJson.versions;

      return {
        ...prodJson,
        ...metadata,
        id: prodJson.id,
        metadata_id: metadata.id,
      };
    });

    return res.status(200).json({
      RM: "Lấy sản phẩm hợp lệ thành công!",
      RC: 200,
      RD: formatted_list,
    });
  } catch (error) {
    console.error("getValidProduct error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const getValidDepartment = (db) => async (req, res) => {
  try {
    const company_id = req?.user?.company_id;
    if (!company_id) {
      return res.status(400).json({
        RM: "Lỗi thiếu dữ liệu!",
        RC: -203,
      });
    }
    const departments = await db.Department.findAll({
      where: {
        Company_id: company_id,
        part: "production",
        leader_id: { [Op.ne]: null },
        active: true,
      },
      include: [
        {
          model: db.ProductionStaff,
          as: "leader",
          attributes: ["id", "name"],
        },
      ],
    });
    return res.status(200).json({
      RM: "Lấy bộ phận hợp lệ thành công!",
      RC: 200,
      RD: departments,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const createBatch = (db) => async (req, res) => {
  try {
    const {
      id,
      batch_name,
      product_id,
      Department_id,
      description,
      manufacture_date,
      pinner_id,
      packaging_id,
      expiry_date,
      quantity,
      payment_method,
    } = req.body.formData;

    const author = req?.user?.company_id;

    if (
      !id ||
      !product_id ||
      !manufacture_date ||
      !packaging_id ||
      !expiry_date ||
      !quantity
    ) {
      return res.status(400).json({ RM: "Thiếu dữ liệu bắt buộc!", RC: -203 });
    }

    const isExists = await db.product_batch.findByPk(id);
    if (isExists) {
      return res
        .status(400)
        .json({ RM: "Đã tồn tại mã lô hàng này!", RC: -400 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const mfgDate = new Date(manufacture_date);
    mfgDate.setHours(0, 0, 0, 0);
    const expDate = new Date(expiry_date);
    expDate.setHours(0, 0, 0, 0);

    if (expDate <= mfgDate) {
      return res
        .status(400)
        .json({ RM: "Ngày hết hạn phải sau ngày sản xuất!", RC: -403 });
    }
    if (mfgDate < today) {
      return res
        .status(400)
        .json({ RM: "Ngày sản xuất không được ở quá khứ!", RC: -403 });
    }

    const Department = await db.Department.findOne({
      where: {
        id: Department_id,
        Company_id: author,
        active: true,
      },
      include: [
        {
          model: db.ProductionStaff,
          as: "leader",
          attributes: ["id"],
        },
      ],
    });

    const product_master = await db.Product.findByPk(product_id);
    const product_metadata = await db.Product_Metadata.findOne({
      where: {
        product_id: product_id,
        is_latest: true,
      },
    });

    const box = await db.Product_Packaging.findByPk(packaging_id);

    if (!product_master || !product_metadata || !box || !Department) {
      return res.status(400).json({
        RM: "Không tìm thấy sản phẩm (hoặc chưa có phiên bản), bao bì, hoặc phòng ban!",
        RC: -403,
      });
    }

    if (
      parseFloat(product_metadata.weight) > parseFloat(box.max_weight_capacity)
    ) {
      return res.status(400).json({
        RM: "Trọng lượng 1 sản phẩm vượt quá tải trọng của hộp!",
        RC: -403,
      });
    }

    const logistics = ((metadata, bx, qty) => {
      const unitW = parseFloat(metadata.weight) || 0;
      const bVol = parseFloat(bx.volume) || 0;
      const tQty = parseInt(qty) || 0;

      const PALLET_W_LIMIT = 1000;
      const PALLET_V_LIMIT = 1.8;

      const itemsPerBox =
        Math.floor(parseFloat(bx.max_weight_capacity) / unitW) || 1;
      const totalBox = Math.ceil(tQty / itemsPerBox);

      const totalWeight = unitW * tQty;
      const totalVolume = totalBox * bVol;

      const finalPallets = Math.ceil(
        Math.max(totalWeight / PALLET_W_LIMIT, totalVolume / PALLET_V_LIMIT),
      );

      return {
        unitWeight: unitW,
        totalWeight: totalWeight.toFixed(2),
        totalBox: totalBox,
        totalPallet: finalPallets,
      };
    })(product_metadata, box, quantity);

    let status = mfgDate > today ? "pending" : "in_progress";

    const batch = await db.product_batch.create({
      id,
      batch_name,
      product_id,
      Order_owner: pinner_id,
      product_metadata_id: product_metadata.id,
      Product_box_model: packaging_id,
      Department_id,
      weight_per_unit: logistics.unitWeight,
      total_weight: logistics.totalWeight,
      total_box: logistics.totalBox,
      total_pallet: logistics.totalPallet,
      description,
      manufacture_date,
      expiry_date,
      status: status,
      quantity,
      author,
    });

    const noti = await db.Notification.create({
      Actor_id: Department.leader.id,
      noitfi_level: 2,
      linkToAction: `/Products/Manufacturer/process?highline=${batch.id}&openModal=false`,
      status: "unread",
      message: `Yêu cầu sản xuất mới lô hàng ${batch.id}, kiểm tra ngay!`,
    });

    await NotificationService.sendSmartNotification(
      noti?.id,
      author,
      "production",
      `Yêu cầu sản xuất mới lô hàng ${batch.id}, kiểm tra ngay!`,
      [Department?.leader?.id],
      "production_create",
      "level_2",
      `/Products/Manufacturer/process?highline=${batch.id}&openModal=false`,
      false,
    );

    req.ai_final_payload = batch.get({ plain: true });

    return res.status(200).json({
      RM: "Khởi tạo kế hoạch lô hàng thành công!",
      RC: 200,
      RD: batch,
    });
  } catch (error) {
    console.error(">>> [CREATE BATCH ERR]:", error);
    return res.status(500).json({ RM: "Internal server error!", RC: 500 });
  }
};

const getDepartmentsBatch = (db) => async (req, res) => {
  try {
    const author = req?.user?.company_id;
    if (!author) {
      return res.status(400).json({
        RM: "Thiếu dữ liệu!",
        RC: -203,
      });
    }

    // 1. TRUY VẤN DỮ LIỆU ĐÃ ĐƯỢC CHUẨN HÓA SCHEMA
    const departments = await db.Department.findAll({
      where: {
        leader_id: { [db.Sequelize.Op.ne]: null }, // Dùng db.Sequelize.Op để tránh lỗi undefined Op
        active: true,
        company_id: author,
      },
      include: [
        {
          model: db.ProductionStaff,
          as: "leader",
          attributes: ["id", "name", "avatar"],
        },
        {
          model: db.product_batch,
          as: "batches",
          required: false,
          where: {
            status: [`pending`, `in_progress`],
          },
          attributes: [
            "id",
            "isOEM",
            "batch_name",
            "quantity",
            "manufacture_date",
            "progress_quantity",
            "expiry_date",
            "status",
          ],
          include: [
            {
              model: db.Product,
              as: "product",
              attributes: ["id", "author", "type"], // Chỉ lấy cột có thật trong bảng Product
              include: [
                {
                  model: db.Product_Metadata,
                  as: "versions",
                  where: { is_latest: true }, // Chỉ lấy metadata mới nhất
                  attributes: ["name", "main_cardimage"],
                  required: false, // Tránh rớt batch nếu thiếu metadata
                },
              ],
            },
          ],
        },
      ],
    });

    const flattenedDepartments = departments.map((dept) => {
      const deptJson = dept.toJSON();

      if (deptJson.batches && deptJson.batches.length > 0) {
        deptJson.batches.forEach((batch) => {
          if (
            batch.product &&
            batch.product.versions &&
            batch.product.versions.length > 0
          ) {
            const metadata = batch.product.versions[0];

            batch.product.name = metadata.name;
            batch.product.main_cardimage = metadata.main_cardimage;

            delete batch.product.versions;
          } else if (batch.product) {
            batch.product.name = "Chưa có dữ liệu phiên bản";
            batch.product.main_cardimage = null;
            delete batch.product.versions;
          }
        });
      }

      return deptJson;
    });

    return res.status(200).json({
      RM: "Lấy bộ phận hợp lệ thành công!",
      RC: 200,
      RD: flattenedDepartments,
    });
  } catch (error) {
    console.error("getDepartmentsBatch Error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const updateBatchState = (db) => async (req, res) => {
  try {
    const company_id = req?.user?.company_id;
    const { batch_id, new_state } = req.body;
    if (!batch_id || !new_state || !company_id) {
      return res.status(400).json({
        RM: "Thiếu dữ liệu!",
        RC: -203,
      });
    }
    const batch = await db.product_batch.update(
      { status: new_state },
      {
        where: {
          id: batch_id,
          author: company_id,
        },
      },
    );

    if (!batch) {
      return res.status(400).json({
        RM: "Không tìm thấy lô hàng hoặc không có quyền truy cập lô hàng này!",
        RC: 403,
      });
    }
    return res.status(200).json({
      RM: "Cập nhật trạng thái batch thành công!",
      RC: 200,
      RD: batch,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const getCompletedBatches = (db) => async (req, res) => {
  try {
    const author = req?.user?.company_id;
    if (!author) {
      return res.status(400).json({
        RM: "Thiếu dữ liệu!",
        RC: -203,
      });
    }

    // 1. QUERY KÉO CẢ CÀNH VÀ LÁ
    const rawBatches = await db.product_batch.findAll({
      where: {
        status: [
          "completed",
          "pending",
          "pairing",
          "qc_passed",
          "not_completed",
        ],
        author,
      },
      include: [
        { model: db.Department, as: "Department" },
        { model: db.Product_Packaging, as: "boxed" },
        // Kéo Gốc (Cành)
        {
          model: db.Product,
          as: "product",
          attributes: ["id"],
        },
        {
          model: db.Product_Metadata,
          as: "product_version",
          attributes: ["name", "main_cardimage"],
        },
        {
          model: db.Actor_model,
          as: "QC",
          attributes: [
            "name",
            "role",
            "status",
            "email",
            "phone_number",
            "avatar",
          ],
        },
        {
          model: db.Actor_model,
          as: "QC_manager",
          attributes: [
            "name",
            "role",
            "status",
            "email",
            "phone_number",
            "avatar",
          ],
        },
        {
          model: db.QrRegistry,
          as: "Qr_codes",
        },
      ],
    });

    // 2. LÀM PHẲNG DỮ LIỆU & TỐI ƯU VÒNG LẶP (O(n))
    const RD = {
      pending: [],
      pairing: [],
      completed: [],
      qc_passed: [],
      not_comlate: [],
    };

    for (let i = 0; i < rawBatches.length; i++) {
      const b = rawBatches[i].toJSON();

      // Gom Cành và Lá lại thành object "product" y hệt code cũ để cứu Frontend
      b.product = {
        id: b.product_master?.id || b.product_id,
        name: b.product_version?.name || "Chưa cập nhật tên",
        main_cardimage: b.product_version?.main_cardimage || "",
      };

      delete b.product_master;
      delete b.product_version;

      const status = b.status?.toLowerCase();

      if (status === "pending") {
        RD.pending.push(b);
      } else if (status === "pairing") {
        RD.pairing.push(b);
      } else if (status === "completed" && b.is_boxed) {
        RD.completed.push(b);
      } else if (status === "qc_passed") {
        RD.qc_passed.push(b);
      } else if (status === "not_completed") {
        RD.not_comlate.push(b);
      }
    }

    return res.status(200).json({
      RM: "Lấy dữ liệu lô hàng thành công!",
      RC: 200,
      RD: RD,
    });
  } catch (error) {
    console.error("getCompletedBatches Error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const getQCReadyBatches = (db) => async (req, res) => {
  try {
    const author = req?.user?.company_id;
    if (!author) {
      return res.status(400).json({
        RM: "Thiếu dữ liệu!",
        RC: -203,
      });
    }

    // 1. Phân trang (Pagination)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;

    // 2. Lọc theo trạng thái (Frontend có thể gọi ?status=QC_checking)
    const requestedStatus = req.query.status;
    const allowedStatuses = ["QC_checking", "QC_passed", "QC_failed"];
    const statusFilter = allowedStatuses.includes(requestedStatus)
      ? requestedStatus
      : allowedStatuses;

    const { count, rows } = await db.product_batch.findAndCountAll({
      where: {
        status: statusFilter,
        author,
      },
      limit: limit,
      offset: offset,
      order: [["updatedAt", "DESC"]],
      include: [
        {
          model: db.Department,
          as: "Department",
        },
        {
          model: db.Product,
          as: "product",
          attributes: ["id", "author", "type"],
          include: [
            {
              model: db.Product_Metadata,
              as: "versions",
              where: { is_latest: true },
              attributes: ["name", "main_cardimage"],
              required: false,
            },
          ],
        },
        {
          model: db.Actor_model,
          as: "QC",
          attributes: [
            "id",
            "name",
            "phone_number",
            "email",
            "avatar",
            "status",
          ],
        },
      ],
    });

    const flattenedRows = rows.map((batch) => {
      const batchJson = batch.toJSON();

      if (
        batchJson.product &&
        batchJson.product.versions &&
        batchJson.product.versions.length > 0
      ) {
        const metadata = batchJson.product.versions[0];

        batchJson.product.name = metadata.name;
        batchJson.product.main_cardimage = metadata.main_cardimage;

        delete batchJson.product.versions;
      } else if (batchJson.product) {
        batchJson.product.name = "Chưa có dữ liệu phiên bản";
        batchJson.product.main_cardimage = null;
        delete batchJson.product.versions;
      }

      return batchJson;
    });

    return res.status(200).json({
      RM: "Lấy batch sẵn sàng QC thành công!",
      RC: 200,
      RD: flattenedRows,
      Meta: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        limit: limit,
      },
    });
  } catch (error) {
    console.error("getQCReadyBatches Error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const getInternalMarketInfo = (db) => async (req, res) => {
  try {
    const company_id = req?.user?.company_id;
    let myMarketProfile = null;
    if (company_id) {
      myMarketProfile = await db.Company_market_info.findOne({
        where: { company_id },
        include: [
          {
            model: db.Manufacturer,
            as: "manufacturer_info",
            require: false,
            include: [
              {
                model: db.Production_Sector,
                as: "production_sectors",
                through: { attributes: [] },
              },
            ],
          },
          {
            model: db.Distributor,
            as: "distributor_info",
            require: false,
            include: [
              {
                model: db.Production_Sector,
                as: "production_sectors",
                through: { attributes: [] },
              },
            ],
          },
          {
            model: db.Retailer,
            as: "retailer_info",
            require: false,
            include: [
              {
                model: db.Production_Sector,
                as: "production_sectors",
                through: { attributes: [] },
              },
            ],
          },
          {
            model: db.Transporter,
            as: "transporter_info",
            require: false,
            include: [
              {
                model: db.Production_Sector,
                as: "production_sectors",
                through: { attributes: [] },
              },
            ],
          },
        ],
      });
    }

    const company_Sectors = await db.Production_Sector.findAll();

    const allMarketPartners = await db.Company_market_info.findAll({
      where: { is_active_market: true },
      include: [
        {
          model: db.Manufacturer,
          as: "manufacturer_info",
          include: [
            {
              model: db.Production_Sector,
              as: "production_sectors",
              through: { attributes: [] },
            },
          ],
        },
        {
          model: db.Distributor,
          as: "distributor_info",
          include: [
            {
              model: db.Production_Sector,
              as: "production_sectors",
              through: { attributes: [] },
            },
          ],
        },
        {
          model: db.Retailer,
          as: "retailer_info",
          include: [
            {
              model: db.Production_Sector,
              as: "production_sectors",
              through: { attributes: [] },
            },
          ],
        },
        {
          model: db.Transporter,
          as: "transporter_info",
          include: [
            {
              model: db.Production_Sector,
              as: "production_sectors",
              through: { attributes: [] },
            },
          ],
        },
      ],
      order: [["rating_avg", "DESC"]],
    });

    return res.status(200).json({
      RM: "Lấy dữ liệu Marketplace thành công!",
      RC: 200,
      RD: {
        myProfile: myMarketProfile,
        partners: allMarketPartners,
        company_Sectors,
      },
    });
  } catch (error) {
    console.error("Marketplace Error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
      RD: error.message,
    });
  }
};

const newInternalMarketinfo = (db) => async (req, res) => {
  const logoFile = req.files?.logo ? req.files.logo[0] : null;
  const bannerFile = req.files?.banner ? req.files.banner[0] : null;
  const allFiles = [...(req.files?.logo || []), ...(req.files?.banner || [])];

  const company_id = req?.user?.company_id;
  const company_type = req?.user?.role;

  if (!company_id || !company_type) {
    cleanupUploadedFiles(allFiles);
    return res
      .status(400)
      .json({ RC: -203, RM: "Không xác định được danh tính doanh nghiệp!" });
  }

  const {
    slug,
    slogan,
    description,
    is_oem_ready,
    is_active_market,
    social_links,
  } = req.body;

  if (!slug) {
    cleanupUploadedFiles(allFiles);
    return res
      .status(400)
      .json({ RC: -203, RM: "Vui lòng nhập đường dẫn định danh (Slug)!" });
  }

  const t = await db.sequelize.transaction();
  try {
    const existingProfile = await db.Company_market_info.findOne({
      where: { company_id },
    });

    const marketData = {
      slug,
      slogan,
      description,
      is_oem_ready: is_oem_ready === "true",
      is_active_market: is_active_market === "true",
      social_links: social_links ? JSON.parse(social_links) : {},
      company_id,
      company_type,
    };

    if (logoFile) marketData.logo_url = logoFile.filename;
    if (bannerFile) marketData.banner_url = bannerFile.filename;

    let result;
    if (existingProfile) {
      result = await existingProfile.update(marketData, { transaction: t });
      req.ai_mapped_payload = existingProfile.toJSON();
    } else {
      result = await db.Company_market_info.create(marketData, {
        transaction: t,
      });
    }

    await t.commit();

    return res.status(200).json({
      RC: 200,
      RM: existingProfile
        ? "Cập nhật hồ sơ thành công!"
        : "Khởi tạo hồ sơ Marketplace thành công!",
      RD: result,
    });
  } catch (error) {
    await t.rollback();
    cleanupUploadedFiles(allFiles);
    console.error("Save Market Info Error:", error);

    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(400)
        .json({ RC: -1, RM: "Đường dẫn định danh (Slug) đã tồn tại!" });
    }

    return res.status(500).json({ RC: 500, RM: "Lỗi hệ thống khi lưu hồ sơ!" });
  }
};

const getCompanyPolicy = (db) => async (req, res) => {
  try {
    const company_id = req?.user?.company_id;
    if (!company_id) {
      return res
        .status(400)
        .json({ RC: -203, RM: "Không xác định được danh tính doanh nghiệp!" });
    }
    const policy_list = await db.Company_Policy.findAll({
      where: {
        company_id: company_id,
      },
    });

    return res.status(200).json({
      RC: 200,
      RM: "thông tin điều khoản doanh nghiệp",
      RD: policy_list,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ RC: 500, RM: "Lỗi hệ thống khi lấy điều khoản!" });
  }
};

const newPolicy = (db) => async (req, res) => {
  const file = req.file;
  try {
    const { type, content, is_active } = req.body;

    const company_id = req?.user?.company_id;
    if (!company_id) {
      cleanupSingleFile(file);
      return res
        .status(400)
        .json({ RC: -203, RM: "Không xác định được danh tính doanh nghiệp!" });
    }

    if (!type || !content) {
      cleanupSingleFile(file);
      return res.status(400).json({
        RC: -1,
        RM: "Vui lòng nhập đầy đủ loại và nội dung điều khoản!",
      });
    }

    const lastPolicy = await db.Company_Policy.findOne({
      where: { company_id, policy_type: type },
      order: [["version", "DESC"]],
    });

    const nextVersion = lastPolicy ? lastPolicy.version + 1 : 1;

    if (String(is_active) === "true") {
      await db.Company_Policy.update(
        { is_active: false },
        { where: { company_id, policy_type: type } },
      );
    }

    const policy = await db.Company_Policy.create({
      company_id,
      policy_type: type,
      content,
      version: nextVersion,
      is_active: String(is_active) === "true",
      pdf_file_url: file ? file.filename : null,
    });

    return res.status(200).json({
      RC: 200,
      RM: "Công bố điều khoản doanh nghiệp thành công!",
      RD: policy,
    });
  } catch (error) {
    console.error("Error at newPolicy:", error);
    cleanupSingleFile(file);
    return res
      .status(500)
      .json({ RC: 500, RM: "Lỗi hệ thống khi tạo điều khoản!" });
  }
};

const new_proposal = (db) => async (req, res) => {
  const file = req.file;
  try {
    const {
      message,
      collaboration_type,
      sender_contact_name,
      sender_contact_phone,
      sender_contact_email,
      receiver_type,
      receiver_id,
      receiver_company_name,
    } = req.body;

    const sender_company_id = req?.user?.company_id;

    if (!sender_company_id || !receiver_id) {
      cleanupSingleFile(file);
      return res
        .status(400)
        .json({ RC: 400, RM: "Thiếu thông tin định danh công ty!" });
    }

    const roleToModel = {
      manufacturer: "Manufacturer",
      distributor: "Distributor",
      retailer: "Retailer",
      transporter: "Transporter",
    };

    const roletoType = {
      manufacturer: "MANUFACTURER",
      distributor: "DISTRIBUTOR",
      retailer: "RETAILER",
      transporter: "TRANSPOSRTER",
    };

    const modelName = roleToModel[req?.user?.role];

    if (!modelName || !db[modelName]) {
      cleanupSingleFile(file);
      return res.status(403).json({ RC: 403, RM: "Role không hợp lệ!" });
    }

    const sender_company = await db[modelName].findByPk(sender_company_id);

    if (!sender_company) {
      cleanupSingleFile(file);
      return res
        .status(404)
        .json({ RC: 404, RM: "Không tìm thấy thông tin công ty gửi!" });
    }

    const contactExists = await db.Company_Collaboration.findOne({
      where: {
        receiver_id,
        sender_id: sender_company_id,
      },
    });

    if (contactExists) {
      cleanupSingleFile(file);
      return res.status(404).json({
        RC: 404,
        RM: "Đã tồn tại hợp tác với công ty này hoặc đã tồn tại yêu cầu hợp tác!",
      });
    }
    const sender_company_name = sender_company.company_name;

    if (!sender_company_name) {
      cleanupSingleFile(file);
      return res
        .status(400)
        .json({ RC: 400, RM: "Thiếu thông tin định danh tên công ty!" });
    }

    const proposalData = {
      sender_id: sender_company_id,
      sender_company_name,
      sender_contact_name,
      sender_contact_phone,
      sender_contact_email,
      receiver_id,
      sender_type: roleToModel[req?.user?.role],
      receiver_type: roleToModel[receiver_type],
      receiver_company_name,
      status: "pending",
      proposal_message: message,
      collaboration_type: collaboration_type,
      attached_profile_url: file ? file.filename : null,
      onchain_status: "off-chain",
    };

    const result = await db.Company_Collaboration.create(proposalData);

    const noti = await db.Notification.create({
      Owner_id: result?.receiver_id || receiver_id,
      noitfi_level: 4,
      linkToAction: `/Products/policy/contact_request?highline=${result.id}&openModal=false`,
      status: "unread",
      message: `Yêu cầu hợp tác mời từ công ty ${sender_company_name} `,
    });

    await NotificationService.sendSmartNotification(
      noti?.id,
      result?.receiver_id || receiver_id,
      "customer",
      `Yêu cầu hợp tác mời từ công ty ${sender_company_name} `,
      [],
      "order_completed",
      "level_4",
      `/Products/policy/contact_request?highline=${result.id}&openModal=false`,
    );

    return res.status(200).json({
      RC: 200,
      RM: "Gửi lời mời hợp tác thành công!",
      RD: result,
    });
  } catch (error) {
    cleanupSingleFile(file);
    console.error("Error at new_proposal:", error);
    return res
      .status(500)
      .json({ RC: 500, RM: "Lỗi hệ thống khi tạo yêu cầu!" });
  }
};

const getNotification = (db) => async (req, res) => {
  try {
    const { company_id, level, id } = req.user;

    if (!company_id) {
      return res
        .status(400)
        .json({ RC: -203, RM: "Không xác định được doanh nghiệp!" });
    }

    const levelPart = level?.includes("_") ? level.split("_")[1] : level;
    const userLevelThreshold = parseInt(levelPart);
    const countAll = await db.Notification.count({
      where: { Owner_id: company_id },
    });

    const allowedLevels = Array.from({ length: userLevelThreshold }, (_, i) =>
      (i + 1).toString(),
    );

    const notifications = await db.Notification.findAll({
      where: {
        Owner_id: company_id,
        [Op.or]: [
          { target_actor: { [Op.is]: null } },
          { target_actor: { [Op.like]: `%${id}%` } },
        ],
        status: {
          [Op.or]: [{ [Op.ne]: "delete" }, { [Op.is]: null }],
        },
        noitfi_level: {
          [Op.in]: allowedLevels,
        },
      },
      attributes: [
        "id",
        "message",
        "linkToAction",
        "status",
        "createdAt",
        "target_actor",
      ],
      order: [["createdAt", "DESC"]],
      limit: 20,
    });

    return res.status(200).json({
      RC: 200,
      RM: "Thông báo",
      RD: notifications,
    });
  } catch (error) {
    console.error("!!! Error at getNotification:", error);
    return res.status(500).json({ RC: 500, RM: "Lỗi hệ thống!" });
  }
};

const fetchCollaborationProposals = (db) => async (req, res) => {
  try {
    const { company_id } = req.user;

    if (!company_id) {
      return res
        .status(400)
        .json({ RC: -203, RM: "Không xác định được doanh nghiệp!" });
    }

    const commonAttributes = [
      "id",
      "company_name",
      "contact_person",
      "status",
      "chain_status",
      "location",
      "latitude",
      "latitude",
      "address_detail",
    ];

    const includeReceiver = [
      {
        model: db.Manufacturer,
        as: "receiver_m",
        required: false,
        attributes: [...commonAttributes, "production_capacity", "location"],
      },
      {
        model: db.Distributor,
        as: "receiver_d",
        required: false,
        attributes: [...commonAttributes, "delivery_capacity"],
      },
      {
        model: db.Retailer,
        as: "receiver_r",
        required: false,
        attributes: [...commonAttributes, "store_address", "branch_count"],
      },
      {
        model: db.Transporter,
        as: "receiver_t",
        required: false,
        attributes: [...commonAttributes, "fleet_count", "operation_area"],
      },
    ];

    const includeSender = [
      {
        model: db.Manufacturer,
        as: "sender_m",
        required: false,
        attributes: [...commonAttributes, "production_capacity", "location"],
      },
      {
        model: db.Distributor,
        as: "sender_d",
        required: false,
        attributes: [...commonAttributes, "delivery_capacity"],
      },
      {
        model: db.Retailer,
        as: "sender_r",
        required: false,
        attributes: [...commonAttributes, "store_address", "branch_count"],
      },
      {
        model: db.Transporter,
        as: "sender_t",
        required: false,
        attributes: [...commonAttributes, "fleet_count", "operation_area"],
      },
    ];

    const receiver_CollaborationProposals =
      await db.Company_Collaboration.findAll({
        where: { receiver_id: company_id },
        include: [
          ...includeSender,
          {
            model: db.ContractTemplate,
            as: "contract_template",
          },
        ],
        order: [["createdAt", "DESC"]],
      });

    const sender_CollaborationProposals =
      await db.Company_Collaboration.findAll({
        where: { sender_id: company_id },
        include: [
          ...includeReceiver,
          {
            model: db.ContractTemplate,
            as: "contract_template",
          },
        ],
        order: [["createdAt", "DESC"]],
      });

    return res.status(200).json({
      RC: 200,
      RM: "Thành công",
      RD: { receiver_CollaborationProposals, sender_CollaborationProposals },
    });
  } catch (error) {
    console.error("Error at fetchCollaborationProposals:", error);
    return res.status(500).json({ RC: 500, RM: "Lỗi hệ thống!" });
  }
};

const cancelProposal = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { proposal_id } = req.params;
    const { company_id } = req.user;

    if (!proposal_id) {
      return res
        .status(400)
        .json({ RC: 400, RM: "Thiếu thông tin xác thực yêu cầu!" });
    }

    const proposal = await db.Company_Collaboration.findOne({
      where: {
        id: proposal_id,
        sender_id: company_id,
      },
    });

    if (!proposal) {
      return res.status(404).json({
        RC: 404,
        RM: "Không tìm thấy yêu cầu hoặc bạn không có quyền thực hiện!",
      });
    }

    const cancelableStatuses = [
      "pending",
      "accepted",
      "negotiating",
      "negotiating_acp",
      "negotiating_rej",
      "signing",
    ];

    if (!cancelableStatuses.includes(proposal.status)) {
      return res.status(400).json({
        RC: 400,
        RM: `Không thể hủy yêu cầu đã ở trạng thái: ${proposal.status.toUpperCase()}`,
      });
    }
    await proposal.update(
      {
        status: "canceled",
      },
      { transaction: t },
    );
    req.ai_mapped_payload = proposal.toJSON();
    await t.commit();
    return res.status(200).json({
      RC: 200,
      RM: "Đã thu hồi yêu cầu hợp tác thành công!",
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("Error at cancelProposal:", error);
    return res
      .status(500)
      .json({ RC: 500, RM: "Lỗi hệ thống khi xử lý hủy yêu cầu!" });
  }
};

const RejectProposal = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { proposal_id } = req.params;
    const { company_id } = req.user;

    if (!proposal_id) {
      return res
        .status(400)
        .json({ RC: 400, RM: "Thiếu thông tin xác thực yêu cầu!" });
    }

    const proposal = await db.Company_Collaboration.findOne({
      where: {
        id: proposal_id,
        receiver_id: company_id,
      },
    });

    if (!proposal) {
      return res.status(404).json({
        RC: 404,
        RM: "Không tìm thấy yêu cầu hoặc bạn không có quyền thực hiện!",
      });
    }

    if (proposal.status !== "pending") {
      return res.status(400).json({
        RC: 400,
        RM: `Không thể từ chối yêu cầu đã ở trạng thái: ${proposal.status.toUpperCase()}`,
      });
    }

    await proposal.update(
      {
        status: "rejected",
      },
      { transaction: t },
    );
    req.ai_mapped_payload = proposal.toJSON();
    const noti = await db.Notification.create(
      {
        Owner_id: proposal.sender_id,
        noitfi_level: "4",
        message: `Công ty ${proposal.receiver_company_name} đã từ chối lời mời hợp tác.`,
        linkToAction: `/Products/policy/contact_request?highline=${proposal.id}&openModal=true`,
        status: "unread",
      },
      { transaction: t },
    );
    await t.commit();

    await NotificationService.sendSmartNotification(
      noti?.id,
      proposal.sender_id,
      "customer",
      `Công ty ${proposal.receiver_company_name} đã từ chối lời mời hợp tác.`,
      [],
      "contract_reject",
      "level_4",
      `/Products/policy/contact_request?highline=${proposal.id}&openModal=true`,
    );

    return res.status(200).json({
      RC: 200,
      RM: "Đã từ chối yêu cầu hợp tác thành công!",
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("Error at cancelProposal:", error);
    return res
      .status(500)
      .json({ RC: 500, RM: "Lỗi hệ thống khi xử lý từ chối yêu cầu!" });
  }
};

const getContract = (db) => async (req, res) => {
  try {
    const { company_id } = req.user;

    if (!company_id) {
      return res
        .status(400)
        .json({ RC: 400, RM: "Không tìm thấy thông tin doanh nghiệp!" });
    }

    const companyContracts = await db.ContractTemplate.findAll({
      where: {
        is_active: true,
        Owner: company_id,
      },
      order: [["created_at", "DESC"]],
    });

    return res.status(200).json({
      RC: 200,
      RM: "Tải danh sách mẫu hợp đồng thành công!",
      RD: companyContracts,
    });
  } catch (error) {
    console.error("Error at getContract:", error);
    return res.status(500).json({
      RC: 500,
      RM: "Lỗi hệ thống khi truy xuất mẫu hợp đồng!",
    });
  }
};

const createContractTemplate = (db) => async (req, res) => {
  const file = req?.file;
  try {
    const { company_id, id } = req.user;
    const { template_name, collaboration_type, content_html, is_active } =
      req.body;

    if (!company_id) {
      if (file) cleanupSingleFile(file);
      return res
        .status(400)
        .json({ RC: 400, RM: "Không tìm thấy thông tin doanh nghiệp!" });
    }

    if (!file && !content_html) {
      if (file) cleanupSingleFile(file);
      return res
        .status(400)
        .json({ RC: 400, RM: "Vui lòng nhập đầy đủ tên và nội dung mẫu!" });
    }
    if (!template_name) {
      if (file) cleanupSingleFile(file);
      return res
        .status(400)
        .json({ RC: 400, RM: "Vui lòng nhập đầy đủ tên và nội dung mẫu!" });
    }

    const shortId = uuidv4().split("-")[0].toUpperCase();
    const customId = `TEMP_${collaboration_type.substring(0, 3)}_${shortId}`;

    const newTemplate = await db.ContractTemplate.create({
      id: customId,
      template_name: template_name,
      collaboration_type: collaboration_type,
      Owner: company_id,
      content_html: content_html || "",
      pdf_file: file ? file.filename : null,
      is_active: is_active === "true" || is_active === true,
      created_by: id,
      version: "1.0.0",
    });

    return res.status(200).json({
      RC: 200,
      RM: "Công bố mẫu hợp đồng thành công!",
      RD: newTemplate,
    });
  } catch (error) {
    console.error("Error at createContractTemplate:", error);
    if (file) cleanupSingleFile(file);
    return res.status(500).json({
      RC: 500,
      RM: "Lỗi hệ thống khi tạo mẫu hợp đồng!",
    });
  }
};

const acceptProposal = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { proposal_id } = req?.params;
    const { company_id } = req?.user;
    const SERVER_SECRET =
      process.env.CONTRACT_SECRET_KEY || "AWS_SUPPLY_CHAIN_PRIVATE_KEY_2026";

    const proposal_contract =
      await db.Company_Collaboration.findByPk(proposal_id);
    if (!proposal_contract) {
      return res.status(404).json({ RC: 404, RM: "Không tìm thấy hợp đồng!" });
    }

    if (proposal_contract.receiver_id !== company_id) {
      return res
        .status(403)
        .json({ RC: 403, RM: "Bạn không có quyền chấp nhận yêu cầu này!" });
    }
    if (proposal_contract.status !== "pending") {
      return res.status(400).json({
        RC: 400,
        RM: `Yêu cầu đang ở trạng thái '${proposal_contract.status}'!`,
      });
    }

    const dataToHash = JSON.stringify({
      id: proposal_contract.id,
      sender: proposal_contract.sender_id,
      receiver: proposal_contract.receiver_id,
      type: proposal_contract.collaboration_type,
      message: proposal_contract.proposal_message,
      timestamp: new Date().toISOString(),
    });

    const secureNdaHash = crypto
      .createHmac("sha256", SERVER_SECRET)
      .update(dataToHash)
      .digest("hex");

    await proposal_contract.update(
      {
        status: "accepted",
        accepted_at: new Date(),
        nda_hash: secureNdaHash,
      },
      { transaction: t },
    );

    const noti = await db.Notification.create(
      {
        Owner_id: proposal_contract.sender_id,
        Actor_id: company_id,
        noitfi_level: "4",
        message: `Công ty ${proposal_contract.receiver_company_name} đã chấp nhận lời mời hợp tác.`,
        linkToAction: `/Products/policy/contact_request?highline=${proposal_contract.id}&openModal=true`,
        status: "unread",
      },
      { transaction: t },
    );

    await t.commit();

    broadcastNotification(
      noti?.id,
      proposal_contract.sender_id,
      "Yêu cầu hợp tác được chấp nhận!",
      "/",
      "proposal_accepted",
      "unread",
      `level_4`,
    );

    return res.status(200).json({
      RC: 200,
      RM: "Đã chấp nhận thương thảo và khởi tạo mã băm bảo mật NDA.",
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("Accept Proposal Error:", error);
    return res.status(500).json({ RC: 500, RM: "Lỗi hệ thống!" });
  }
};
const sendContract = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { proposal_id } = req?.params;
    const { company_id } = req?.user;
    const { template_id } = req?.body;

    if (!proposal_id || !company_id || !template_id) {
      return res
        .status(400)
        .json({ RC: 400, RM: "Thiếu thông tin định danh!" });
    }

    const proposal_contract =
      await db.Company_Collaboration.findByPk(proposal_id);

    if (!proposal_contract) {
      return res
        .status(404)
        .json({ RC: 404, RM: "Không tìm thấy yêu cầu hợp tác!" });
    }

    const isReceiver = proposal_contract.receiver_id === company_id;
    const target_id = isReceiver
      ? proposal_contract.sender_id
      : proposal_contract.receiver_id;

    if (proposal_contract.status !== "accepted") {
      return res.status(400).json({
        RC: 400,
        RM: `Yêu cầu đang ở trạng thái '${proposal_contract.status}', không thể gửi hợp đồng!`,
      });
    }

    const template = await db.ContractTemplate.findOne({
      where: { Owner: company_id, id: template_id },
    });

    if (!template) {
      return res
        .status(404)
        .json({ RC: 404, RM: "Không tìm thấy mẫu hợp đồng này!" });
    }

    await proposal_contract.update(
      {
        status: "negotiating",
        contract_id: template.id,
      },
      { transaction: t },
    );

    const noti = await db.Notification.create(
      {
        Owner_id: target_id,
        Actor_id: company_id,
        noitfi_level: "4",
        message: `Đối tác đã gửi dự thảo hợp đồng: ${template.template_name}`,
        linkToAction: `/Products/policy/contact_request?highline=${proposal_contract.id}&openModal=true`,
        status: "unread",
      },
      { transaction: t },
    );

    await t.commit();

    broadcastNotification(
      noti?.id,
      target_id,
      `Nhận được dự thảo hợp đồng mới từ đối tác.`,
      "/",
      "new_contract_proposal",
      "unread",
      `level_4`,
    );

    return res.status(200).json({
      RC: 200,
      RM: "Gửi dự thảo hợp đồng thành công! Đang chờ đối tác phản hồi.",
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("Send Contract Error:", error);
    return res
      .status(500)
      .json({ RC: 500, RM: "Lỗi hệ thống khi gửi hợp đồng!" });
  }
};

const AcceptsendContract = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { proposal_id } = req?.params;
    const { company_id } = req?.user;

    if (!proposal_id || !company_id) {
      return res
        .status(400)
        .json({ RC: 400, RM: "Thiếu thông tin định danh!" });
    }

    const proposal_contract =
      await db.Company_Collaboration.findByPk(proposal_id);

    if (!proposal_contract) {
      return res
        .status(404)
        .json({ RC: 404, RM: "Không tìm thấy yêu cầu hợp tác!" });
    }

    const isReceiver = proposal_contract.receiver_id === company_id;
    const target_id = isReceiver
      ? proposal_contract.sender_id
      : proposal_contract.receiver_id;

    if (
      proposal_contract.status !== "negotiating" &&
      proposal_contract.status !== "negotiating_rej"
    ) {
      return res.status(400).json({
        RC: 400,
        RM: `Yêu cầu đang ở trạng thái '${proposal_contract.status}', không thể thay đổi hợp đồng!`,
      });
    }

    await proposal_contract.update(
      {
        status: "negotiating_acp",
      },
      { transaction: t },
    );

    const noti = await db.Notification.create(
      {
        Owner_id: target_id,
        Actor_id: company_id,
        noitfi_level: "4",
        message: `Đối tác đã chấp nhận hợp đồng `,
        linkToAction: `/Products/policy/contact_request?highline=${proposal_contract.id}&openModal=true`,
        status: "unread",
      },
      { transaction: t },
    );

    await t.commit();

    await NotificationService.sendSmartNotification(
      noti?.id,
      target_id,
      "customer",
      `Đối tác đã chấp nhận hợp đồng `,
      [],
      "contract_accepted",
      "level_4",
      `/Products/policy/contact_request?highline=${proposal_contract.id}&openModal=true`,
    );

    return res.status(200).json({
      RC: 200,
      RM: "Có thể tiến hành ký kết hợp đồng.",
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("Send Contract Error:", error);
    return res.status(500).json({ RC: 500, RM: "Lỗi hệ thống!" });
  }
};

const RejectsendContract = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { proposal_id } = req?.params;
    const { company_id } = req?.user;

    if (!proposal_id || !company_id) {
      return res
        .status(400)
        .json({ RC: 400, RM: "Thiếu thông tin định danh!" });
    }

    const proposal_contract =
      await db.Company_Collaboration.findByPk(proposal_id);

    if (!proposal_contract) {
      return res
        .status(404)
        .json({ RC: 404, RM: "Không tìm thấy yêu cầu hợp tác!" });
    }

    const isReceiver = proposal_contract.receiver_id === company_id;
    const target_id = isReceiver
      ? proposal_contract.sender_id
      : proposal_contract.receiver_id;

    if (
      proposal_contract.status !== "negotiating" &&
      proposal_contract.status !== "negotiating_acp"
    ) {
      return res.status(400).json({
        RC: 400,
        RM: `Yêu cầu đang ở trạng thái '${proposal_contract.status}', không thể thay đổi hợp đồng!`,
      });
    }

    await proposal_contract.update(
      {
        status: "negotiating_rej",
      },
      { transaction: t },
    );

    const noti = await db.Notification.create(
      {
        Owner_id: target_id,
        Actor_id: company_id,
        noitfi_level: "4",
        message: `Đối tác đã từ chối hợp đồng `,
        linkToAction: `/Products/policy/contact_request?highline=${proposal_contract.id}&openModal=true`,
        status: "unread",
      },
      { transaction: t },
    );

    await t.commit();

    await NotificationService.sendSmartNotification(
      noti?.id,
      target_id,
      "customer",
      `Đối tác đã từ chối hợp đồng `,
      [],
      "contract_reject",
      "level_4",
      `/Products/policy/contact_request?highline=${proposal_contract.id}&openModal=true`,
    );

    return res.status(200).json({
      RC: 200,
      RM: "Đã từ chối hợp đồng.",
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("Send Contract Error:", error);
    return res.status(500).json({ RC: 500, RM: "Lỗi hệ thống!" });
  }
};

const generateFinalContractHash = (proposal, signatures) => {
  const baseData = {
    id: proposal.id,
    sender: proposal.sender_id,
    receiver: proposal.receiver_id,
    contract_id: proposal.contract_id,
    content_hash: proposal.nda_hash,
  };

  const finalPayload = {
    ...baseData,
    signatures: signatures,
  };

  return generateSecureHash(finalPayload);
};

const signContract = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { proposal_id } = req?.params;
    const { company_id } = req?.user;
    const SERVER_SECRET =
      process.env.CONTRACT_SECRET_KEY || "AWS_SUPPLY_CHAIN_PRIVATE_KEY_2026";

    const proposal = await db.Company_Collaboration.findByPk(proposal_id);
    if (!proposal) {
      return res.status(404).json({ RC: 404, RM: "Không tìm thấy yêu cầu!" });
    }

    const currentStatus = proposal.status;
    let updateData = {};
    let signatures = { ...proposal.digital_signatures };

    if (
      currentStatus === "negotiating_acp" &&
      proposal.receiver_id === company_id
    ) {
      signatures[company_id] = {
        role: "RECEIVER",
        signed_at: new Date(),

        hash_proof: crypto
          .createHmac("sha256", SERVER_SECRET)
          .update(`|${proposal_id}|${company_id}|RECEIVER|`)
          .digest("base64"),
      };

      updateData = {
        status: "signing",
        digital_signatures: signatures,
      };
    } else if (
      currentStatus === "signing" &&
      proposal.sender_id === company_id
    ) {
      signatures[company_id] = {
        role: "SENDER",
        signed_at: new Date(),
        hash_proof: crypto
          .createHmac("sha256", SERVER_SECRET)
          .update(`|${proposal_id}|${company_id}|SENDER|`)
          .digest("base64"),
      };

      const finalDataToChain = JSON.stringify({
        proposal_id: proposal.id,
        content_hash: proposal.nda_hash,
        signatures: signatures,
      });

      const finalContractHash = crypto
        .createHmac("sha256", SERVER_SECRET)
        .update(finalDataToChain)
        .digest("hex");

      const txHash = `0x${crypto.randomBytes(32).toString("hex")}`;

      updateData = {
        status: "official",
        digital_signatures: signatures,
        nda_hash: finalContractHash,
        official_at: new Date(),
        blockchain_tx: txHash,
        onchain_status: "pending",
      };
    } else {
      return res.status(400).json({
        RC: 400,
        RM: "Không đúng luồng ký kết hoặc bạn không có quyền thực hiện!",
      });
    }

    await proposal.update(updateData, { transaction: t });

    const target_id =
      company_id === proposal.sender_id
        ? proposal.receiver_id
        : proposal.sender_id;

    const noti = await db.Notification.create(
      {
        Owner_id: target_id,
        Actor_id: company_id,
        noitfi_level: "5",
        message:
          updateData.status === "official"
            ? "Hợp đồng đã chính thức có hiệu lực trên Blockchain!"
            : "Đối tác đã ký hợp đồng, vui lòng ký xác nhận cuối cùng.",
        linkToAction: `/Products/policy/contact_request?highline=${proposal.id}&openModal=true`,
        status: "unread",
      },
      { transaction: t },
    );

    await t.commit();

    await NotificationService.sendSmartNotification(
      noti?.id,
      target_id,
      "customer",
      updateData.status === "official"
        ? "Hợp đồng đã chính thức có hiệu lực trên Blockchain!"
        : "Đối tác đã ký hợp đồng, vui lòng ký xác nhận cuối cùng.",
      [],
      "order_completed",
      "level_4",
      `/Products/policy/contact_request?highline=${proposal.id}&openModal=true`,
    );

    return res.status(200).json({
      RC: 200,
      RM:
        updateData.status === "official"
          ? "Ký kết thành công và đã đồng bộ lên mạng lưới Blockchain!"
          : "Bạn đã ký thành công, đang chờ đối tác xác nhận lần cuối.",
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("Sign Contract Error:", error);
    return res
      .status(500)
      .json({ RC: 500, RM: "Lỗi hệ thống khi thực hiện ký kết!" });
  }
};

const user_uploadavatar = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  const file = req?.file;

  try {
    const { id } = req.user;

    if (!file) {
      if (t) await t.rollback();
      return res
        .status(400)
        .json({ RC: 400, RM: "Vui lòng chọn ảnh đại diện!" });
    }

    const user = await db.Actor_model.findByPk(id, { transaction: t });
    if (!user) {
      if (file) cleanupSingleFile(file);
      await t.rollback();
      return res.status(404).json({ RC: 404, RM: "Người dùng không tồn tại!" });
    }

    const oldAvatarName = user.avatar;
    await user.update({ avatar: file.filename }, { transaction: t });
    await t.commit();

    if (oldAvatarName && oldAvatarName !== "null" && oldAvatarName !== "") {
      const USER_DIR = path.join(__dirname, "../../Access/User_avatar");
      const oldPath = path.join(USER_DIR, oldAvatarName);

      await fs
        .unlink(oldPath)
        .catch((err) =>
          console.warn(
            `[Cleanup] Không tìm thấy file cũ hoặc lỗi xóa, bỏ qua.`,
          ),
        );
    }

    return res.status(200).json({
      RC: 200,
      RM: "Cập nhật ảnh đại diện thành công!",
      data: { avatar: file.filename },
    });
  } catch (error) {
    console.error("Upload Avatar Error:", error);

    if (t && !t.finished) {
      await t.rollback().catch(() => {});
    }

    if (file && file.path) {
      cleanupSingleFile(file);
    }

    return res.status(500).json({
      RC: 500,
      RM: "Lỗi hệ thống khi cập nhật ảnh!",
    });
  }
};

const fecthOEMproduction = (db) => async (req, res) => {
  try {
    const { Op } = db.Sequelize;
    const { id, company_id } = req?.user || {};

    if (!id || !company_id) {
      return res.status(400).json({
        RM: "Thiếu thông tin định danh người dùng hoặc công ty!",
        RC: -203,
      });
    }

    const commonAttributes = [
      "id",
      "company_name",
      "contact_person",
      "status",
      "logo",
      "chain_status",
    ];

    const rawOEMs = await db.Pinned_Products.findAll({
      where: {
        [Op.or]: [{ owner_id: company_id }, { pinner_id: company_id }],
      },
      include: [
        {
          model: db.Manufacturer,
          as: "pinner_m",
          attributes: commonAttributes,
        },
        { model: db.Distributor, as: "pinner_d", attributes: commonAttributes },
        { model: db.Retailer, as: "pinner_r", attributes: commonAttributes },
        { model: db.Transporter, as: "pinner_t", attributes: commonAttributes },

        { model: db.Manufacturer, as: "owner_m", attributes: commonAttributes },
        { model: db.Distributor, as: "owner_d", attributes: commonAttributes },
        { model: db.Retailer, as: "owner_r", attributes: commonAttributes },
        { model: db.Transporter, as: "owner_t", attributes: commonAttributes },

        {
          model: db.Product,
          as: "product_pinner",
          attributes: ["id", "author", "type"],
          include: [
            {
              model: db.Product_Metadata,
              as: "versions",
              where: { is_latest: true },
              required: false,
              attributes: ["name", "main_cardimage", "price", "OEMfile"],
            },
          ],
        },
        {
          model: db.payment_sessions,
          as: "bills",
          include: [
            {
              model: db.Actor_model,
              as: "payer",
              attributes: [
                "id",
                "name",
                "email",
                "phone_number",
                "avatar",
                "status",
              ],
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const OEMs = rawOEMs.map((item) => {
      const plainItem = item.get({ plain: true });
      const isOwner = plainItem.owner_id === company_id;

      const partnerData = isOwner
        ? plainItem.pinner_m ||
          plainItem.pinner_d ||
          plainItem.pinner_r ||
          plainItem.pinner_t
        : plainItem.owner_m ||
          plainItem.owner_d ||
          plainItem.owner_r ||
          plainItem.owner_t;

      if (plainItem.product_pinner) {
        const metadata = plainItem.product_pinner.versions?.[0] || {};
        delete plainItem.product_pinner.versions;
        plainItem.product_pinner = {
          ...plainItem.product_pinner,
          ...metadata,
        };
      }

      const {
        pinner_m,
        pinner_d,
        pinner_r,
        pinner_t,
        owner_m,
        owner_d,
        owner_r,
        owner_t,
        ...cleanItem
      } = plainItem;

      return {
        ...cleanItem,
        is_my_order: isOwner,
        partner_info: partnerData,
      };
    });

    const rawProductions = await db.Product.findAll({
      where: { author: company_id, OEM: true },
      attributes: ["id"],
      include: [
        {
          model: db.Product_Metadata,
          as: "versions",
          where: { is_latest: true },
          required: false,
          attributes: ["name", "main_cardimage", "price"],
        },
      ],
    });

    const productions = rawProductions.map((prod) => {
      const p = prod.toJSON();
      const meta = p.versions?.[0] || {};
      delete p.versions;
      return { ...p, ...meta };
    });

    const partners = await db.Company_Collaboration.findAll({
      where: {
        [Op.or]: [{ sender_id: company_id }, { receiver_id: company_id }],
        collaboration_type: ["OEM Manufacturing", "Comprehensive Partnership"],
        status: "official",
      },
      include: [
        {
          model: db.Manufacturer,
          as: "sender_m",
          attributes: commonAttributes,
        },
        {
          model: db.Manufacturer,
          as: "receiver_m",
          attributes: commonAttributes,
        },
      ],
    });

    const rawPartners = partners
      .map((item) => {
        const isSender = item.sender_id === company_id;
        const partnerData = isSender ? item.receiver_m : item.sender_m;

        return {
          collaboration_id: item.id,
          contract_id: item.contract_id,
          collaboration_type: item.collaboration_type,
          partner_info: partnerData,
        };
      })
      .filter((p) => p.partner_info);

    return res.status(200).json({
      RM: "Lấy dữ liệu thành công!",
      RC: 200,
      RD: { OEMs, productions, rawPartners },
    });
  } catch (error) {
    console.error("Fetch OEM Error:", error);
    return res.status(500).json({
      RC: 500,
      RM: "Lỗi hệ thống khi tải dữ liệu sản xuất!",
    });
  }
};

const editProduct = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  const file = req?.file;

  try {
    const { product_id } = req.params;
    const { status, base_price, OEM, items_per_box, weight } = req.body;

    const product_master = await db.Product.findByPk(product_id, {
      transaction: t,
    });
    if (!product_master) {
      if (file) cleanupSingleFile(file);
      await t.rollback();
      return res.status(404).json({ RC: 404, RM: "Sản phẩm không tồn tại!" });
    }

    const currentMetadata = await db.Product_Metadata.findOne({
      where: { product_id: product_id, is_latest: true },
      transaction: t,
    });

    if (!currentMetadata) {
      if (file) cleanupSingleFile(file);
      await t.rollback();
      return res.status(404).json({
        RC: 404,
        RM: "Không tìm thấy phiên bản hiện hành của sản phẩm!",
      });
    }

    await product_master.update(
      {
        OEM:
          OEM !== undefined
            ? OEM === "true" || OEM === true
            : product_master.OEM,
        items_per_box: items_per_box || product_master.items_per_box,
      },
      { transaction: t },
    );

    await currentMetadata.update({ is_latest: false }, { transaction: t });

    const newMetadataData = {
      product_id: product_id,
      version: currentMetadata.version + 1,
      is_latest: true,
      chain_status: "pending",
      txt_hash: null,

      name: currentMetadata.name,
      description: currentMetadata.description,
      main_cardimage: currentMetadata.main_cardimage,
      responsible_person: currentMetadata.responsible_person,
      weight_type: currentMetadata.weight_type,
      weight: weight || currentMetadata.weight,
      status: status || currentMetadata.status,
      price: base_price ? Number(base_price) : currentMetadata.price,
      OEMfile: file ? file.filename : currentMetadata.OEMfile,
    };

    const newMetadata = await db.Product_Metadata.create(newMetadataData, {
      transaction: t,
    });

    await t.commit();

    req.ai_mapped_payload = { ...newMetadata.toJSON() };

    return res.status(200).json({
      RC: 200,
      RM: `Đã phát hành phiên bản v${newMetadata.version}! Đang chờ duyệt lên Blockchain.`,
      RD: req.ai_mapped_payload,
    });
  } catch (error) {
    console.error("Edit Product Error:", error);
    if (t) await t.rollback().catch(() => {});
    if (file) cleanupSingleFile(file);

    return res.status(500).json({
      RC: 500,
      RM: "Lỗi hệ thống khi cập nhật phiên bản sản phẩm!",
    });
  }
};

const newOEMrequest = (db) => async (req, res) => {
  try {
    const { product_id, partner_id, notes, Quantity, Start_date, End_date } =
      req.body.newOEM;
    const { company_id } = req.user;

    if (!product_id || !partner_id || !Quantity) {
      return res.status(400).json({
        RM: "Thiếu thông tin sản phẩm hoặc đối tác!",
        RC: -203,
      });
    }

    const { Op } = db.Sequelize;

    const Collaboration = await db.Company_Collaboration.findOne({
      where: {
        [Op.or]: [
          {
            [Op.and]: [{ sender_id: company_id }, { receiver_id: partner_id }],
          },
          {
            [Op.and]: [{ sender_id: partner_id }, { receiver_id: company_id }],
          },
        ],
        collaboration_type: {
          [Op.in]: ["Comprehensive Partnership", "OEM Manufacturing"],
        },
        status: "official",
      },
    });

    if (!Collaboration) {
      return res.status(400).json({
        RM: "Hai bên chưa có ký kết hợp tác gia công chính thức!",
        RC: -203,
      });
    }

    const result = await db.Pinned_Products.create({
      Company_Collaboration: Collaboration.id,
      product_id,
      owner_id: partner_id,
      pinner_id: company_id,
      pinner_role: "manufacturer",
      status: "pending",
      End_date,
      Start_date,
      Quantity,
      is_OEM: true,
      notes: notes || "",
    });

    const noti = await db.Notification.create({
      Owner_id: partner_id,
      noitfi_level: "4",
      linkToAction: `/Products/Manufacturer/ORM?highline=${result.id}&openModal=false`,
      status: "unread",
      message: `Bạn có một yêu cầu gia công mới cho sản phẩm ID: ${product_id}`,
    });

    await NotificationService.sendSmartNotification(
      noti?.id,
      partner_id,
      "OEM_production",
      `Bạn có một yêu cầu gia công mới cho sản phẩm ID: ${product_id}`,
      [],
      "production_create",
      "level_4",
      `/Products/Manufacturer/ORM?highline=${result.id}&openModal=false`,
    );

    return res.status(200).json({
      RM: "Gửi yêu cầu gia công thành công!",
      RC: 200,
    });
  } catch (error) {
    console.error("New OEM Request Error:", error);
    return res.status(500).json({
      RM: "Lỗi hệ thống khi tạo yêu cầu!",
      RC: 500,
    });
  }
};

const getValidOEMDepartment = (db) => async (req, res) => {
  try {
    const { Op } = db.Sequelize;
    const author = req?.user?.company_id;

    if (!author) {
      return res.status(400).json({
        RM: "Thiếu dữ liệu định danh công ty!",
        RC: -203,
      });
    }

    const rawDepartments = await db.Department.findAll({
      where: {
        leader_id: { [Op.ne]: null },
        active: true,
        company_id: author,
      },
      include: [
        {
          model: db.ProductionStaff,
          as: "leader",
          attributes: ["id", "name", "avatar"],
        },
        {
          model: db.product_batch,
          as: "batches",
          required: false,
          where: {
            status: ["pending", "in_progress"],
          },
          attributes: [
            "id",
            "batch_name",
            "quantity",
            "manufacture_date",
            "expiry_date",
            "status",
          ],
          include: [
            {
              model: db.Product,
              as: "product",
              attributes: ["id"],
            },
            {
              model: db.Product_Metadata,
              as: "product_version",
              attributes: ["name", "main_cardimage"],
            },
          ],
        },
      ],
    });

    const departments = rawDepartments.map((dept) => {
      const d = dept.toJSON();

      if (d.batches && d.batches.length > 0) {
        d.batches = d.batches.map((batch) => {
          const { product, product_version, ...batchData } = batch;

          return {
            ...batchData,
            product: {
              id: product?.id || "",
              name: product_version?.name || "Chưa cập nhật tên",
              main_cardimage: product_version?.main_cardimage || "",
            },
          };
        });
      }
      return d;
    });

    const productbox = await db.Product_Packaging.findAll({
      where: {
        author: author,
      },
    });

    return res.status(200).json({
      RM: "Lấy bộ phận hợp lệ thành công!",
      RC: 200,
      RD: { departments, productbox },
    });
  } catch (error) {
    console.error("getValidOEMDepartment error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const AcceptingOrder = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();

  try {
    const { company_id, id: actor_id } = req?.user || {};
    const {
      Department_id,
      Pinned_id,
      batch_name,
      description,
      expiry_date,
      isOEM,
      Box_id,
      manufacture_date,
      product_id,
      quantity,
    } = req?.body?.data || {};

    if (
      !Pinned_id ||
      !product_id ||
      !Department_id ||
      !batch_name ||
      !quantity ||
      !manufacture_date ||
      !expiry_date ||
      !Box_id
    ) {
      await t.rollback();
      return res
        .status(400)
        .json({ RM: "Thiếu thông tin bắt buộc để duyệt gia công!", RC: -203 });
    }

    const [pinnedRecord, latestMetadata, box] = await Promise.all([
      db.Pinned_Products.findOne({ where: { id: Pinned_id }, transaction: t }),
      db.Product_Metadata.findOne({
        where: { product_id: product_id, is_latest: true },
        transaction: t,
      }),
      db.Product_Packaging.findByPk(Box_id, { transaction: t }),
    ]);

    if (!pinnedRecord) {
      await t.rollback();
      return res
        .status(404)
        .json({ RM: "Không tìm thấy hồ sơ ghim sản phẩm!", RC: -404 });
    }

    if (!latestMetadata || !box) {
      await t.rollback();
      return res.status(400).json({
        RM: "Sản phẩm (Metadata) hoặc loại bao bì không tồn tại!",
        RC: -400,
      });
    }

    if (
      parseFloat(latestMetadata.weight) > parseFloat(box.max_weight_capacity)
    ) {
      await t.rollback();
      return res.status(400).json({
        RM: "Trọng lượng 1 sản phẩm vượt quá tải trọng của hộp đã chọn!",
        RC: -403,
      });
    }

    const logistics = ((metadata, bx, qty) => {
      const unitW = parseFloat(metadata.weight) || 0;
      const bVol = parseFloat(bx.volume) || 0;
      const tQty = parseInt(qty) || 0;

      const PALLET_W_LIMIT = 1000;
      const PALLET_V_LIMIT = 1.8;

      const itemsPerBox =
        Math.floor(parseFloat(bx.max_weight_capacity) / unitW) || 1;
      const totalBox = Math.ceil(tQty / itemsPerBox);

      const totalWeight = unitW * tQty;
      const totalVolume = totalBox * bVol;

      const finalPallets = Math.ceil(
        Math.max(totalWeight / PALLET_W_LIMIT, totalVolume / PALLET_V_LIMIT),
      );

      return {
        unitWeight: unitW,
        totalWeight: totalWeight.toFixed(2),
        totalBox: totalBox,
        totalPallet: finalPallets,
      };
    })(latestMetadata, box, quantity);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const mfgDate = new Date(manufacture_date);
    let batchStatus = mfgDate > today ? "pending" : "in_progress";

    const newBatch = await db.product_batch.create(
      {
        id: `BATCH_${uuidv4().substring(0, 8).toUpperCase()}`,
        batch_name,
        Department_id,
        product_id: product_id,
        Order_owner: Pinned_id,
        product_metadata_id: latestMetadata.id,
        author: company_id,
        description,
        manufacture_date,
        expiry_date,
        Product_box_model: Box_id,
        isOEM: pinnedRecord.is_OEM,
        status: batchStatus,
        quantity,
        progress_quantity: 0,
        weight_per_unit: logistics.unitWeight,
        total_weight: logistics.totalWeight,
        total_box: logistics.totalBox,
        total_pallet: logistics.totalPallet,
      },
      { transaction: t },
    );

    await db.Pinned_Products.update(
      { status: "active", Product_batch: newBatch.id },
      { where: { id: Pinned_id }, transaction: t },
    );

    const noti = await db.Notification.create(
      {
        Owner_id: pinnedRecord.pinner_id,
        noitfi_level: "4",
        linkToAction: `/Products/Manufacturer/ORM?highline=${pinnedRecord.id}&openModal=true`,
        status: "unread",
        message: `Xưởng đã chấp nhận gia công và khởi tạo lô sản xuất ${newBatch.id}`,
      },
      { transaction: t },
    );

    await t.commit();

    NotificationService.sendSmartNotification(
      noti?.id,
      pinnedRecord.pinner_id,
      "manufacturer",
      `Xưởng đã chấp nhận gia công và khởi tạo lô sản xuất ${newBatch.id}`,
      [],
      "order_accepted",
      "level_4",
      `/Products/Manufacturer/ORM?highline=${pinnedRecord.id}&openModal=true`,
    );

    return res.status(200).json({
      RM: "Đã duyệt gia công và khởi tạo lô sản xuất thành công!",
      RC: 200,
      RD: newBatch,
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("Accept OEM Error:", error);
    return res.status(500).json({
      RM: "Lỗi hệ thống khi duyệt gia công!",
      RC: 500,
      Error: error.message,
    });
  }
};

const updateBatchQuantityApi = (db) => async (req, res) => {
  try {
    const { batch_id, quantity } = req.params;
    const { company_id } = req.user;

    if (!batch_id || quantity === undefined) {
      return res.status(400).json({ RM: "Thiếu dữ liệu cập nhật!", RC: 400 });
    }

    const newQty = parseInt(quantity);
    if (isNaN(newQty) || newQty < 0) {
      return res.status(400).json({ RM: "Số lượng không hợp lệ!", RC: 400 });
    }

    const batch = await db.product_batch.findOne({
      where: {
        id: batch_id,
        author: company_id,
      },
    });

    if (!batch) {
      return res.status(404).json({ RM: "Không tìm thấy lô hàng!", RC: -203 });
    }
    if (newQty > batch.quantity) {
      return res.status(400).json({
        RM: `Số lượng cập nhật (${newQty}) vượt quá kế hoạch (${batch.quantity})!`,
        RC: 400,
      });
    }

    await batch.update({
      progress_quantity: newQty,
      status: newQty >= batch.quantity ? "QC_checking" : "in_progress",
    });

    req.ai_mapped_payload = batch.toJSON();

    return res.status(200).json({
      RM: "Đã ghi nhận tiến độ sản xuất mới",
      RC: 200,
      RD: {
        batch_id: batch.id,
        progress_quantity: newQty,
        status: newQty >= batch.quantity ? "QC_checking" : "in_progress",
      },
    });
  } catch (error) {
    console.error("Update Batch Error:", error);
    return res.status(500).json({ RM: "Lỗi hệ thống!", RC: 500 });
  }
};

const getProposalProduct = (db) => async (req, res) => {
  try {
    const { company_id } = req?.user || {};

    if (!company_id) {
      return res
        .status(400)
        .json({ RM: "Thiếu thông tin định danh!", RC: -203 });
    }

    const collaborations = await db.Company_Collaboration.findAll({
      where: {
        [db.Sequelize.Op.or]: [
          { sender_id: company_id },
          { receiver_id: company_id },
        ],
        collaboration_type: ["Comprehensive Partnership", "Distributor"],
        status: "official",
      },
      attributes: ["sender_id", "receiver_id"],
    });

    if (!collaborations || collaborations.length === 0) {
      return res
        .status(200)
        .json({ RC: 200, RM: "Chưa có đối tác sản xuất nào!", RD: [] });
    }

    const partnerIds = collaborations.map((col) =>
      col.sender_id === company_id ? col.receiver_id : col.sender_id,
    );

    const uniquePartnerIds = [...new Set(partnerIds)];

    const rawProducts = await db.Product.findAll({
      where: {
        author: uniquePartnerIds,
      },
      include: [
        {
          model: db.Product_Metadata,
          as: "versions",
          where: {
            is_latest: true,
            chain_status: "active",
            status: [
              "available",
              "exclusive",
              "pre_order",
              "custom_order",
              "limited_edition",
            ],
          },
          required: true,

          include: [
            {
              model: db.Item_image,
              as: "sub_images",
              attributes: ["id", "image_name", "index"],
              required: false,
            },
          ],
        },
        {
          model: db.Manufacturer,
          as: "manufacturer_info",
          attributes: ["company_name", "logo"],
        },
      ],
    });

    const flattenedProducts = rawProducts.map((prod) => {
      const p = prod.toJSON();
      const metadata = p.versions && p.versions.length > 0 ? p.versions[0] : {};
      delete p.versions;

      return {
        ...p,
        ...metadata,
        id: p.id,
        metadata_id: metadata.id,
      };
    });

    return res.status(200).json({
      RC: 200,
      RM: "Lấy danh sách sản phẩm đối tác thành công",
      RD: flattenedProducts,
    });
  } catch (error) {
    console.error("Get Proposal Product Error:", error);
    return res.status(500).json({ RM: "Lỗi hệ thống!", RC: 500 });
  }
};

const newOrderrequest = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { company_id, role, id } = req?.user || {};
    const { payload } = req.body;

    if (!company_id) {
      return res.status(401).json({ RM: "Phiên đăng nhập hết hạn!", RC: -203 });
    }

    const productId = payload?.product_id;
    const quantity = parseInt(payload?.Quantity);

    if (!productId || !quantity) {
      return res.status(400).json({ RM: "Thiếu thông tin đơn hàng!", RC: 400 });
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existingOrder = await db.Pinned_Products.findOne({
      where: {
        pinner_id: company_id,
        product_id: productId,
        Quantity: quantity,
        status: "pending",
        createdAt: { [db.Sequelize.Op.gte]: fiveMinutesAgo },
      },
      transaction: t,
    });

    if (existingOrder) {
      await t.rollback();
      return res.status(200).json({
        RC: 201,
        RM: "Bạn đã có một đơn hàng tương tự đang chờ thanh toán!",
        RD: existingOrder.payment_code,
      });
    }

    const latestMetadata = await db.Product_Metadata.findOne({
      where: { product_id: productId, is_latest: true },
      attributes: ["id", "price", "version"],
      transaction: t,
    });

    if (!latestMetadata) {
      await t.rollback();
      return res
        .status(404)
        .json({ RM: "Sản phẩm hoặc phiên bản không tồn tại!", RC: 404 });
    }

    const unitPrice = parseFloat(latestMetadata.price);
    const serverTotalPrice = unitPrice * quantity;

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const paymentCode = `ORDERPIN${Date.now().toString().slice(-6)}${randomSuffix}`;

    let minimum_payment_to_start = serverTotalPrice;
    if (payload?.payment_method?.startsWith("DEPOSIT_")) {
      const percent = parseInt(payload?.payment_method?.split("_")[1]);
      minimum_payment_to_start = (serverTotalPrice / 100) * percent;
    }

    const newPinned = await db.Pinned_Products.create(
      {
        product_id: productId,
        metadata_id: latestMetadata.id,
        owner_id: payload.owner_id,
        pinner_id: company_id,
        payment_status: payload.status,
        pinner_role: role,
        Quantity: quantity,
        payment_method: payload.payment_method,
        payment_code: paymentCode,
        total_price: serverTotalPrice,
        debt: serverTotalPrice,
        minimum_payment_to_start: minimum_payment_to_start,
        status: "pending",
        is_OEM: false,
        transaction: t,
      },
      { transaction: t },
    );

    await db.payment_sessions.create(
      {
        order_id: newPinned.id,
        payer_id: company_id,
        receiver_id: payload.owner_id,
        actor_pay_id: id,
        amount_expected: serverTotalPrice,
        status: "pending",
        payment_code: paymentCode,
      },
      { transaction: t },
    );

    const noti = await db.Notification.create(
      {
        Owner_id: payload.owner_id,
        message: `Có đơn hàng mới #${newPinned.id} chờ xác nhận!`,
        linkToAction: `/Products/Manufacturer/ORM?highline=${newPinned.id}&openModal=false`,
        noitfi_level: "4",
      },
      { transaction: t },
    );

    await t.commit();

    NotificationService.sendSmartNotification(
      noti?.id,
      payload.owner_id,
      "manufacturer",
      `Có đơn hàng mới #${newPinned.id} chờ xác nhận!`,
      [],
      "new_order",
      "level_4",
      `/Products/Manufacturer/ORM?highline=${newPinned.id}&openModal=false`,
    );

    return res.status(200).json({
      RC: 200,
      RM: "Gửi yêu cầu đặt hàng thành công!",
      RD: newPinned.payment_code,
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("Create Order Request Error:", error);
    return res.status(500).json({ RM: "Lỗi hệ thống khi tạo đơn!", RC: 500 });
  }
};

const upload_vehicle = (db) => async (req, res) => {
  const mainFiles = req.files?.vehicle_main_avatar || [];
  const subFiles = req.files?.description_img || [];
  const allFiles = [...mainFiles, ...subFiles];
  const company_id = req?.user?.company_id;

  if (!company_id) {
    cleanupUploadedFiles(allFiles);
    return res.status(400).json({ RC: -203, RM: "Thiếu dữ liệu định danh!" });
  }

  const {
    plate_number,
    vin_number,
    vehicle_type,
    capacity,
    vehicle_category,
    notes,
    capacity_unit,
    status,
    current_location_name,
  } = req.body;

  if (
    !plate_number ||
    !vin_number ||
    !capacity ||
    !mainFiles.length ||
    !vehicle_category
  ) {
    cleanupUploadedFiles(allFiles);
    return res
      .status(400)
      .json({ RC: -203, RM: "Vui lòng nhập đầy đủ thông tin bắt buộc!" });
  }

  const t = await db.sequelize.transaction();
  try {
    const vehicle_id = `VEHICLE_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const newVehicle = await db.Vehicle.create(
      {
        id: vehicle_id,
        owner_id: company_id,
        plate_number,
        vin_number,
        vehicle_type,
        vehicle_category,
        capacity,
        notes,
        capacity_unit,
        status,
        current_location_name,
        vehicle_main_avatar: mainFiles[0].filename,
        decription_img: vehicle_id,
        gps_tracking: {},
      },
      { transaction: t },
    );

    if (subFiles.length > 0) {
      const imagePromises = subFiles.map((file, index) => {
        return db.Item_image.create(
          {
            id: `SUBIMG_${Date.now()}_${index}_${Math.floor(Math.random() * 10000)}`,
            image_name: file.filename,
            image_type: "vehicle",
            owner_id: company_id,
            parent_id: vehicle_id,
            url: file.path,
            img_des: `Ảnh mô tả chi tiết của phương tiện ${plate_number}`,
            index: index,
            status: "censored",
          },
          { transaction: t },
        );
      });

      await Promise.all(imagePromises);
    }

    await t.commit();

    return res.status(200).json({
      RC: 200,
      RM: "Đăng ký phương tiện và bộ sưu tập hình ảnh thành công!",
      RD: newVehicle,
    });
  } catch (error) {
    await t.rollback();
    cleanupUploadedFiles(allFiles);

    console.error("Upload Vehicle Error:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        RC: -400,
        RM: "Biển số xe hoặc số khung đã tồn tại trên hệ thống!",
      });
    }

    return res
      .status(500)
      .json({ RC: -500, RM: "Lỗi hệ thống không thể lưu dữ liệu!" });
  }
};

const getAllvehicle = (db) => async (req, res) => {
  try {
    const { company_id } = req?.user;

    if (!company_id) {
      return res
        .status(400)
        .json({ RM: "Thiếu thông tin định danh", RC: -203 });
    }

    const vehicles = await db.Vehicle.findAll({
      where: { owner_id: company_id },
      include: [
        {
          model: db.Item_image,
          as: "sub_images",
          attributes: ["id", "image_name", "url", "img_des", "index"],
          required: false,
        },
        {
          model: db.Actor_model,
          as: "Driver",
          attributes: [
            "id",
            "name",
            "avatar",
            "status",
            "email",
            "phone_number",
          ],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const allDrivers = await db.ProductionStaff.findAll({
      where: {
        role: "driver",
        Company_id: company_id,
      },
      include: [
        { model: db.Department, as: "department" },
        {
          model: db.Actor_model,
          as: "actor_info",
          attributes: [
            "id",
            "name",
            "email",
            "phone_number",
            "avatar",
            "status",
          ],
        },
      ],
    });

    const busyDriverIds = new Set(
      vehicles.filter((v) => v.driver_id !== null).map((v) => v.driver_id),
    );

    const freeDrivers = allDrivers.filter((d) => !busyDriverIds.has(d.id));

    return res.status(200).json({
      RC: 200,
      RM: "Lấy danh sách phương tiện thành công",
      RD: {
        vehicles,
        drivers: freeDrivers,
      },
    });
  } catch (error) {
    console.error("Get All Vehicle Error:", error);
    return res.status(500).json({
      RC: -500,
      RM: "Lỗi hệ thống khi lấy danh sách xe",
    });
  }
};

const getOrphanVehicles = (db) => async (req, res) => {
  try {
    const { company_id } = req?.user;
    if (!company_id) {
      return res
        .status(400)
        .json({ RM: "Thiếu thông tin định danh!", RC: -203 });
    }

    const vehicles = await db.Vehicle.findAll({
      where: {
        owner_id: company_id,
      },
      include: [
        {
          model: db.Fleet,
          through: { attributes: [] },
          required: false,
        },
      ],
    });

    const company_regon = await db.Transporter.findOne({
      where: {
        id: company_id,
      },
      attributes: ["operation_area"],
    });
    const orphanVehicles = vehicles.filter((v) => v.Fleets.length === 0);

    return res.status(200).json({
      RM: "Danh sách xe chưa có đội",
      RC: 200,
      RD: { orphanVehicles, company_regon },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ RM: "Lỗi hệ thống!", RC: 500 });
  }
};

const handleCreateFleetAPI = (db) => async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { company_id } = req?.user;

    const {
      fleet_name,
      fleet_code,
      fleet_type,
      manager_name,
      manager_phone,
      fuel_norm_average,
      monthly_budget,
      operation_area,
      vehicles,
    } = req.body.form;

    if (!fleet_name || !fleet_code) {
      await transaction.rollback();
      return res.status(400).json({ RM: "Thiếu thông tin bắt buộc!", RC: -1 });
    }

    const newFleet = await db.Fleet.create(
      {
        id: `FLEET_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        transporter_id: company_id,
        fleet_name,
        fleet_code,
        fleet_type,
        manager_name,
        manager_phone,
        fuel_norm_average: parseFloat(fuel_norm_average) || 0,
        monthly_budget: parseFloat(monthly_budget) || 0,
        operation_area: operation_area || [],
        status: "active",
      },
      { transaction },
    );

    if (vehicles && vehicles.length > 0) {
      const fleetVehicleData = vehicles.map((v, index) => {
        const vehicleId = typeof v === "object" ? v.id : v;

        return {
          id: `FV_${Date.now()}_${index}_${Math.floor(Math.random() * 100)}`,
          fleet_id: newFleet.id,
          vehicle_id: vehicleId,
          assigned_date: new Date(),
          status: "active",
        };
      });
      await db.Fleet_Vehicle.bulkCreate(fleetVehicleData, { transaction });
    }

    await transaction.commit();

    return res.status(200).json({
      RM: "Tạo đội xe và gán phương tiện thành công!",
      RC: 200,
      RD: newFleet,
    });
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error("Create Fleet Error:", error);

    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(400)
        .json({ RM: "Mã đội xe (Code) đã tồn tại!", RC: -2 });
    }

    return res.status(500).json({ RM: "Lỗi hệ thống!", RC: 500 });
  }
};

const fetchFleet = (db) => async (req, res) => {
  try {
    const { company_id } = req?.user;
    if (!company_id) {
      return res.status(400).json({
        RM: "Thiếu thông tin định danh!",
        RC: -203,
      });
    }

    const fleets = await db.Fleet.findAll({
      where: {
        transporter_id: company_id,
      },
      include: [
        {
          model: db.Vehicle,
          as: "Vehicles",
          through: { attributes: [] },
          attributes: [
            "id",
            "plate_number",
            "vehicle_main_avatar",
            "vehicle_type",
            "vehicle_category",
            "status",
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      RM: "Lấy danh sách đội xe thành công!",
      RC: 200,
      RD: fleets,
    });
  } catch (error) {
    console.error("Fetch Fleet Error:", error);
    return res.status(500).json({
      RM: "Lỗi hệ thống!",
      RC: 500,
    });
  }
};

const Qcresult = (db) => async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { company_id, id } = req?.user;
    const { qc_pass, qc_failed, create_supplement, note, batch_id } =
      req?.body?.qcForm;

    if (qc_pass === undefined || qc_failed === undefined || !batch_id) {
      return res.status(400).json({
        RM: "Dữ liệu không hợp lệ hoặc thiếu thông số kiểm định!",
        RC: -203,
      });
    }

    const parentBatch = await db.product_batch.findOne({
      where: { id: batch_id },
      transaction,
    });

    if (!parentBatch) {
      await transaction.rollback();
      return res.status(404).json({ RM: "Không tìm thấy lô hàng!", RC: -1 });
    }

    await parentBatch.update(
      {
        QC_Pass: qc_pass,
        QC_Failed: qc_failed,
        qc_staff_id: id,
        status: "QC_passed",
        description: note ? `QC Note: ${note}` : parentBatch.description,
      },
      { transaction },
    );

    const qrEntries = [];
    for (let i = 0; i < (parentBatch.total_box || 1); i++) {
      const qr_uuid = uuidv4();
      const secure_token = crypto.randomBytes(16).toString("hex");

      qrEntries.push({
        id: `QR_${Date.now()}_${i}`,
        Author: company_id,
        Actor_created: id,
        target_id: batch_id,
        target_type: "BATCH",
        target_batch: parentBatch.id,
        secure_token: secure_token,
        print_status: "pending",
        status: "pending",
        blockchain_proof: `BOX_INDEX_${i + 1}`,
      });
    }

    await db.QrRegistry.bulkCreate(qrEntries, { transaction });

    let childBatch = null;
    if (create_supplement && qc_failed > 0) {
      const childBatchId = `${batch_id}_SUP_${Date.now().toString().slice(-4)}`;

      childBatch = await db.product_batch.create(
        {
          id: childBatchId,
          batch_name: `${parentBatch.batch_name} (Bù hàng)`,
          Department_id: parentBatch.Department_id,
          product_id: parentBatch.product_id,
          author: company_id,
          description: `Lô bù cho ${qc_failed} sản phẩm lỗi từ lô ${batch_id}`,
          manufacture_date: new Date(),
          expiry_date: parentBatch.expiry_date,
          isOEM: parentBatch.isOEM,
          quantity: qc_failed,
          parent_id: batch_id,
          is_supplement: true,
          status: "in_progress",
        },
        { transaction },
      );
    }

    await transaction.commit();

    return res.status(200).json({
      RM: "Cập nhật dữ liệu QC và tạo lô bù thành công!",
      RC: 200,
      RD: {
        parent_id: batch_id,
        child_id: childBatch?.id || null,
        status: "Pending_Level_4_Review",
      },
    });
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error("Update QC Error:", error);
    return res
      .status(500)
      .json({ RM: "Lỗi hệ thống khi cập nhật lô hàng!", RC: 500 });
  }
};

const complateBatched = (db) => async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { company_id, id } = req?.user;
    const { batch_id } = req?.params;

    if (!company_id || !batch_id) {
      return res.status(400).json({
        RM: "Thiếu thông tin định danh hoặc mã lô hàng!",
        RC: -203,
      });
    }

    const batch = await db.product_batch.findByPk(batch_id, { transaction });

    if (!batch) {
      await transaction.rollback();
      return res.status(404).json({
        RM: "Không tìm thấy lô hàng này trong hệ thống!",
        RC: -404,
      });
    }

    if (batch.status !== "QC_passed") {
      await transaction.rollback();
      return res.status(400).json({
        RM: `Lô hàng đang ở trạng thái ${batch.status}, không thể phê duyệt lên Chain!`,
        RC: -400,
      });
    }

    await batch.update(
      {
        Chain_status: "pending",
        status: "completed",
        qc_manager_id: id,
        is_boxed: true,
        updatedAt: new Date(),
      },
      { transaction },
    );

    await transaction.commit();

    return res.status(200).json({
      RM: "Phê duyệt thành công! Lô hàng đã được đưa vào danh sách chờ lên Blockchain.",
      RC: 200,
      RD: {
        batch_id: batch.id,
        new_status: "pending",
      },
    });
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error("Error in complateBatched:", error);
    return res.status(500).json({
      RM: "Lỗi hệ thống khi phê duyệt lô hàng!",
      RC: 500,
    });
  }
};

const getShipingInfo = (db) => async (req, res) => {
  try {
    const { Op } = db.Sequelize;
    const { company_id } = req?.user;

    if (!company_id)
      return res.status(400).json({ RM: "Thiếu định danh!", RC: -203 });

    const commonAttributes = [
      "id",
      "company_name",
      "logo",
      "location",
      "latitude",
      "longitude",
    ];

    const [
      all_collaborations,
      complate_batched,
      myManufacturer,
      myDistributor,
      myRetailer,
      myTransporter,
    ] = await Promise.all([
      db.Company_Collaboration.findAll({
        where: {
          [Op.or]: [{ sender_id: company_id }, { receiver_id: company_id }],
          status: "official",
        },
        include: [
          {
            model: db.Transporter,
            as: "sender_t",
            attributes: commonAttributes,
            include: [{ model: db.shipping_price_config, as: "base_price" }],
          },
          {
            model: db.Transporter,
            as: "receiver_t",
            attributes: commonAttributes,
            include: [{ model: db.shipping_price_config, as: "base_price" }],
          },
          {
            model: db.Manufacturer,
            as: "sender_m",
            attributes: commonAttributes,
          },
          {
            model: db.Manufacturer,
            as: "receiver_m",
            attributes: commonAttributes,
          },
          {
            model: db.Distributor,
            as: "sender_d",
            attributes: commonAttributes,
          },
          {
            model: db.Distributor,
            as: "receiver_d",
            attributes: commonAttributes,
          },
          { model: db.Retailer, as: "sender_r", attributes: commonAttributes },
          {
            model: db.Retailer,
            as: "receiver_r",
            attributes: commonAttributes,
          },
        ],
      }),
      db.product_batch.findAll({
        where: {
          author: company_id,
          shipping_order_id: null,
          status: "completed",
        },
        order: [["updatedAt", "DESC"]],
      }),
      db.Manufacturer.findByPk(company_id, { attributes: commonAttributes }),
      db.Distributor.findByPk(company_id, { attributes: commonAttributes }),
      db.Retailer.findByPk(company_id, { attributes: commonAttributes }),
      db.Transporter.findByPk(company_id, { attributes: commonAttributes }),
    ]);

    const MyCompany =
      myManufacturer || myDistributor || myRetailer || myTransporter;

    const shipping = [];
    const collaboration = [];

    all_collaborations.forEach((item) => {
      const plain = item.get({ plain: true });
      const isSenderMe = plain.sender_id === company_id;

      const partner = isSenderMe ? plain.receiver_data : plain.sender_data;

      const partnerType = isSenderMe ? plain.receiver_type : plain.sender_type;

      if (!partner) return;

      const cleanItem = {
        id: plain.id,
        sender_id: plain.sender_id,
        sender_type: plain.sender_type,
        receiver_id: plain.receiver_id,
        receiver_type: plain.receiver_type,
        status: plain.status,
        collaboration_type: plain.collaboration_type,
        onchain_status: plain.onchain_status,
        accepted_at: plain.accepted_at,
        official_at: plain.official_at,
        partner_company: {
          id: partner.id,
          company_name: partner.company_name,
          logo: partner.logo,
          location: partner.location,
          latitude: partner.latitude,
          longitude: partner.longitude,
          ...(partner.base_price && { base_price: partner.base_price }),
        },
      };

      if (partnerType === "TRANSPORTER") {
        shipping.push(cleanItem);
      } else {
        collaboration.push(cleanItem);
      }
    });

    return res.status(200).json({
      RM: "Lấy dữ liệu khởi tạo đơn vận thành công!",
      RC: 200,
      RD: {
        data: { MyCompany, shipping, collaboration },
        complate_batched,
      },
    });
  } catch (error) {
    console.error(">>> getShipingInfo Error:", error);
    return res.status(500).json({ RM: "Lỗi hệ thống!", RC: 500 });
  }
};

const sendRequestShiping = (db) => async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { company_id, role, id } = req?.user;
    const {
      shipperId,
      partnerId,
      batchesMap,
      total_ship_price,
      deliveryAddress,
      note,
      distance,
      cost_per_km,
      type_capatry,
      type_delivery,
      payment_method,
      pay_earl_percent,
    } = req?.body;

    const batchesId = batchesMap?.map((item) => item.id) || [];

    if (
      !shipperId ||
      !partnerId ||
      batchesId.length === 0 ||
      !type_capatry ||
      !distance ||
      !total_ship_price ||
      !type_delivery ||
      !payment_method
    ) {
      return res.status(400).json({
        RM: "Thiếu thông tin đối tác hoặc danh sách lô hàng!",
        RC: -203,
      });
    }

    const TableMap = {
      MANUFACTURER: "Manufacturer",
      DISTRIBUTOR: "Distributor",
      RETAILER: "Retailer",
    };
    const sendertable = TableMap[role.toUpperCase()];

    if (!sendertable || !db[sendertable]) {
      return res
        .status(400)
        .json({ RM: "Vai trò người dùng không hợp lệ!", RC: -400 });
    }

    const sender = await db[sendertable].findByPk(company_id);
    const shiper = await db.Transporter.findByPk(shipperId);

    if (!sender)
      return res
        .status(400)
        .json({ RM: "Nhà sản xuất không khả dụng!", RC: -400 });
    if (!shiper)
      return res
        .status(400)
        .json({ RM: "Nhà vận chuyển không khả dụng!", RC: -400 });

    let receiver = await db.Manufacturer.findByPk(partnerId);
    if (!receiver) receiver = await db.Distributor.findByPk(partnerId);
    if (!receiver) receiver = await db.Retailer.findByPk(partnerId);

    if (!receiver) {
      return res
        .status(404)
        .json({ RM: "Không tìm thấy đối tác ở bất kỳ hệ thống nào!", RC: 404 });
    }

    const batches = await db.product_batch.findAll({
      where: { id: batchesId, author: company_id, shipping_order_id: null },
      transaction,
    });

    if (batches.length !== batchesId.length) {
      return res
        .status(400)
        .json({ RM: "Lô hàng không hợp lệ hoặc đã có đơn vận!", RC: -400 });
    }

    let total_product_price = batches.reduce(
      (sum, b) => sum + parseFloat(b.total_price || 0),
      0,
    );
    let total_weight = batches.reduce(
      (sum, b) => sum + parseFloat(b.total_weight || 0),
      0,
    );
    const totalQty = batches.reduce(
      (sum, b) => sum + (Number(b.QC_Pass) || 0),
      0,
    );

    const orderId = `SHIP_${Date.now()}`;

    const ship = await db.shipping_order.create(
      {
        id: orderId,
        sender_id: company_id,
        customer_id: partnerId,
        shipping_partner: shipperId,
        total_quantity: totalQty,
        payment_method,
        total_ship_price,
        amount_ship_received: 0,
        minimum_payment_to_start: (total_ship_price / 100) * pay_earl_percent,
        deposit_ship_percent: pay_earl_percent,
        total_weight,
        start_lat: sender.latitude,
        start_lng: sender.longitude,
        start_add: sender.location,
        target_lat: receiver.latitude,
        target_lng: receiver.longitude,
        target_add: receiver.location,
        onchain_status: "agreement_pending",
        distance,
        debt: total_ship_price,
        delivery_address: deliveryAddress || "Theo hợp đồng",
        status: "proposed",
        sender_confirm: "confirmed",
        receiver_confirm: "pending",
        transporter_confirm: "pending",
        cost_per_km,
        type_capatry,
        product_total_price: total_product_price,
        type_delivery,
        note: note || "",
        Location_last_update: new Date(),
        payment_status: "unpaid",
      },
      { transaction },
    );

    await db.product_batch.update(
      { shipping_order_id: orderId, Shiping_status: "pending" },
      { where: { id: batchesId }, transaction },
    );

    const shipSuffix = Math.floor(1000 + Math.random() * 9000);
    const shipPaymentCode = `SHIPPIN${Date.now().toString().slice(-6)}${shipSuffix}`;

    const pay = await db.payment_sessions.create(
      {
        ship_id: ship.id,
        payer_id: company_id,
        actor_pay_id: id,
        receiver_id: ship.shipping_partner,
        amount_expected: total_ship_price,
        status: "pending",
        payment_code: shipPaymentCode,
        payment_method: payment_method,
      },
      { transaction },
    );

    // =========================================================================
    // 🚀 THUẬT TOÁN ĐỈNH CAO: NHÓM BATCH THEO ĐƠN HÀNG ĐỂ GIẢI QUYẾT BÀI TOÁN CỦA ANH
    // =========================================================================
    const orderGroups = {};
    batches.forEach((batch) => {
      const ownerId = batch.Order_owner;
      if (ownerId) {
        if (!orderGroups[ownerId]) {
          orderGroups[ownerId] = { total_price: 0, batches: [] };
        }
        orderGroups[ownerId].total_price += parseFloat(batch.total_price || 0);
        orderGroups[ownerId].batches.push(batch);
      }
    });

    let allShipOrderPaid = true;
    let hasAnyPaidOrder = false;

    // Duyệt qua từng nhóm Đơn đặt hàng có trên xe
    for (const [masterOrderId, groupData] of Object.entries(orderGroups)) {
      if (groupData.total_price <= 0) continue;

      let initialSessionStatus = "pending";
      let initialSessionActual = 0;

      const pinnedOrder = await db.Pinned_Products.findByPk(masterOrderId, {
        transaction,
      });
      if (pinnedOrder) {
        // Kiểm tra trạng thái tài chính từ Pinned_Products như anh yêu cầu
        if (pinnedOrder.payment_status === "complated") {
          initialSessionStatus = "paid";
          initialSessionActual = groupData.total_price;
          hasAnyPaidOrder = true;
        } else {
          allShipOrderPaid = false;
        }
      } else {
        allShipOrderPaid = false;
      }

      // Sinh 1 mã QR (payment_session) riêng biệt cho TỪNG nhóm đơn hàng trên xe
      const productSuffix = Math.floor(1000 + Math.random() * 9000);
      const productPaymentCode = `ORDERPIN${Date.now().toString().slice(-6)}${productSuffix}`;

      await db.payment_sessions.create(
        {
          order_id: masterOrderId,
          ship_id: ship.id,
          payer_id: partnerId,
          receiver_id: company_id,
          amount_expected: groupData.total_price,
          amount_actual: initialSessionActual,
          status: initialSessionStatus,
          payment_code: productPaymentCode,
          payment_method: "prepaid",
        },
        { transaction },
      );
    }

    // Cập nhật lại trạng thái payment_status ban đầu cho shipping_order
    let finalShipPaymentStatus = "unpaid";
    if (allShipOrderPaid) finalShipPaymentStatus = "complated";
    else if (hasAnyPaidOrder) finalShipPaymentStatus = "partially_paid";

    await ship.update(
      { payment_status: finalShipPaymentStatus },
      { transaction },
    );
    // =========================================================================

    if (payment_method === "cod") {
      const noti_s = await db.Notification.create(
        {
          Owner_id: ship.customer_id,
          message: `Yêu cầu nhận đơn ${ship.id} chờ xử lí`,
          linkToAction: `/Products/order/warehouse/management/order_trackking?highline=${ship.id}&openModal=false`,
          noitfi_level: "3",
        },
        { transaction },
      );

      if (typeof NotificationService !== "undefined") {
        await NotificationService.sendSmartNotification(
          noti_s?.id,
          ship.customer_id,
          "manufacturer",
          `Yêu cầu nhận đơn ${ship.id} chờ xử lí`,
          [],
          "delivery",
          `level_3`,
          `/Products/order/warehouse/management/order_trackking?highline=${ship.id}&openModal=false`,
        );
      }
    }

    const noti_trans = await db.Notification.create(
      {
        Owner_id: ship.shipping_partner,
        message: `Đơn vận mới ${ship.id} chờ xử lí`,
        linkToAction: `/Products/order/warehouse/management/order_trackking?highline=${ship.id}&openModal=false`,
        noitfi_level: "3",
      },
      { transaction },
    );

    if (typeof NotificationService !== "undefined") {
      await NotificationService.sendSmartNotification(
        noti_trans?.id,
        ship.shipping_partner,
        "manufacturer",
        `Đơn vận mới ${ship.id} chờ xử lí`,
        [],
        "delivery",
        `level_3`,
        `/Products/order/warehouse/management/order_trackking?highline=${ship.id}&openModal=false`,
      );
    }

    await transaction.commit();

    return res.status(200).json({
      RM: "Đã tạo vận đơn thành công!",
      RC: 200,
      RD: { orderId, pay },
    });
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error(">>> Error sendRequestShiping Cleaned:", error);
    return res
      .status(500)
      .json({ RM: "Lỗi hệ thống khi xử lý vận đơn!", RC: 500 });
  }
};

const getShipingProccess = (db) => async (req, res) => {
  try {
    const { company_id, role } = req?.user;
    const whereCondition = { sender_id: company_id };

    if (role.toUpperCase() === "DISTRIBUTOR") {
      whereCondition.payment_status = "complated";
    }

    const defaultInclude = [
      {
        model: db.payment_sessions,
        as: "Ship_pay_bill",
        where: {
          payment_code: { [db.Sequelize.Op.like]: "SHIPPIN%" },
        },
        required: false,
      },
      {
        model: db.product_batch,
        as: "batches",
        include: [
          {
            model: db.Pinned_Products,
            as: "Pinned_order",
            required: false,
            attributes: [
              "id",
              "total_price",
              "payment_method",
              "debt",
              "payment_status",
              "payment_code",
            ],
            include: [
              {
                model: db.payment_sessions,
                as: "bills",
                required: false,
              },
            ],
          },
        ],
      },
      {
        model: db.Vehicle,
        as: "shipping_vehicle",
        attributes: [
          "id",
          "plate_number",
          "vehicle_category",
          "capacity",
          "status",
          "driver_id",
        ],
        required: false,
        include: [
          {
            model: db.Actor_model,
            as: "Driver",
            attributes: ["id", "name", "phone_number", "avatar"],
          },
        ],
      },
    ];

    const rawShippingProcess = await db.shipping_order.findAll({
      where: whereCondition,
      include: defaultInclude,
      order: [["createdAt", "DESC"]],
    });

    const receiverWhere =
      role === "transporter"
        ? { shipping_partner: company_id }
        : { customer_id: company_id };

    const rawShippingReceiver = await db.shipping_order.findAll({
      where: receiverWhere,
      include: defaultInclude,
      order: [["createdAt", "DESC"]],
    });

    const resolvePartnerInfo = async (orders) => {
      if (!orders || orders.length === 0) return [];

      const allIds = new Set();
      const shipIds = [];

      orders.forEach((o) => {
        if (o.sender_id) allIds.add(o.sender_id);
        if (o.customer_id) allIds.add(o.customer_id);
        if (o.shipping_partner) allIds.add(o.shipping_partner);
        shipIds.push(o.id);
      });
      const idList = Array.from(allIds);

      const extraAttributes = [
        "id",
        "company_name",
        "logo",
        "chain_status",
        "status",
      ];

      const [mans, dists, rets, trans, allProductSessions] = await Promise.all([
        db.Manufacturer.findAll({
          where: { id: idList },
          attributes: extraAttributes,
        }),
        db.Distributor.findAll({
          where: { id: idList },
          attributes: extraAttributes,
        }),
        db.Retailer.findAll({
          where: { id: idList },
          attributes: extraAttributes,
        }),
        db.Transporter.findAll({
          where: { id: idList },
          attributes: extraAttributes,
        }),
        db.payment_sessions.findAll({
          where: {
            ship_id: shipIds,
            payment_code: { [db.Sequelize.Op.like]: "ORDERPIN%" },
          },
          Russo: (t) => t,
        }),
      ]);

      const partnerMap = new Map();
      [...mans, ...dists, ...rets, ...trans].forEach((p) => {
        partnerMap.set(p.id, {
          id: p.id,
          company_name: p.company_name,
          logo: p.logo || null,
          chain_status: p.chain_status || "off-chain",
          status: p.status,
        });
      });

      const sessionsByShipMap = new Map();
      allProductSessions.forEach((s) => {
        const sessionJson = s.toJSON();
        if (!sessionsByShipMap.has(sessionJson.ship_id)) {
          sessionsByShipMap.set(sessionJson.ship_id, []);
        }
        sessionsByShipMap.get(sessionJson.ship_id).push(sessionJson);
      });

      return orders.map((o) => {
        const order = o.toJSON();

        const currentShipSessions = sessionsByShipMap.get(order.id) || [];

        let total_expected = 0;
        let total_actual_paid = 0;
        let amount_remaining = 0;
        let is_all_cleared = true;
        let product_bills = [];

        if (currentShipSessions.length > 0) {
          currentShipSessions.forEach((s) => {
            const exp = Number(s.amount_expected || 0);
            const act = Number(s.amount_actual || 0);
            const isPaid = ["paid", "completed", "complated"].includes(
              s.status,
            );

            total_expected += exp;
            total_actual_paid += act;
            amount_remaining = Math.max(0, exp - act);
            if (!isPaid) is_all_cleared = false;

            product_bills.push({
              id: s.id,
              order_id: s.order_id,
              payment_code: s.payment_code,
              amount_expected: exp,
              amount_actual: act,
              status: s.status,
              payment_method: s.payment_method,
            });
          });
        } else {
          is_all_cleared = ["complated", "completed", "paid"].includes(
            order.payment_status,
          );
          total_expected = Number(order.product_total_price || 0);
          total_actual_paid = is_all_cleared ? total_expected : 0;

          product_bills.push({
            id: null,
            order_id: null,
            payment_code: `LOST_PIN_${order.id.substring(0, 6)}`,
            amount_expected: total_expected,
            amount_remaining: amount_remaining,
            amount_actual: total_actual_paid,
            status: is_all_cleared ? "paid" : "pending",
            payment_method: "prepaid",
          });
        }

        return {
          ...order,
          sender_data: partnerMap.get(order.sender_id) || {
            company_name: "N/A",
          },
          receiver_data: partnerMap.get(order.customer_id) || {
            company_name: "N/A",
          },
          shipper_data: partnerMap.get(order.shipping_partner) || {
            company_name: "Chưa xác định",
          },
          order_vehicle: order.shipping_vehicle || [],

          batches_bill_summary: {
            product_bills: product_bills,
            total_expected: total_expected,
            total_actual_paid: total_actual_paid,
            amount_remaining: amount_remaining,
            remaining_debt: Math.max(0, total_expected - total_actual_paid),
            is_all_cleared: is_all_cleared,
          },
        };
      });
    };

    const [Shipping_process, Shipping_receiver] = await Promise.all([
      resolvePartnerInfo(rawShippingProcess),
      resolvePartnerInfo(rawShippingReceiver),
    ]);

    return res.status(200).json({
      RM: "Thông tin đơn vận!",
      RC: 200,
      RD: { Shipping_process, Shipping_receiver },
    });
  } catch (error) {
    console.error(">>> Error getShipingProccess:", error);
    return res.status(500).json({ RM: "Lỗi hệ thống!", RC: 500 });
  }
};
const getTransporterPrice = (db) => async (req, res) => {
  try {
    const { company_id } = req?.user;

    if (!company_id) {
      return res.status(400).json({
        RM: "Thiếu thông tin định danh công ty vận chuyển!",
        RC: -203,
      });
    }

    const transporter = await db.Transporter.findByPk(company_id);
    if (!transporter) {
      return res.status(404).json({
        RM: "Không tìm thấy thông tin nhà vận chuyển!",
        RC: 404,
      });
    }

    const [priceConfig, created] = await db.shipping_price_config.findOrCreate({
      where: { Author: company_id },
      defaults: {
        id: `PRICE_${company_id}_${Date.now()}`,
        Author: company_id,
        config_name: `Bảng giá của ${transporter.name || "nhà vận chuyển"}`,
        active: true,
      },
    });

    return res.status(200).json({
      RM: created ? "Đã khởi tạo bảng giá mới" : "Lấy bảng giá thành công",
      RC: 200,
      RD: priceConfig,
    });
  } catch (error) {
    console.error(">>> Error getTransporterPrice:", error);
    return res.status(500).json({
      RM: "Lỗi hệ thống khi truy xuất bảng giá!",
      RC: 500,
    });
  }
};

const set_new_shipping = (db) => async (req, res) => {
  try {
    const { company_id } = req?.user;
    if (!company_id) {
      return res.status(400).json({
        RM: "Thiếu thông tin định danh công ty vận chuyển!",
        RC: -203,
      });
    }

    const shipping = await db.shipping_price_config.findOne({
      where: { Author: company_id },
    });

    if (!shipping) {
      return res.status(404).json({
        RM: "Không tìm thấy thông tin bảng giá để cập nhật!",
        RC: 404,
      });
    }

    await shipping.update(req?.body?.data);

    return res.status(200).json({
      RM: "Hệ thống: Đã cập nhật bảng giá thành công!",
      RC: 200,
      RD: shipping,
    });
  } catch (error) {
    console.error(">>> Error set_new_shipping:", error);
    return res.status(500).json({
      RM: "Lỗi hệ thống khi cập nhật bảng giá!",
      RC: 500,
    });
  }
};

const reupdateBatch = (db) => async (req, res) => {
  try {
    const { batchId } = req?.params;
    const { company_id } = req?.user;
    if (!batchId) {
      return res.status(400).json({ RM: "Thiếu mã lô hàng!", RC: -203 });
    }

    const batch = await db.product_batch.findOne({
      where: {
        id: batchId,
        author: company_id,
      },
    });

    if (!batch) {
      return res
        .status(404)
        .json({ RM: "Không tìm thấy thông tin lô hàng!", RC: -404 });
    }

    const product = await db.Product.findByPk(batch.product_id);
    if (!product) {
      return res
        .status(404)
        .json({ RM: "Không tìm thấy sản phẩm tham chiếu!", RC: -404 });
    }

    const itemsPerBox = product.items_per_box || 1;
    const weightPerUnit = parseFloat(product.weight || 0);
    const quantity = parseInt(batch.quantity || 0);

    const calculatedData = {
      weight_per_unit: weightPerUnit,
      total_weight: weightPerUnit * quantity,
      total_box: Math.ceil(quantity / itemsPerBox),
      updated_at: new Date(),
    };

    await batch.update(calculatedData);
    req.ai_mapped_payload = batch.toJSON();
    return res.status(200).json({
      RM: "Cập nhật thông số lô hàng thành công!",
      RC: 200,
      RD: calculatedData,
    });
  } catch (error) {
    console.error("!!! Error at reupdateBatch:", error);
    return res
      .status(500)
      .json({ RM: "Lỗi hệ thống khi tính toán lô hàng!", RC: 500 });
  }
};

const fetchFleetValidApi = (db) => async (req, res) => {
  try {
    const { company_id } = req.user;

    const { type_delivery } = req.query;

    if (!company_id) {
      return res.status(400).json({ RM: "Thiếu thông tin công ty!", RC: 400 });
    }

    const vehicleFilter = {
      status: "available",
      order_now: null,
    };
    if (type_delivery && type_delivery !== "all") {
      vehicleFilter.vehicle_category = type_delivery;
    }

    const fleetlist = await db.Fleet.findAll({
      where: { transporter_id: company_id },
      include: [
        {
          model: db.Vehicle,
          where: vehicleFilter,
          required: false,
          through: {
            where: { status: "active" },
            attributes: [],
          },
          attributes: [
            "id",
            "plate_number",
            "vehicle_type",
            "capacity",
            "capacity_unit",
            "vehicle_category",
            "status",
          ],
          include: [
            {
              model: db.Actor_model,
              as: "Driver",
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const assignedVehicles = await db.Fleet_Vehicle.findAll({
      where: { status: "active" },
      attributes: ["vehicle_id"],
      raw: true,
    });
    const assignedIds = assignedVehicles.map((v) => v.vehicle_id);

    const unfleetvehicle = await db.Vehicle.findAll({
      where: {
        owner_id: company_id,
        ...vehicleFilter,
        id: { [Op.notIn]: assignedIds.length > 0 ? assignedIds : [""] },
      },
      attributes: [
        "id",
        "plate_number",
        "vehicle_type",
        "capacity",
        "capacity_unit",
        "vehicle_category",
        "status",
      ],
    });

    return res.status(200).json({
      RM: "Lấy dữ liệu phương tiện thành công!",
      RC: 200,
      RD: {
        fleetlist,
        unfleetvehicle,
      },
    });
  } catch (error) {
    console.error("!!! Error at fetchFleetValidApi:", error);
    return res.status(500).json({
      RM: "Lỗi hệ thống khi lấy dữ liệu phương tiện!",
      RC: 500,
    });
  }
};

const TransAcceptShip = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { company_id } = req.user;
    const { shipping_id } = req.params;
    const { selectedVehicles, execution_type } = req.body;

    if (!selectedVehicles || selectedVehicles.length === 0) {
      return res
        .status(400)
        .json({ RM: "Vui lòng chọn ít nhất một phương tiện!", RC: 400 });
    }

    const vehicleIds = selectedVehicles.map((v) =>
      typeof v === "object" ? v.id : v,
    );

    const vehiclesData = await db.Vehicle.findAll({
      where: {
        id: { [db.Sequelize.Op.in]: vehicleIds },
        owner_id: company_id,
      },
      include: [
        { model: db.Actor_model, as: "Driver", attributes: ["id", "name"] },
      ],
      transaction: t,
    });

    if (vehiclesData.length !== vehicleIds.length) {
      await t.rollback();
      return res.status(400).json({
        RM: "Một số phương tiện không tồn tại hoặc không thuộc quyền quản lý của bạn!",
        RC: 400,
      });
    }

    const order = await db.shipping_order.findOne({
      where: { id: shipping_id, shipping_partner: company_id },
      transaction: t,
    });

    if (!order) {
      await t.rollback();
      return res.status(400).json({ RM: "Không tìm thấy vận đơn!", RC: 404 });
    }

    if (execution_type === "Single" && vehiclesData.length > 1) {
      await t.rollback();
      return res.status(400).json({
        RM: "Kiểu vận tải không khớp với số lượng xe, vận tải đơn không được quá 1 xe!",
        RC: 400,
      });
    }

    const fleetAssignments = vehiclesData.map((v) => ({
      vehicle_id: v.id,
      driver_id: v.Driver?.id || null,
      plate_number: v.plate_number,
      driver_name: v.Driver?.name || "Chưa gán tài xế",
      assignedAt: new Date(),
    }));

    const initialTracking = {};
    const initialStatus = {};
    vehicleIds.forEach((id) => {
      initialTracking[id] = null;
      initialStatus[id] = "waiting";
    });

    await order.update(
      {
        transporter_confirm: "accepted",
        status: "proposed",
        fleet_assignments: fleetAssignments,
        fleet_current_locations: initialTracking,
        fleet_status: initialStatus,
        is_multivehicle: vehicleIds.length > 1,
        vehicle_count: vehicleIds.length,
        execution_type:
          vehicleIds.length > 1 ? execution_type || "Convoy" : "Single",
      },
      { transaction: t },
    );

    const [updatedCount] = await db.Vehicle.update(
      { order_now: shipping_id, status: "booked" },
      {
        where: {
          id: { [db.Sequelize.Op.in]: vehicleIds },
          owner_id: company_id,
          order_now: null,
        },
        transaction: t,
      },
    );

    if (updatedCount !== vehicleIds.length) {
      await t.rollback();
      return res.status(400).json({
        RM: "Một số phương tiện đã bị điều động cho đơn khác hoặc không khả dụng!",
        RC: 400,
      });
    }

    await t.commit();
    return res.status(200).json({
      RM: "Xác nhận vận đơn và chốt danh sách đội xe thành công!",
      RC: 200,
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("!!! Critical Error at TransAcceptShip:", error);
    return res
      .status(500)
      .json({ RM: "Lỗi hệ thống khi xử lý vận đơn!", RC: 500 });
  }
};

const PindDriver = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { company_id } = req?.user;
    const { driver_id, vehicle_id } = req?.body;

    if (!company_id || !driver_id || !vehicle_id) {
      return res
        .status(400)
        .json({ RM: "Thiếu thông tin định danh!", RC: -203 });
    }

    const vehicle = await db.Vehicle.findOne({
      where: { id: vehicle_id, owner_id: company_id },
      transaction: t,
    });

    if (!vehicle) {
      await t.rollback();
      return res
        .status(400)
        .json({ RM: "Không tìm thấy phương tiện!", RC: -203 });
    }

    if (vehicle.order_now !== null && vehicle.order_now !== "none") {
      await t.rollback();
      return res.status(400).json({
        RM: "Phương tiện đang vận chuyển, không thể thay thế tài xế!",
        RC: -203,
      });
    }

    const driver = await db.Actor_model.findOne({
      where: { id: driver_id, status: "active" },
      transaction: t,
    });

    if (!driver) {
      await t.rollback();
      return res
        .status(400)
        .json({ RM: "Tài xế không tồn tại hoặc đã bị khóa!", RC: -203 });
    }

    const otherVehicle = await db.Vehicle.findOne({
      where: {
        driver_id: driver.id,
        id: { [db.Sequelize.Op.ne]: vehicle_id },
      },
      transaction: t,
    });

    if (otherVehicle) {
      await t.rollback();
      return res.status(400).json({
        RM: `Tài xế này đang được gán cho xe ${otherVehicle.plate_number}!`,
        RC: -203,
      });
    }

    await vehicle.update({ driver_id: driver.id }, { transaction: t });

    await t.commit();
    return res.status(200).json({
      RC: 200,
      RM: `Đã gán tài xế ${driver.name} vào xe ${vehicle.plate_number} thành công!`,
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error(">>> PindDriver Error:", error);
    return res.status(500).json({ RM: "Lỗi hệ thống!", RC: 500 });
  }
};

const disAcceptShippingOrderApi = (db) => async (req, res) => {
  let t;
  try {
    t = await db.sequelize.transaction();
    const { company_id } = req.user;
    const { shipping_id } = req.params;

    const order = await db.shipping_order.findOne({
      where: { id: shipping_id, customer_id: company_id },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!order) {
      if (t) await t.rollback();
      return res.status(400).json({ RM: "Không tìm thấy!", RC: 400 });
    }

    await Promise.race([
      order.update(
        { receiver_confirm: "accepted", status: "proposed" },
        { transaction: t },
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Query Timeout sau 5 giây!")), 5000),
      ),
    ]);

    await t.commit();
    return res.status(200).json({ RM: "Xác nhận thành công!", RC: 200 });
  } catch (error) {
    if (t) {
      await t.rollback();
    }
    console.error("!!! Chi tiết lỗi:", error.message);
    return res
      .status(500)
      .json({ RM: error.message || "Lỗi hệ thống", RC: 500 });
  }
};

const updateShipingStatus = (db) => async (shiping_id) => {
  const transaction = await db.sequelize.transaction();
  try {
    if (!shiping_id) return false;

    const order = await db.shipping_order.findByPk(shiping_id, {
      include: [{ model: db.product_batch, as: "batches" }],
      transaction,
    });

    if (!order || !order.batches) {
      await transaction.rollback();
      return false;
    }

    const isAllReady = order.batches.every(
      (batch) => batch.Shiping_status === "ready",
    );

    if (!isAllReady) {
      await transaction.rollback();
      return false;
    }

    await order.update(
      {
        status: "ready_to_pick",
      },
      { transaction },
    );

    const allDriver = await db.Vehicle.findAll({
      where: { id: order.shipping_vehicle_id },
      include: [{ model: db.Actor_model, as: "Driver" }],
      transaction,
    });

    const noti = await db.Notification.create({
      Owner_id: order.shipping_partner,
      target_actor: allDriver.map((v) => v.Driver?.id).filter((id) => id),
      message: `Đơn vận ${order.id} đã sẵn sàng để lấy hàng.`,
      linkToAction: `/`,
      noitfi_level: "1",
    });

    await NotificationService.sendSmartNotification(
      noti?.id,
      order.shipping_partner,
      "manufacturer",
      `Đơn vận ${order.id} đã sẵn sàng để lấy hàng.`,
      allDriver.map((v) => v.Driver?.id).filter((id) => id),
      "delivery",
      `level_1`,
    );

    await transaction.commit();

    return true;
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error("Update Shipping Status Error:", error);
    return false;
  }
};

const truckInBatch = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { company_id } = req.user;
    const { shipping_id } = req.params;

    if (!shipping_id || !company_id) {
      return res.status(400).json({
        RM: "Thiếu thông tin định danh!",
        RC: -203,
      });
    }

    const order = await db.shipping_order.findOne({
      where: { id: shipping_id, sender_id: company_id },
      transaction: t,
    });

    if (!order) {
      await t.rollback();
      return res.status(404).json({
        RM: "Không tìm thấy vận đơn hoặc bạn không có quyền!",
        RC: 404,
      });
    }

    await order.update(
      {
        status: "in_truck",
      },
      { transaction: t },
    );

    await t.commit();

    return res.status(200).json({
      RM: "Xác nhận vận đơn thành công!",
      RC: 200,
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("!!! Error at disAcceptShippingOrderApi:", error);
    return res.status(500).json({
      RM: "Lỗi hệ thống khi xác nhận vận đơn!",
      RC: 500,
    });
  }
};

const truckInConfirm = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { company_id } = req.user;
    const { shipping_id } = req.params;

    const order = await db.shipping_order.findOne({
      where: { id: shipping_id, shipping_partner: company_id },
      transaction: t,
    });

    if (!order) {
      await t.rollback();
      return res.status(404).json({
        RM: "Không tìm thấy vận đơn hoặc bạn không có quyền!",
        RC: 404,
      });
    }

    if (order.status !== "in_truck") {
      await t.rollback();
      return res.status(404).json({
        RM: "Bên cung cấp chưa xác nhận hàng xuất xưởng!",
        RC: 400,
      });
    }

    await order.update(
      {
        status: "shipping",
      },
      { transaction: t },
    );

    await db.product_batch.update(
      { Shiping_status: "in_progress" },
      {
        where: { shipping_order_id: order.id },
        transaction: t,
      },
    );

    const noti = await db.Notification.create({
      Owner_id: order.shipping_partner,
      message: `Đơn vận ${order.id} đã xuất xưởng.`,
      linkToAction: `/Products/order/warehouse/management/order_trackking?highline=${order.id}&openModal=true`,
      noitfi_level: "4",
    });

    broadcastNotification(
      noti?.id,
      order.shipping_partner,
      `Đơn vận ${order.id} đã xuất xưởng.`,
      `/Products/order/warehouse/management/order_trackking?highline=${order.id}&openModal=true`,
      "delivery",
      "unread",
      `level_4`,
    );

    await t.commit();

    return res.status(200).json({
      RM: "Xác nhận vận đơn thành công!",
      RC: 200,
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("!!! Error at disAcceptShippingOrderApi:", error);
    return res.status(500).json({
      RM: "Lỗi hệ thống khi xác nhận vận đơn!",
      RC: 500,
    });
  }
};

const shipingComplete = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { company_id } = req.user;
    const { shipping_id } = req.params;

    const order = await db.shipping_order.findOne({
      where: { id: shipping_id, shipping_partner: company_id },
      transaction: t,
    });

    if (!order) {
      await t.rollback();
      return res.status(404).json({
        RM: "Không tìm thấy vận đơn hoặc bạn không có quyền!",
        RC: 404,
      });
    }

    await order.update(
      {
        status: "outTruck",
        Delivery_completed: true,
      },
      { transaction: t },
    );

    const noti = await db.Notification.create({
      Owner_id: order.customer_id,
      message: `Đơn vận ${order.id} xác nhận hàng đã xuất xe.`,
      linkToAction: `/Products/order/warehouse/management/order_trackking?highline=${order.id}&openModal=true`,
      noitfi_level: "4",
    });

    broadcastNotification(
      noti?.id,
      order.customer_id,
      `Đơn vận ${order.id} xác nhận hàng đã xuất xe.`,
      `/Products/order/warehouse/management/order_trackking?highline=${order.id}&openModal=true`,
      "delivery",
      "unread",
      `level_4`,
    );

    await t.commit();

    return res.status(200).json({
      RM: "Xác nhận đã nhận hàng!",
      RC: 200,
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("!!! Error at disAcceptShippingOrderApi:", error);
    return res.status(500).json({
      RM: "Lỗi hệ thống khi xác nhận vận đơn!",
      RC: 500,
    });
  }
};

const receiverConfirm = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { company_id } = req.user;
    const { shipping_id } = req.params;

    const order = await db.shipping_order.findOne({
      where: { id: shipping_id, customer_id: company_id },
      transaction: t,
    });

    if (!order) {
      await t.rollback();
      return res.status(404).json({
        RM: "Không tìm thấy vận đơn hoặc bạn không có quyền!",
        RC: 404,
      });
    }

    await order.update(
      {
        status: "delivered",
      },
      { transaction: t },
    );

    const allDriver = await db.Vehicle.findAll({
      where: { id: order.shipping_vehicle_id },
      include: [{ model: db.Actor_model, as: "Driver" }],
      transaction: t,
    });

    await db.product_batch.update(
      { Shiping_status: "completed" },
      {
        where: { shipping_order_id: order.id },
        transaction: t,
      },
    );

    const noti_c = await db.Notification.create({
      Owner_id: order.customer_id,
      message: `Đơn vận ${order.id} xác nhận đã hoàn thành.`,
      linkToAction: `/Products/order/warehouse/management/order_trackking?highline=${order.id}&openModal=true`,
      noitfi_level: "4",
    });

    const noti_s = await db.Notification.create({
      Owner_id: order.sender_id,
      message: `Đơn vận ${order.id} xác nhận đã hoàn thành.`,
      linkToAction: `/Products/order/warehouse/management/order_trackking?highline=${order.id}&openModal=true`,
      noitfi_level: "4",
    });

    const noti_sp = await db.Notification.create({
      Owner_id: order.shipping_partner,
      message: `Đơn vận ${order.id} xác nhận đã hoàn thành.`,
      linkToAction: `/Products/order/warehouse/management/order_trackking?highline=${order.id}&openModal=true`,
      noitfi_level: "4",
    });

    await NotificationService.sendSmartNotification(
      noti_c?.id,
      order.customer_id,
      "customer",
      `Đơn vận ${order.id} xác nhận đã hoàn thành.`,
      [],
      "order_completed",
      `level_4`,
      `/Products/order/warehouse/management/order_trackking?highline=${order.id}&openModal=true`,
    );
    await NotificationService.sendSmartNotification(
      noti_s?.id,
      order.sender_id,
      "sender",
      `Đơn vận ${order.id} xác nhận đã hoàn thành.`,
      [],
      "order_completed",
      `level_4`,
      `/Products/order/warehouse/management/order_trackking?highline=${order.id}&openModal=true`,
    );
    await NotificationService.sendSmartNotification(
      noti_sp?.id,
      order.shipping_partner,
      "sender",
      `Đơn vận ${order.id} xác nhận đã hoàn thành.`,
      [],
      "order_completed",
      `level_4`,
      `/Products/order/warehouse/management/order_trackking?highline=${order.id}&openModal=true`,
    );

    await NotificationService.sendSmartNotification(
      noti_sp?.id,
      order.shipping_partner,
      "transporter",
      `Đơn vận ${order.id} xác nhận đã hoàn thành.`,
      allDriver.map((v) => v.Driver?.id).filter((id) => id),
      "order_completed",
      `level_1`,
      `/Products/order/warehouse/management/order_trackking?highline=${order.id}&openModal=true`,
    );

    await t.commit();

    return res.status(200).json({
      RM: "Xác nhận đã nhận hàng!",
      RC: 200,
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("!!! Error at disAcceptShippingOrderApi:", error);
    return res.status(500).json({
      RM: "Lỗi hệ thống khi xác nhận vận đơn!",
      RC: 500,
    });
  }
};

const senderReadyTopick = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { company_id } = req.user;
    const { shipping_id } = req.params;

    const order = await db.shipping_order.findOne({
      where: { id: shipping_id, sender_id: company_id },
      transaction: t,
    });

    if (!order) {
      await t.rollback();
      return res.status(404).json({
        RM: "Không tìm thấy vận đơn hoặc bạn không có quyền!",
        RC: 404,
      });
    }

    const batches = await db.product_batch.findAll({
      where: { shipping_order_id: shipping_id },
      attributes: ["id"],
      transaction: t,
    });

    const batchIds = batches.map((b) => b.id);

    if (batchIds.length === 0) {
      await t.rollback();
      return res.status(400).json({
        RM: "Đơn vận chuyển không chứa kiện hàng nào để xác thực xuất kho!",
        RC: 400,
      });
    }

    const allQr = await db.QrRegistry.findAll({
      where: {
        target_batch: batchIds,
      },
      transaction: t,
    });

    const hasInvalidQR = allQr.some(
      (qr) =>
        qr.print_status === "pending" ||
        qr.print_status === "failed" ||
        qr.status === "pending" ||
        qr.status === "revoked",
    );

    if (hasInvalidQR) {
      await t.rollback();
      return res.status(400).json({
        RM: "Lô hàng chứa hàng hóa chưa xác thực hoặc bị thu hồi, không thể xuất kho!",
        RC: 400,
      });
    }

    await order.update(
      {
        status: "ready_to_pick",
      },
      { transaction: t },
    );

    await db.product_batch.update(
      { Shiping_status: "ready" },
      {
        where: { shipping_order_id: order.id },
        transaction: t,
      },
    );

    const allDriver = await db.Vehicle.findAll({
      where: { order_now: order?.id },
      include: [{ model: db.Actor_model, as: "Driver" }],
      transaction: t,
    });

    const noti = await db.Notification.create(
      {
        Owner_id: order.shipping_partner,
        target_actor: allDriver.map((v) => v.Driver?.id).filter((id) => id),
        message: `Đơn vận ${order.id} đã sẵn sàng để lấy hàng.`,
        linkToAction: `/Products/order/warehouse/management/order_trackking?highline=${order.id}&openModal=true`,
        noitfi_level: "1",
      },
      { transaction: t },
    );

    if (typeof NotificationService !== "undefined") {
      await NotificationService.sendSmartNotification(
        noti?.id,
        order.shipping_partner,
        "manufacturer",
        `Đơn vận ${order.id} đã sẵn sàng để lấy hàng.`,
        allDriver.map((v) => v.Driver?.id).filter((id) => id),
        "order_ready",
        `level_1`,
        `/Products/order/warehouse/management/order_trackking?highline=${order.id}&openModal=true`,
      );
    }

    await t.commit();

    return res.status(200).json({
      RM: "Xác nhận hàng sẵn sàng!",
      RC: 200,
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("!!! Error at senderReadyTopick:", error);
    return res.status(500).json({
      RM: "Lỗi hệ thống khi xác nhận vận đơn!",
      RC: 500,
    });
  }
};

const getShipperLocation = (db) => async (req, res) => {
  try {
    const { order_id } = req.params;
    const { company_id } = req?.user;

    const order = await db.shipping_order.findByPk(order_id);

    if (!order) {
      return res.status(404).json({ RM: "Không tìm thấy đơn hàng!", RC: 404 });
    }

    const isAuthorized = [
      order.sender_id,
      order.customer_id,
      order.shipping_partner,
    ].includes(company_id);
    if (!isAuthorized) {
      return res
        .status(403)
        .json({ RM: "Bạn không có quyền truy cập!", RC: 403 });
    }

    let vehiclesData = [];

    if (order.is_multivehicle && order.fleet_current_locations) {
      vehiclesData = Object.keys(order.fleet_current_locations).map((vId) => ({
        id: vId,
        plate_number: vId, // Sau này anh có thể join thêm bảng Vehicle để lấy biển số thật
        ...order.fleet_current_locations[vId],
      }));
    } else if (order.current_lat && order.current_lng) {
      vehiclesData = [
        {
          id: "MAIN_TRUCK",
          plate_number: "Xe chính",
          lat: order.current_lat,
          lng: order.current_lng,
          updatedAt: order.Location_last_update,
        },
      ];
    }

    return res.status(200).json({
      RM: "Vị trí đội xe hiện tại!",
      RC: 200,
      RD: {
        vehicles: vehiclesData,
        is_multivehicle: order.is_multivehicle,
        last_update: order.Location_last_update,
      },
    });
  } catch (error) {
    console.error(">>> [GET SHIPPER LOCATION ERR]:", error);
    return res.status(500).json({ RM: "Lỗi hệ thống!", RC: 500 });
  }
};

const AcceptAndSignOrder = (db) => async (req, res) => {
  const upload = InspectionUpload.fields([
    { name: "images", maxCount: 10 },
    { name: "video", maxCount: 1 },
  ]);

  upload(req, res, async (err) => {
    if (err)
      return res
        .status(400)
        .json({ RC: 400, RM: "Lỗi upload: " + err.message });

    const t = await db.sequelize.transaction();
    const timestamp = Date.now();
    let filesCreated = [];

    try {
      const { company_id, id: user_id } = req.user;
      const { order_id } = req.params;
      const { inspection_type, condition_summary, actual_quantities } =
        req.body;

      const order = await db.shipping_order.findOne({
        where: { id: order_id, customer_id: company_id },
        include: [
          {
            model: db.Vehicle,
            as: "shipping_vehicle",
          },
        ],
        transaction: t,
      });

      if (!order) {
        await t.rollback();
        return res.status(404).json({
          RC: 404,
          RM: "Không tìm thấy đơn hàng hoặc bạn không có quyền xác nhận!",
        });
      }

      await fs.mkdir(INSPECTION_DIR, { recursive: true });

      let imagePaths = [];
      let finalVideoUrl = null;

      if (req.files?.images) {
        for (const file of req.files.images) {
          const fileExt = path.extname(file.originalname);
          const cleanName = path
            .basename(file.originalname, fileExt)
            .replace(/\s+/g, "_");
          const fileName = `IMG_${cleanName}_${timestamp}${fileExt}`;
          const fullPath = path.join(INSPECTION_DIR, fileName);

          await fs.writeFile(fullPath, file.buffer);
          filesCreated.push(fullPath);
          imagePaths.push(`/Access/InspectionReport/${fileName}`);
        }
      }

      if (req.files?.video?.[0]) {
        const videoFile = req.files.video[0];
        const videoExt = path.extname(videoFile.originalname);
        const videoName = `VIDEO_${order_id}_${timestamp}${videoExt}`;
        const fullPath = path.join(INSPECTION_DIR, videoName);

        await fs.writeFile(fullPath, videoFile.buffer);
        filesCreated.push(fullPath);
        finalVideoUrl = `/Access/InspectionReport/${videoName}`;
      }

      const statusMap = {
        quality_check: "missing_product",
        return_shipment: "return",
        repair_product: "batch_fixed",
        confirm_delivery: "delivered",
      };

      const newStatus = statusMap[inspection_type] || order.status;
      const reportId = `REP_${timestamp}`;
      await db.InspectionReports.create(
        {
          id: reportId,
          shiping_id: order.id,
          inspector_id: user_id,
          inspection_type,
          inspection_status:
            inspection_type === "confirm_delivery" ? "passed" : "failed",
          condition_summary,
          report_file_url: {
            images: imagePaths,
            video: finalVideoUrl,
            actual_quantities: JSON.parse(actual_quantities || "{}"),
          },
          blockchain_hash: `0x_local_sign_${timestamp}`,
        },
        { transaction: t },
      );

      await order.update(
        {
          status: newStatus,
          receiver_confirm: "accepted",
        },
        { transaction: t },
      );

      await db.Vehicle.update(
        {
          status: "available",
          order_now: null,
        },
        {
          where: { order_now: order.id },
          transaction: t,
        },
      );

      const notifyMsg = `Đơn vận ${order.id} ${
        newStatus === "delivered"
          ? "đã hoàn thành"
          : newStatus === "return"
            ? "cần trả lại"
            : newStatus === "batch_fixed"
              ? "cần sửa chữa"
              : "bị thiếu hàng"
      }.`;

      const noti_sp = await db.Notification.create(
        {
          Owner_id: order.shipping_partner,
          message: notifyMsg,
          linkToAction: `/Products/order/warehouse/management/order_trackking?highline=${order.id}&openModal=true`,
          noitfi_level: "4",
        },
        { transaction: t },
      );

      const noti_c = await db.Notification.create(
        {
          Owner_id: order.customer_id,
          message: notifyMsg,
          linkToAction: `/Products/order/warehouse/management/order_trackking?highline=${order.id}&openModal=true`,
          noitfi_level: "4",
        },
        { transaction: t },
      );

      const noti_s = await db.Notification.create(
        {
          Owner_id: order.sender_id,
          message: notifyMsg,
          linkToAction: `/Products/order/warehouse/management/order_trackking?highline=${order.id}&openModal=true`,
          noitfi_level: "4",
        },
        { transaction: t },
      );

      if (typeof NotificationService !== "undefined") {
        await NotificationService.sendSmartNotification(
          noti_c?.id,
          order.customer_id,
          "customer",
          notifyMsg,
          [],
          "order_completed",
          "level_4",
          `/Products/order/warehouse/management/order_trackking?highline=${order.id}&openModal=true`,
        );
      }

      await t.commit();
      return res.status(200).json({
        RC: 200,
        RM: "Xác nhận và ký số thành công, đội xe đã được giải phóng!",
        RD: { report_id: reportId },
      });
    } catch (error) {
      await t.rollback();
      for (const filePath of filesCreated) {
        try {
          await fs.unlink(filePath);
        } catch (unlinkErr) {
          console.error(
            `>>> [CRITICAL] Rollback file failed: ${filePath}`,
            unlinkErr,
          );
        }
      }

      console.error(">>> [AcceptAndSignOrder ERR]:", error);
      return res.status(500).json({
        RC: 500,
        RM: "Lỗi hệ thống, dữ liệu đã được hoàn tác an toàn!",
      });
    }
  });
};
const markNotificationAsRead = (db) => async (req, res) => {
  try {
    const { company_id } = req.user;
    const { notification_id } = req.params;

    const notification = await db.Notification.findOne({
      where: { id: notification_id, Owner_id: company_id },
    });
    if (!notification) {
      return res.status(404).json({ RM: "Không tìm thấy thông báo!", RC: 404 });
    }
    await notification.update({ status: "seen" });
    return res
      .status(200)
      .json({ RM: "Đã đánh dấu thông báo là đã đọc!", RC: 200 });
  } catch (error) {
    console.error(">>> [markNotificationAsRead ERR]:", error);
    return res.status(500).json({ RM: "Lỗi hệ thống!", RC: 500 });
  }
};

const markAllNotificationsAsRead = (db) => async (req, res) => {
  try {
    const { company_id } = req.user;
    const noti = await db.Notification.update(
      { status: "seen" },
      { where: { Owner_id: company_id, status: "unread" } },
    );
    return res
      .status(200)
      .json({ RM: "Đã đánh dấu tất cả thông báo là đã đọc!", RC: 200 });
  } catch (error) {
    console.error(">>> [markAllNotificationsAsRead ERR]:", error);
    return res.status(500).json({ RM: "Lỗi hệ thống!", RC: 500 });
  }
};

const getBox = (db) => async (req, res) => {
  try {
    const { company_id } = req?.user;
    const boxs = await db.Product_Packaging.findAll({
      where: {
        author: company_id,
        status: "active",
      },
    });

    return res.status(200).json({ RM: "Boxs!", RC: 200, RD: boxs });
  } catch (error) {
    console.error(">>> [markAllNotificationsAsRead ERR]:", error);
    return res.status(500).json({ RM: "Lỗi hệ thống!", RC: 500 });
  }
};

const createBox = (db) => async (req, res) => {
  const mainFiles = req.files?.image_printer || [];
  const subFiles = req.files?.decription_image || [];
  const allFiles = [...mainFiles, ...subFiles];

  const company_id = req?.user?.company_id;

  if (!company_id) {
    if (allFiles.length > 0) cleanupUploadedFiles(allFiles);
    return res
      .status(400)
      .json({ RC: -203, RM: "Không xác định được công ty!" });
  }

  const { pack_code, material, length, width, height, max_weight } = req?.body;

  if (!pack_code || !material || !length || !width || !height || !max_weight) {
    if (allFiles.length > 0) cleanupUploadedFiles(allFiles);
    return res
      .status(400)
      .json({ RC: -203, RM: "Vui lòng nhập đầy đủ thông số!" });
  }

  const printerImageName = mainFiles.length > 0 ? mainFiles[0].filename : null;
  const descriptionImageName =
    subFiles.length > 0 ? subFiles[0].filename : null;

  if (!printerImageName) {
    if (allFiles.length > 0) cleanupUploadedFiles(allFiles);
    return res
      .status(400)
      .json({ RC: -203, RM: "Thiếu hình ảnh thiết kế nhãn in!" });
  }

  const t = await db.sequelize.transaction();
  try {
    const box = await db.Product_Packaging.create(
      {
        pack_code,
        material,
        length: parseFloat(length),
        width: parseFloat(width),
        height: parseFloat(height),
        image_printer: printerImageName,
        decription_image: descriptionImageName,
        max_weight_capacity: parseFloat(max_weight),
        author: company_id,
        status: "active",
      },
      { transaction: t },
    );

    await t.commit();
    return res.status(200).json({
      RC: 200,
      RM: "Tạo cấu trúc bao bì Blockchain thành công!",
      RD: box,
    });
  } catch (error) {
    await t.rollback();
    if (allFiles.length > 0) cleanupUploadedFiles(allFiles);
    console.error(">>> [CREATE BOX ERR]:", error);
    return res
      .status(500)
      .json({ RC: 500, RM: "Lỗi hệ thống!", Detail: error.message });
  }
};

const StartShip = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { company_id } = req?.user;
    const { order_id, vehicle_id } = req?.body;

    if (!order_id || !vehicle_id) {
      return res
        .status(400)
        .json({ RC: 400, RM: "Thiếu dữ liệu đơn hàng hoặc phương tiện!" });
    }

    const order_ship = await db.shipping_order.findByPk(order_id, {
      transaction: t,
    });
    if (!order_ship) {
      await t.rollback();
      return res
        .status(404)
        .json({ RC: 404, RM: "Hệ thống không tìm thấy đơn vận chuyển!" });
    }

    let fleet_status = { ...order_ship.fleet_status };
    fleet_status[vehicle_id] = "ship_start";

    let globalStatus = order_ship.status;
    if (
      order_ship.execution_type === "single" ||
      order_ship.vehicle_count === 1
    ) {
      globalStatus = "all_ship_start";
    } else {
      globalStatus = "partial_ship_start";
    }

    await order_ship.update(
      {
        fleet_status: fleet_status,
        Driver_shiping_status: globalStatus,
      },
      { transaction: t },
    );

    await db.Vehicle.update(
      { status: "in_service" },
      { where: { id: vehicle_id }, transaction: t },
    );

    await t.commit();

    return res.status(200).json({
      RC: 200,
      RM: "Bắt đầu lộ trình di chuyển thành công!",
      data: {
        current_vehicle_status: "delivering",
        order_status: globalStatus,
      },
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("!!! Error at StartShip:", error);
    return res.status(500).json({
      RC: 500,
      RM: "Lỗi hệ thống khi bắt đầu vận chuyển!",
      Detail: error.message,
    });
  }
};

const ArrivedShip = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { order_id, vehicle_id } = req?.body;

    if (!order_id || !vehicle_id) {
      return res
        .status(400)
        .json({ RC: 400, RM: "Thiếu dữ liệu đơn hàng hoặc phương tiện!" });
    }

    const order_ship = await db.shipping_order.findByPk(order_id, {
      transaction: t,
    });

    if (!order_ship) {
      await t.rollback();
      return res
        .status(404)
        .json({ RC: 404, RM: "Hệ thống không tìm thấy đơn vận chuyển!" });
    }

    let updated_fleet_status = { ...order_ship.fleet_status };
    updated_fleet_status[vehicle_id] = "arrived";

    await order_ship.update(
      { fleet_status: updated_fleet_status },
      { transaction: t },
    );

    await t.commit();

    await order_ship.reload();

    return res.status(200).json({
      RC: 200,
      RM: "Bắt đầu lộ trình di chuyển thành công!",
      data: {
        current_vehicle_status: "delivering",
        global_display_status: order_ship.Driver_shiping_status,
        order_milestone: order_ship.status,
      },
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("!!! Error at ArrivedShip:", error);
    return res.status(500).json({
      RC: 500,
      RM: "Lỗi hệ thống khi bắt đầu vận chuyển!",
      Detail: error.message,
    });
  }
};

const ProductTrace = (db, nodes) => async (product_master, metadata) => {
  try {
    if (!product_master || !metadata)
      return { RM: "Thiếu dữ liệu sản phẩm hoặc phiên bản!", RC: 400 };

    const raw = [
      String(metadata.id || "").trim(),
      String(product_master.id || "").trim(),
      String(metadata.version || "1").trim(),
      String(product_master.author || "")
        .normalize("NFC")
        .trim(),
      String(metadata.responsible_person || "")
        .normalize("NFC")
        .trim(),
      String(metadata.price || "").trim(),
    ].join("|");

    const product_hash = crypto.createHash("sha256").update(raw).digest("hex");

    if (product_hash !== metadata.txt_hash) {
      console.warn(
        `[Trace] Lệch Hash! DB: ${metadata.txt_hash} !== Calc: ${product_hash}`,
      );
      return { RM: "Block không hợp lệ (Dữ liệu đã bị sửa đổi)!", RC: 400 };
    }

    const payload = {
      timestamp: String(Date.now()),
      payload: {
        product_id: product_master.id,
        type: "product_create",
        hash: product_hash,
        version: `${metadata.version}`,
        Owner_id: product_master.author,
        original_value: raw,
        status: "active",
        detail: "none",
      },
    };

    const commitResp = await pair_validate.pair_request(
      db,
      payload,
      nodes,
      "product_trace",
    );

    console.log(
      "\n[DEBUG ProductTrace] commitResp trả về:",
      JSON.stringify(commitResp, null, 2),
    );

    if (commitResp.RC === 200) {
      return { RM: "Block hợp lệ!", RC: 200 };
    } else {
      return { RM: "Block không hợp lệ trên Chain!", RC: 201 };
    }
  } catch (error) {
    console.error("ProductTrace error:", error);
    return { RM: "Lỗi hệ thống!", RC: 500 };
  }
};

const CompanyTrace = (db, nodes) => async (company) => {
  try {
    if (!company)
      return {
        RM: "Thiếu dữ liệu company!",
        RC: 400,
      };
    const c_id = String(company.id || "").trim();
    const c_name = String(company.company_name || "")
      .normalize("NFC")
      .trim();
    const c_tax = String(company.tax_code || "no_tax")
      .normalize("NFC")
      .trim();
    const c_license = String(company.license_number || "no_license")
      .normalize("NFC")
      .trim();
    const raw = `${c_id}|${c_name}|${c_license}|${c_tax}`;

    const company_hash = crypto.createHash("sha256").update(raw).digest("hex");

    if (company_hash != company.txt_hash) {
      return { RM: "Block không hợp lệ!", RC: 400 };
    }

    const payload = {
      timestamp: String(Date.now()),
      payload: {
        product_id: company.id,
        type: "company_onboarding",
        hash: company_hash,
        version: "1.0.0",
        Owner_id: company.actor_id,
        original_value: raw,
        detail: "on chain company/store",
        status: "active",
      },
    };

    const commitResp = await pair_validate.pair_request(
      db,
      payload,
      nodes,
      "company_trace",
    );

    if (commitResp.RC === 200) {
      return { RM: "Xác thực Company hợp lệ!", RC: 200 };
    } else {
      return { RM: "Company bị từ chối!", RC: 201 };
    }
  } catch (error) {
    console.error(error);
    return { RM: "Lỗi hệ thống!", RC: 500 };
  }
};

const BatchTrace = (db, nodes) => async (batch) => {
  try {
    if (!batch)
      return {
        RM: "Thiếu dữ liệu!",
        RC: 400,
      };

    const raw = [
      String(batch.id || "").trim(),
      String(batch.product_id || "").trim(),
      String(batch.QC_Pass ?? "0").trim(),
      String(batch.QC_Failed ?? "0").trim(),
      String(batch.qc_manager_id || "")
        .normalize("NFC")
        .trim(),
    ].join("|");
    const batch_hash = crypto.createHash("sha256").update(raw).digest("hex");

    if (batch_hash != batch.txt_hash) {
      return { RM: "Block không hợp lệ!", RC: 400 };
    }

    const payload = {
      timestamp: String(Date.now()),
      payload: {
        product_id: batch.id,
        type: "Batch_complate",
        hash: batch_hash,
        version: "1.0.2",
        Owner_id: batch.author,
        original_value: raw,
        detail: `Batch: ${batch.batch_name} | Pass: ${batch.QC_Pass} | Fail: ${batch.QC_Failed}`,
        status: "active",
      },
    };

    const commitResp = await pair_validate.pair_request(
      db,
      payload,
      nodes,
      "batch_trace",
    );

    if (commitResp.RC === 200) {
      return {
        RM: "Block hợp lệ!",
        RC: 200,
      };
    } else {
      return {
        RM: "Block không hợp lệ!",
        RC: 201,
      };
    }
  } catch (error) {
    console.error(error);
    return {
      RM: "Lỗi hệ thống!",
      RC: 500,
    };
  }
};

const ShipTrace = (db, nodes) => async (order, traceType) => {
  try {
    if (!order) {
      return { RM: "Thiếu dữ liệu đơn hàng!", RC: 400 };
    }

    let historyStatus = "";
    let historyOldOnchainStatus = "";
    let txt_hash = "";
    switch (traceType) {
      case "Shipping_Agreement":
        historyStatus = "proposed";
        txt_hash = "hash_agreement";
        historyOldOnchainStatus = "agreement_pending";
        break;

      case "Shipping_In_Transit":
        historyStatus = "shipping";
        txt_hash = "hash_transit";
        historyOldOnchainStatus = "agreement_hashed";
        break;

      case "Shipping_Delivered":
        historyStatus = "delivered";
        txt_hash = "hash_delivered";
        historyOldOnchainStatus = "pickup_verified";
        break;

      default:
        return { RM: "Loại Trace (traceType) không hợp lệ!", RC: 400 };
    }

    const batchIds = order.batches?.map((b) => b.id).join(",") || "no_batch";

    const raw = [
      String(order.id || "").trim(),
      String(historyStatus || "").trim(),
      String(historyOldOnchainStatus || "").trim(),
      String(batchIds || "").trim(),
      String(order.total_ship_price ?? "0").trim(),
      String(order.total_quantity ?? "0").trim(),
      String(order.product_total_price ?? "0").trim(),
      String(order.sender_id || "").trim(),
      String(order.customer_id || "").trim(),
      String(order.shipping_partner || "")
        .normalize("NFC")
        .trim(),
    ].join("|");

    // Tạo Hash
    const order_hash = crypto.createHash("sha256").update(raw).digest("hex");

    if (order_hash != order[txt_hash]) {
      return { RM: "Block không hợp lệ!", RC: 400 };
    }
    const Owner_id = `${order.sender_id}|${order?.customer_id}|${order?.shipping_partner}`;

    const payload = {
      timestamp: String(Date.now()),
      payload: {
        product_id: order.id,
        type: traceType,
        hash: order_hash,
        version: "1.0.1",
        Owner_id: Owner_id,
        original_value: raw,
        status: "active",
      },
    };

    const commitResp = await pair_validate.pair_request(
      db,
      payload,
      nodes,
      "ship_trace",
    );

    if (commitResp.RC === 200) {
      return {
        RM: "Block hợp lệ!",
        RC: 200,
      };
    } else {
      return {
        RM: "Block không hợp lệ!",
        RC: 201,
      };
    }
  } catch (error) {
    console.error("[ShipTrace Error]", error);
    return {
      RM: "Lỗi hệ thống khi Trace!",
      RC: 500,
    };
  }
};

const ProductionTraceLine = (db, nodes) => async (req, res) => {
  try {
    const { batch_id } = req?.params;
    if (!batch_id) {
      return res.status(400).json({ RC: 400, RM: "Thiếu dữ liệu định danh!" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const timeline = [];
    let stepCount = 1;
    const involvedCompanyIds = [];

    send({
      step: 1,
      progress: 10,
      msg: "Đang trích xuất dữ liệu Lô hàng & Sản phẩm...",
    });

    const batch = await db.product_batch.findOne({
      where: { id: batch_id },
      include: [
        { model: db.Product, as: "product" },
        { model: db.Product_Metadata, as: "product_version" },
        { model: db.Manufacturer, as: "Manufacture_manager" },
      ],
    });

    if (!batch || !batch.product || !batch.product_version) {
      send({
        step: -1,
        progress: 0,
        msg: "Không tìm thấy thông tin lô hàng hoặc sản phẩm bị lỗi dữ liệu!",
        error: true,
      });
      return res.end();
    }

    const product_master = batch.product;
    const product_metadata = batch.product_version;

    involvedCompanyIds.push(product_master.author, batch.qc_manager_id);

    const shipping_order = await db.shipping_order.findOne({
      include: [
        {
          model: db.product_batch,
          as: "batches",
          where: { id: batch_id },
          attributes: ["id"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    send({
      step: 2,
      progress: 30,
      msg: "Đang xác thực thông tin Sản phẩm trên Blockchain...",
    });

    const prodTrace = await ProductTrace(db, nodes)(
      product_master,
      product_metadata,
    );
    timeline.push({
      step: stepCount++,
      type: "product_create",
      title: "Hồ sơ sản phẩm gốc",
      detail: `Mã SP: ${product_master.id}`,
      author_id: product_master.author,
      is_verified_onchain: prodTrace.RC === 200,
      timestamp: product_master.createdAt,
    });

    send({
      step: 3,
      progress: 50,
      msg: "Đang kiểm tra tính toàn vẹn của Lô hàng (QC)...",
    });
    const bTrace = await BatchTrace(db, nodes)(batch);
    timeline.push({
      step: stepCount++,
      type: "Batch_complate",
      title: "Đóng gói & Kiểm định",
      detail: `Lô: ${batch.batch_name} | Pass: ${batch.QC_Pass} | Fail: ${batch.QC_Failed}`,
      author_id: batch.qc_manager_id,
      is_verified_onchain: bTrace.RC === 200,
      timestamp: batch.createdAt,
    });

    if (shipping_order) {
      involvedCompanyIds.push(
        shipping_order.sender_id,
        shipping_order.customer_id,
      );
      if (shipping_order.shipping_partner) {
        involvedCompanyIds.push(shipping_order.shipping_partner);
      }

      send({
        step: 4,
        progress: 65,
        msg: "Đang truy xuất Hành trình Vận chuyển...",
      });
      const currentShipStatus = shipping_order.onchain_status;

      if (
        ["agreement_hashed", "pickup_verified", "delivery_signed"].includes(
          currentShipStatus,
        )
      ) {
        const shipAgree = await ShipTrace(db, nodes)(
          shipping_order,
          "Shipping_Agreement",
        );
        timeline.push({
          step: stepCount++,
          type: "Shipping_Agreement",
          title: "Khởi tạo vận đơn",
          detail: `Đơn vị VC: ${shipping_order.shipping_partner || "Nội bộ"}`,
          author_id: shipping_order.sender_id,
          is_verified_onchain: shipAgree.RC === 200,
          timestamp: shipping_order.createdAt,
        });
      }

      if (["pickup_verified", "delivery_signed"].includes(currentShipStatus)) {
        const shipTransit = await ShipTrace(db, nodes)(
          shipping_order,
          "Shipping_In_Transit",
        );
        timeline.push({
          step: stepCount++,
          type: "Shipping_In_Transit",
          title: "Xuất kho phân phối",
          detail: "Lô hàng đang được vận chuyển tới đại lý",
          author_id:
            shipping_order.shipping_partner || shipping_order.sender_id,
          is_verified_onchain: shipTransit.RC === 200,
          timestamp: shipping_order.updatedAt,
        });
      }

      if (currentShipStatus === "delivery_signed") {
        const shipDeliver = await ShipTrace(db, nodes)(
          shipping_order,
          "Shipping_Delivered",
        );
        timeline.push({
          step: stepCount++,
          type: "Shipping_Delivered",
          title: "Đã tới điểm bán",
          detail: `Đại lý nhận: ${shipping_order.customer_id}`,
          author_id: shipping_order.customer_id,
          is_verified_onchain: shipDeliver.RC === 200,
          timestamp: shipping_order.updatedAt,
        });
      }
    }

    send({
      step: 5,
      progress: 85,
      msg: "Đang xác thực danh tính các Doanh nghiệp tham gia...",
    });

    const uniqueCompanyIds = [...new Set(involvedCompanyIds.filter(Boolean))];
    const companies_map = {};

    try {
      const mfg = await db.Manufacturer.findAll({
        where: { id: uniqueCompanyIds },
      });
      const trp = await db.Transporter.findAll({
        where: { id: uniqueCompanyIds },
      });
      const dst = await db.Distributor.findAll({
        where: { id: uniqueCompanyIds },
      });
      const rtl = await db.Retailer.findAll({
        where: { id: uniqueCompanyIds },
      });

      const allCompanies = [...mfg, ...trp, ...dst, ...rtl];

      for (const comp of allCompanies) {
        const companyObj = {
          id: comp.id,
          company_name: comp.company_name || comp.name || "Unknown",
          license_number: comp.license_number || "no_license",
          tax_code: comp.tax_code || "no_tax",
          txt_hash: comp.txt_hash,
          author: comp.id,
        };

        const cTrace = await CompanyTrace(db, nodes)(companyObj);

        companies_map[comp.id] = {
          name: companyObj.company_name,
          logo: comp.image || comp.logo || null,
          address: comp.Address || comp.address || "",
          role: comp.role || "Doanh nghiệp",
          is_verified_onchain: cTrace.RC === 200,
        };
      }
    } catch (e) {
      console.log("Cảnh báo: Lỗi khi móc thông tin cty: ", e.message);
    }

    send({
      step: 6,
      progress: 100,
      msg: "Hoàn tất truy xuất chuỗi cung ứng!",
      result: {
        product_info: {
          name: product_metadata.name,
          price: product_metadata.price,
          version: product_metadata.version,
          author_id: product_master.author,
        },
        batch_info: {
          batch_name: batch.batch_name,
          qc_manager_id: batch.qc_manager_id,
          qc_pass: batch.QC_Pass || 0,
          qc_fail: batch.QC_Failed || 0,
        },
        companies_info: companies_map,
        timeline: timeline,
      },
    });

    res.end();
  } catch (error) {
    console.error("!!! Error at ProductionTraceLine SSE:", error);
    res.write(
      `data: ${JSON.stringify({ step: -1, progress: 0, msg: "Lỗi hệ thống khi quét mã QR", error: error.message })}\n\n`,
    );
    res.end();
  }
};

const getAdminCompanyInfo = (db) => async (req, res) => {
  try {
    const { type } = req.params;
    let { status, page = 1, limit = 10 } = req.params;

    if (!type || !db[type]) {
      return res
        .status(400)
        .json({ RC: -203, RM: "Loại doanh nghiệp không hợp lệ!" });
    }

    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    const companyData = await db[type].findAndCountAll({
      where: {
        status: status,
      },
      limit: limit,
      offset: offset,
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      RC: 200,
      RM: "Lấy dữ liệu thành công",
      RD: {
        list: companyData.rows,
        total: companyData.count,
        totalPages: Math.ceil(companyData.count / limit),
        currentPage: page,
      },
    });
  } catch (error) {
    console.error(">>> [getAdminCompanyInfo ERR]:", error);
    return res.status(500).json({ RC: -500, RM: "Lỗi hệ thống máy chủ" });
  }
};

const approveCompany = (db) => async (req, res) => {
  try {
    const { type, company_id } = req.body;

    if (!type || !company_id || !db[type]) {
      return res.status(400).json({ RC: -400, RM: "Thiếu dữ liệu duyệt" });
    }

    await db[type].update({ status: "active" }, { where: { id: company_id } });

    return res
      .status(200)
      .json({ RC: 200, RM: "Duyệt doanh nghiệp thành công!" });
  } catch (error) {
    return res.status(500).json({ RC: -500, RM: "Lỗi hệ thống" });
  }
};

const changeStatusCompany = (db) => async (req, res) => {
  try {
    const { type, company_id, status } = req?.body || {};

    if (!type || !company_id || !status) {
      return res.status(400).json({
        RC: -203,
        RM: "Thiếu thông tin bắt buộc để thực hiện (type, company_id, status)!",
      });
    }

    if (!db[type]) {
      return res.status(400).json({
        RC: -400,
        RM: "Loại hình doanh nghiệp (Model Type) không tồn tại trên hệ thống!",
      });
    }

    const company = await db[type].findByPk(company_id);
    if (!company) {
      return res.status(404).json({
        RC: -404,
        RM: "Không tìm thấy thông tin doanh nghiệp yêu cầu đổi trạng thái!",
      });
    }

    const updatePayload = { status: status };

    await company.update(updatePayload);

    return res.status(200).json({
      RC: 200,
      RM: `Cập nhật trạng thái doanh nghiệp sang '${status}' thành công!`,
    });
  } catch (error) {
    console.error(">>> [API changeStatusCompany CRASH ERR]:", error);
    return res.status(500).json({
      RC: -500,
      RM: "Lỗi hệ thống máy chủ khi thực hiện thay đổi trạng thái doanh nghiệp!",
    });
  }
};

const getekycWallet = (db) => async (req, res) => {
  try {
    let { page = 1, limit = 10 } = req.params;
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;
    const { Op } = db.Sequelize;

    const walletData = await db.Company_Wallets.findAndCountAll({
      where: {
        is_verified: false,
        wallet_kyc: { [Op.ne]: null },
      },
      limit: limit,
      offset: offset,
      order: [["updatedAt", "DESC"]],

      include: [
        { model: db.Manufacturer, as: "company_m", required: false },
        { model: db.Distributor, as: "company_d", required: false },
        { model: db.Retailer, as: "company_r", required: false },
        { model: db.Transporter, as: "company_t", required: false },
      ],
    });

    const flattenedList = walletData.rows.map((wallet) => {
      let companyInfo = null;
      let companyType = "Unknown";

      if (wallet.company_m) {
        companyInfo = wallet.company_m;
        companyType = "Manufacturer";
      } else if (wallet.company_d) {
        companyInfo = wallet.company_d;
        companyType = "Distributor";
      } else if (wallet.company_r) {
        companyInfo = wallet.company_r;
        companyType = "Retailer";
      } else if (wallet.company_t) {
        companyInfo = wallet.company_t;
        companyType = "Transporter";
      }

      return {
        wallet_id: wallet.id,
        company_id: wallet.company_id,
        bank_code: wallet.bank_code,
        account_number: wallet.account_number,
        account_name: wallet.account_name,
        balance: parseFloat(wallet.balance || 0),
        status: wallet.status,
        wallet_kyc: wallet.wallet_kyc,
        updatedAt: wallet.updatedAt,

        company_type: companyType,
        company_name: companyInfo ? companyInfo.company_name : "N/A",
        license_number: companyInfo ? companyInfo.license_number : "N/A",
        contact_person: companyInfo ? companyInfo.contact_person : "N/A",
        contact_phone: companyInfo
          ? companyInfo.contact_phone || companyInfo.contact_number
          : "N/A",
        logo: companyInfo ? companyInfo.logo : null,
      };
    });

    return res.status(200).json({
      RC: 200,
      RM: "Lấy danh sách hàng chờ duyệt eKYC Ví thành công!",
      RD: {
        list: flattenedList,
        total: walletData.count,
        totalPages: Math.ceil(walletData.count / limit),
        currentPage: page,
      },
    });
  } catch (error) {
    console.error(">>> [API getekycWallet CRASH ERROR]:", error);
    return res.status(500).json({
      RC: -500,
      RM: "Lỗi hệ thống máy chủ khi tải danh sách eKYC!",
    });
  }
};

const verify_company_wallet = (db) => async (req, res) => {
  try {
    const { wallet_id, actionType, reject_reason } = req?.body || {};

    if (!wallet_id || !actionType) {
      return res.status(400).json({
        RC: -203,
        RM: "Thiếu thông tin xử lý (wallet_id hoặc hành động duyệt actionType)!",
      });
    }

    const wallet = await db.Company_Wallets.findByPk(wallet_id);
    if (!wallet) {
      return res.status(404).json({
        RC: -404,
        RM: "Không tìm thấy thông tin tài khoản ví yêu cầu phê duyệt!",
      });
    }

    if (actionType === "approve") {
      await wallet.update({
        is_verified: true,
        status: "active",
        reject_resson: null,
      });

      return res.status(200).json({
        RC: 200,
        RM: "Đã phê duyệt chứng từ eKYC và kích hoạt tài khoản Ví thành công!",
      });
    } else if (actionType === "reject") {
      const finalReason =
        reject_reason ||
        reject_resson ||
        "Chứng từ xác thực không hợp lệ hoặc không rõ ràng. Vui lòng kiểm tra và tải lên lại tệp khác.";

      if (wallet.wallet_kyc) {
        try {
          const filePath = path.join(
            process.cwd(),
            "src",
            "Access",
            "company_wallet_kyc",
            wallet.wallet_kyc,
          );

          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(
              `>>> [REJECT CLEANUP]: Đã xóa file chứng từ bị từ chối: ${wallet.wallet_kyc}`,
            );
          }
        } catch (cleanupError) {
          console.error(
            ">>> [REJECT CLEANUP WARN]: Không thể xóa file:",
            cleanupError.message,
          );
        }
      }

      await wallet.update({
        is_verified: false,
        status: "reject",
        reject_resson: finalReason,
        wallet_kyc: null,
      });

      return res.status(200).json({
        RC: 200,
        RM: `Đã từ chối chứng từ eKYC thành công với lý do: "${finalReason}"!`,
      });
    } else {
      return res.status(400).json({
        RC: -400,
        RM: "Hành động xử lý (actionType) không hợp lệ! Chỉ cho phép 'approve' hoặc 'reject'.",
      });
    }
  } catch (error) {
    console.error(">>> [API verify_company_wallet CRASH ERROR]:", error);
    return res.status(500).json({
      RC: -500,
      RM: "Lỗi hệ thống máy chủ khi thực hiện phê duyệt eKYC ví!",
    });
  }
};

export default {
  getekycWallet,
  verify_company_wallet,
  AcceptAndSignOrder,
  changeStatusCompany,
  getAdminCompanyInfo,
  ArrivedShip,
  ProductionTraceLine,
  getBox,
  createBox,
  StartShip,
  truckInBatch,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  sendRequestShiping,
  senderReadyTopick,
  shipingComplete,
  PindDriver,
  getShipperLocation,
  receiverConfirm,
  updateShipingStatus,
  TransAcceptShip,
  reupdateBatch,
  truckInConfirm,
  disAcceptShippingOrderApi,
  fetchFleetValidApi,
  getShipingProccess,
  set_new_shipping,
  getTransporterPrice,
  upload_vehicle,
  getShipingInfo,
  Qcresult,
  complateBatched,
  fetchFleet,
  getAllvehicle,
  handleCreateFleetAPI,
  getNotification,
  getOrphanVehicles,
  newOrderrequest,
  AcceptingOrder,
  getProposalProduct,
  signContract,
  updateBatchQuantityApi,
  editProduct,
  newOEMrequest,
  getValidOEMDepartment,
  fecthOEMproduction,
  user_uploadavatar,
  generateFinalContractHash,
  sendContract,
  cleanupSingleFile,
  RejectsendContract,
  AcceptsendContract,
  acceptProposal,
  createContractTemplate,
  RejectProposal,
  getContract,
  cancelProposal,
  newPolicy,
  new_proposal,
  generateSecureHash,
  fetchCollaborationProposals,
  newInternalMarketinfo,
  getCompanyPolicy,
  getInternalMarketInfo,
  getQCReadyBatches,
  getCompletedBatches,
  getDepartmentsBatch,
  updateBatchState,
  createBatch,
  getValidDepartment,
  getValidProduct,
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
  verifyTemplateIntegrity,
  cleanupUploadedFiles,
  getUserProductList,
  create_Admin_node,
};
