import crypto from "crypto";
import pair_validate from "../../core_API/pair_validate.js";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { pendingRequests } from "../../../meta_server.js";
import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";
import Helper__funtion from "../../utils/Helper__funtion.js";
import { Op } from "sequelize";
import meta_controller from "./meta_controller.js";
import meta_core_controller from "./meta_core_controller.js";
import { version } from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRIVATE_KEY = fs.readFileSync(
  path.resolve(__dirname, "../../utils/node_private.pem"),
  "utf8",
);

const PUBLIC_KEY = fs.readFileSync(
  path.resolve(__dirname, "../../utils/node_public.pem"),
  "utf8",
);

export const voteRounds = new Map();
const voteRoundId = crypto.randomUUID();

const waitVoteRound = new Promise((resolve) => {
  const timeoutId = setTimeout(() => {
    const round = voteRounds.get(voteRoundId);
    if (!round) return;

    round.status = "TIMEOUT";
    voteRounds.delete(voteRoundId);

    resolve({
      timeout: true,
      votes: Array.from(round.votes.values()),
    });
  }, 10000);

  voteRounds.set(voteRoundId, {
    status: "OPEN",
    votes: new Map(),
    resolve,
    timeoutId,
    createdAt: Date.now(),
  });
});

const auto_pair_product = async (db, nodes) => {
  try {
    const settings = await db.System_Settings.findOne({
      where: { key: "ATOAPP" },
    });

    if (!settings || settings.enabled !== true) {
      return { ok: false, msg: "Auto approve product is disabled." };
    }

    const metadata_list = await db.Product_Metadata.findAll({
      where: { chain_status: "pending" },
      limit: 15,
      include: [
        {
          model: db.Product,
          as: "master",
          required: true,
        },
      ],
    });

    if (!metadata_list || metadata_list.length === 0) {
      return { ok: false, msg: "Không có metadata sản phẩm nào pending." };
    }

    const result_map = [];

    for (const metadata of metadata_list) {
      await metadata.update({ chain_status: "pairing" });

      const product_master = metadata.master;

      const item_result = {
        metadata_id: metadata.id,
        product_id: product_master.id,
        vote: null,
        commit: null,
        status: "pairing",
      };

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

      const product_hash = crypto
        .createHash("sha256")
        .update(raw)
        .digest("hex");

      const vote_results = await pair_validate.get_vote(
        db,
        product_hash,
        metadata.id,
        "product_create",
        "active",
        nodes,
        metadata.version,
        metadata.version === 1 ? "new" : "update",
      );

      item_result.vote = vote_results;

      if (
        vote_results.RC !== 200 ||
        !vote_results.RD ||
        vote_results.RD.quorum_pass !== true
      ) {
        item_result.status = "vote_failed";
        await metadata.update({ chain_status: "pending" });
        result_map.push(item_result);
        continue;
      }

      const payload = {
        timestamp: String(Date.now()),
        payload: {
          product_id: product_master.id,
          metadata_id: metadata.id,
          type: "product_create",
          hash: product_hash,
          version: `${metadata.version}`,
          Owner_id: product_master.author,
          status: "active",
          original_value: raw,
          detail: `Version ${metadata.version} creation`,
        },
      };

      const commitResp = await pair_validate.pair_request(
        db,
        payload,
        nodes,
        "pair_product",
      );

      item_result.commit = commitResp;

      if (commitResp.RC === 200) {
        await metadata.update({
          chain_status: "active",
          txt_hash: product_hash,
        });
        item_result.status = "success";
      } else {
        await metadata.update({ chain_status: "pending" });
        console.log("commit_failed: ", JSON.stringify(item_result, null, 2));
        item_result.status = "commit_failed";
      }
      result_map.push(item_result);
    }

    return {
      ok: true,
      msg: "Đã xử lý danh sách metadata sản phẩm.",
      results: result_map,
    };
  } catch (error) {
    console.error("[auto_pair_product ERROR]", error);
    return {
      ok: false,
      msg: "Server nội bộ lỗi.",
      error: error.message,
    };
  }
};

const auto_pair_company = async (db, nodes) => {
  try {
    const settings = await db.System_Settings.findOne({
      where: { key: "ATOAPC" },
    });
    if (!settings || settings.enabled !== true) {
      return { ok: false, msg: "Tự động kích hoạt doanh nghiệp đang bị tắt." };
    }

    const [manufactors, retailers, distributors, transporters] =
      await Promise.all([
        db.Manufacturer.findAll({
          where: {
            chain_status: "pending",
            status: "active",
            license_number: {
              [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }],
            },

            company_name: {
              [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }],
            },
          },
          limit: 15,
        }),
        db.Retailer.findAll({
          where: {
            chain_status: "pending",
            status: "active",
            license_number: {
              [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }],
            },

            company_name: {
              [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }],
            },
          },
          limit: 15,
        }),
        db.Distributor.findAll({
          where: {
            chain_status: "pending",
            status: "active",
            license_number: {
              [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }],
            },

            company_name: {
              [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }],
            },
          },
          limit: 15,
        }),
        db.Transporter.findAll({
          where: {
            chain_status: "pending",
            status: "active",
            license_number: {
              [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }],
            },

            company_name: {
              [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }],
            },
          },
          limit: 15,
        }),
      ]);

    const company_all = [
      ...manufactors,
      ...retailers,
      ...distributors,
      ...transporters,
    ];

    if (company_all.length === 0) {
      return { ok: false, msg: "Không có doanh nghiệp nào đang chờ xử lý." };
    }

    const result_map = [];

    for (const company of company_all) {
      await company.update({ chain_status: "pairing" });

      const item_result = {
        company_id: company.id,
        status: "pairing",
        vote: null,
        commit: null,
      };

      const c_id = String(company.id || "").trim();
      const c_name = String(company.company_name || "")
        .normalize("NFC")
        .trim();
      const c_license = String(company.license_number || "no_license")
        .normalize("NFC")
        .trim();
      const c_tax = String(company.tax_code || "no_tax")
        .normalize("NFC")
        .trim();

      const raw = `${c_id}|${c_name}|${c_license}|${c_tax}`;
      const company_hash = crypto
        .createHash("sha256")
        .update(raw)
        .digest("hex");

      const vote_results = await pair_validate.get_vote(
        db,
        company_hash,
        company.id,
        "company_register",
        "active",
        nodes,
        "new",
      );

      item_result.vote = vote_results;

      if (vote_results.RC !== 200 || !vote_results.RD?.quorum_pass) {
        item_result.status = "vote_failed";
        await company.update({ chain_status: "pending" });
        result_map.push(item_result);
        continue;
      }

      const payload = {
        timestamp: String(Date.now()),
        payload: {
          current_id: company.id,
          type: "company_onboarding",
          Owner_id: company.actor_id,
          hash: company_hash,
          version: "1.0.0",
          detail: "on chain company/store",
          original_value: raw,
          status: "active",
        },
      };

      const commitResp = await pair_validate.pair_request(
        db,
        payload,
        nodes,
        "pair_other",
      );

      item_result.commit = commitResp;

      if (commitResp.RC === 200) {
        await company.update({
          chain_status: "active",
          txt_hash: company_hash,
        });
        item_result.status = "success";
        console.log(`[OK] Doanh nghiệp ${company.id} đã ON-CHAIN.`);
      } else {
        await company.update({ chain_status: "pending" });
        item_result.status = "commit_failed";
      }

      result_map.push(item_result);
    }

    return {
      ok: true,
      msg: `Đã xử lý xong ${company_all.length} doanh nghiệp.`,
      results: result_map,
    };
  } catch (error) {
    console.error("[auto_pair_company ERROR]", error);
    return { ok: false, msg: "Lỗi hệ thống nội bộ.", error: error.message };
  }
};

const broadcastToFE = (payload) => {
  for (const ws of feSockets) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }
};

const getNodeBaseInfomation = (nodes, db) => async (req, res) => {
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
    const nodeWsSystem = await axios.get(
      `${nodeMetaSystem.full_address}/admin/node/node-base-infomation/get-info`,
    );

    if (nodeWsSystem) {
      if (nodeWsSystem.data.RC !== 200) {
        nodeWsSystem.data.RD = nodeWsSystem.data.RM;
      }
    }

    send({
      step: 3,
      progress: 100,
      msg: "Node status fetched successfully",
      result: {
        nodeMetaSystem: nodeMetaSystem,
        nodeWsSystem: nodeWsSystem.data.RD,
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

const requestNodeStatus = async (nodes, NodeID) => {
  try {
    const requestId = uuidv4();

    if (!NodeID) {
      return {
        RC: -400,
        RM: "Missing NodeID in params",
        RD: null,
      };
    }

    const ws = nodes.get(NodeID);
    if (!ws) {
      return {
        RC: -404,
        RM: `Node '${NodeID}' is not connected`,
        RD: null,
      };
    }

    const waitResponse = new Promise((resolve) => {
      pendingRequests.set(requestId, resolve);
      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          resolve({ timeout: true });
        }
      }, 10000);
    });

    ws.send(
      JSON.stringify({
        type: "command",
        command: "get_status",
        requestId,
        serverTime: Date.now(),
      }),
    );

    const result = await waitResponse;

    if (result.timeout) {
      return {
        RC: -408,
        RM: "Node timeout",
        RD: null,
      };
    }

    return {
      RC: 200,
      RM: "Success",
      RD: result,
    };
  } catch (err) {
    console.error("requestNodeStatus error:", err);
    return {
      RC: 500,
      RM: "Internal server error",
      RD: null,
    };
  }
};

const get_global_node = async (db, nodes) => {
  try {
    const peer_map_list = {};
    let complate = 0;
    let failed = 0;

    const admin_block = {};
    let winner = null;

    const adminNodes = [];

    for (const [nodeId, ws] of nodes) {
      if (!ws || ws.readyState !== ws.OPEN) continue;

      const nodeData = await db.peer_map.findOne({
        where: {
          id: nodeId,
          health: "ok",
        },
      });
      if (!nodeData) continue;

      if (nodeData.node_type === "admin") {
        adminNodes.push({ nodeId, ws });
      }
    }

    if (adminNodes.length === 0) {
      return {
        RM: "[NO ADMIN ONLINE IN SYSTEM!]",
        RC: 409,
        RD: {},
      };
    }

    const quorum = Math.floor(adminNodes.length / 2) + 2;
    const tasks = [];

    for (const { nodeId, ws } of adminNodes) {
      const task = (async () => {
        peer_map_list[nodeId] = false;

        const requestId = uuidv4();

        const waitResponse = Helper__funtion.waitRpc(requestId, 3000);
        if (!ws._session?.sessionId) {
          failed++;
          return;
        }

        ws.send(
          JSON.stringify({
            type: "command",
            command: "get_global_node",
            sessionId: ws._session.sessionId,
            requestId,
            serverTime: Date.now(),
          }),
        );

        const result = await waitResponse;

        if (result?.timeout) {
          failed++;
          return;
        }

        if (result?.block?.ok === true) {
          peer_map_list[nodeId] = true;
          complate++;
        } else {
          failed++;
          return;
        }

        if (result.block.type === "admin") {
          admin_block[nodeId] = result.block;
        }
      })();

      tasks.push(task);
    }

    await Promise.allSettled(tasks);

    const adminResults = Object.values(admin_block).filter(
      (b) =>
        b &&
        b.ok === true &&
        b.type === "admin" &&
        b.block_hash &&
        b.height &&
        b.previous,
    );

    if (adminResults.length === 0) {
      return {
        RM: "No valid admin global node response",
        RC: 409,
        RD: { failed, complate },
      };
    }

    const consensusMap = {};

    for (const b of adminResults) {
      if (!consensusMap[b.block_hash]) {
        consensusMap[b.block_hash] = {
          count: 0,
          height: b.height,
          previous: b.previous,
          validators: [],
        };
      }

      consensusMap[b.block_hash].count++;
      consensusMap[b.block_hash].validators.push(b.validator);
    }

    for (const [hash, data] of Object.entries(consensusMap)) {
      if (!winner) {
        winner = { block_hash: hash, ...data };
        continue;
      }

      if (data.count > winner.count) {
        winner = { block_hash: hash, ...data };
        continue;
      }

      if (data.count === winner.count && data.height > winner.height) {
        winner = { block_hash: hash, ...data };
      }
    }

    if (winner.count < quorum) {
      await db.Global_Node.update(
        { network_status: "fork_risk" },
        { where: { id: 1 } },
      );

      return {
        RM: "Consensus not reached",
        RC: 409,
        RD: { failed, complate },
      };
    }

    await db.Global_Node.update(
      {
        global_height: winner.height,
        canonical_block_hash: winner.block_hash,
        previous_block_hash: winner.previous,
        last_commit_node: winner.validators.join(","),
        last_block_time: new Date(),
        updated_from: "pull",
        network_status: "healthy",
      },
      { where: { id: 1 } },
    );

    return {
      RM: "Global node synchronized",
      RC: 200,
      RD: {
        failed,
        complate,
        peer_map_list,
        consensus: {
          block_hash: winner.block_hash,
          height: winner.height,
          votes: winner.count,
        },
      },
    };
  } catch (error) {
    console.error("[get_global_node ERROR]", error);
    return {
      RM: "Internal server error",
      RC: 500,
      RD: error.message,
    };
  }
};

const auto_pair_user = async (db, nodes) => {
  try {
    const settings = await db.System_Settings.findOne({
      where: { key: "ATOAPU" },
    });

    if (!settings || settings.enabled !== true) {
      return { ok: false, msg: "Tự động kích hoạt user đang bị tắt (ATOAPU)." };
    }

    const user_list = await db.Actor_model.findAll({
      where: {
        role_active: "active",
        status: "pending",
        public_key: {
          [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "null" }, { [Op.ne]: "" }],
        },
      },
      limit: 15,
    });

    if (!user_list || user_list.length === 0) {
      return { ok: false, msg: "Không có người dùng pending hợp lệ." };
    }

    const versionSetting = await db.System_Settings.findOne({
      where: { key: "APPVS" },
    });
    const appVersion = versionSetting ? versionSetting.description : "1.0.0";

    const node_map = await db.peer_map.findAll({
      where: { status: "active", health: "ok" },
    });
    const quorum = Math.ceil((2 * node_map.length) / 3);

    const result_map = [];

    for (const user of user_list) {
      const TRACE = `[PROCESS_USER_BLOCK][${user.id}]`;
      const item_result = { user_id: user.id, status: "failed" };

      try {
        console.log(`${TRACE} Đang xử lý On-chain cho User...`);

        await user.update({ status: "pairing" });

        const u_id = String(user.id || "").trim();
        const u_email = String(user.email || "")
          .normalize("NFC")
          .trim();
        const u_pk = String(user.public_key || "").trim();
        const u_role = String(user.role || "").trim();

        const raw = `${u_id}|${u_email}|${u_pk}|${u_role}`;
        const user_hash = crypto.createHash("sha256").update(raw).digest("hex");

        const payload = {
          timestamp: String(Date.now()),
          user: {
            id: user.id,
            hash: user_hash,
            version: appVersion,
            type: "create_user",
            original_value: raw,
          },
        };

        const vote_results = await pair_validate.get_vote(
          db,
          raw,
          user.id,
          "user_create",
          "active",
          nodes,
          "new",
        );

        if (
          vote_results.RC !== 200 ||
          (vote_results.RD && vote_results.RD.vote_true < quorum)
        ) {
          console.warn(
            `${TRACE} ABORT: Không đủ phiếu Vote đồng thuận (Quorum: ${quorum}).`,
          );
          await user.update({ status: "pending" });
          item_result.msg = "Lỗi đồng thuận Vote.";
          result_map.push(item_result);
          continue;
        }

        const commitResp = await pair_validate.pair_request(
          db,
          payload,
          nodes,
          "pair_user",
        );

        if (commitResp.RC !== 200) {
          console.warn(`${TRACE} ABORT: Các Node từ chối Commit Block.`);
          await user.update({ status: "pending" });
          item_result.msg = "Không đủ số node commit block.";
          result_map.push(item_result);
          continue;
        }

        await user.update({ status: "active", txt_hash: user_hash });
        item_result.status = "success";
        item_result.msg = "User đã được xác thực ON-CHAIN thành công.";
        console.log(`${TRACE} XONG! Đã Commit Block.`);

        result_map.push(item_result);
      } catch (innerError) {
        console.error(`${TRACE} LỖI CỤC BỘ TRONG VÒNG LẶP:`, innerError);
        await user.update({ status: "pending" });
        item_result.msg = innerError.message;
        result_map.push(item_result);
      }
    }

    return {
      ok: true,
      msg: `Đã xử lý xong batch ${user_list.length} users.`,
      results: result_map,
    };
  } catch (error) {
    console.error("[auto_pair_user ERROR] LỖI TOÀN HỆ THỐNG:", error);
    return {
      ok: false,
      msg: "Server nội bộ lỗi.",
      error: error.message,
    };
  }
};

const getBlockFormHeight = async (db, nodes, from_height, limit) => {
  const syncId = `SYNC_${Date.now()}`;
  try {
    console.log(
      `[${syncId}] START sync from_height= ${from_height}, limit= ${limit}`,
    );

    const peer_map_list = {};
    let complate = 0;
    let failed = 0;

    if (!Number.isInteger(from_height) || from_height < 0) {
      console.warn(`[${syncId}] INVALID from_height`);
      return { RM: "height request no valid", RC: 409, RD: [] };
    }

    if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
      console.warn(`[${syncId}] INVALID limit`);
      return { RM: "limit request no valid", RC: 409, RD: [] };
    }

    const adminNodes = [];

    for (const [nodeId, ws] of nodes) {
      if (!ws || ws.readyState !== ws.OPEN) continue;
      const nodeData = await db.peer_map.findOne({
        where: {
          id: nodeId,
          health: "ok",
        },
      });

      if (!nodeData) continue;

      if (nodeData.node_type === "admin") {
        adminNodes.push({ nodeId, ws });
      }
    }

    console.log(
      `[${syncId}] ADMIN NODES ONLINE:`,
      adminNodes.map((n) => n.nodeId),
    );

    if (adminNodes.length === 0) {
      console.warn(`[${syncId}] NO ADMIN NODE ONLINE`);
      return { RM: "[NO ADMIN ONLINE IN SYSTEM!]", RC: 409, RD: [] };
    }

    const quorum = Math.floor(adminNodes.length / 2) + 1;

    const tasks = [];
    const adminResponses = [];

    for (const { nodeId, ws } of adminNodes) {
      const task = (async () => {
        peer_map_list[nodeId] = false;

        const requestId = uuidv4();

        const waitResponse = Helper__funtion.waitRpc(requestId, 3000);

        ws.send(
          JSON.stringify({
            type: "command",
            command: "get_block_sync",
            from: from_height,
            sessionId: ws._session.sessionId,
            limit,
            requestId,
            serverTime: Date.now(),
          }),
        );

        const result = await waitResponse;

        if (result?.timeout) {
          console.warn(`[${syncId}] TIMEOUT from ${nodeId}`);
          failed++;
          return;
        }

        if (
          result?.ok === true &&
          result?.node_type === "admin" &&
          Array.isArray(result?.blocks)
        ) {
          peer_map_list[nodeId] = true;
          complate++;
          adminResponses.push({
            validator: result.validator || nodeId,
            blocks: result.blocks,
          });
        } else {
          console.warn(`[${syncId}] INVALID RESPONSE from ${nodeId}`);
          failed++;
        }
      })();

      tasks.push(task);
    }

    await Promise.allSettled(tasks);

    console.log(`[${syncId}] RESPONSES: success=${complate}, failed=${failed}`);

    if (adminResponses.length === 0) {
      console.warn(`[${syncId}] NO VALID ADMIN RESPONSE`);
      return { RM: "No valid admin responses", RC: 409, RD: [] };
    }

    const blockByHeight = {};
    const startHeight = from_height + 1;
    const endHeight = from_height + limit;

    for (const admin of adminResponses) {
      console.log(`[${syncId}] VALIDATE BLOCK SEQ from ${admin.validator}`);

      if (!Array.isArray(admin.blocks) || admin.blocks.length === 0) continue;

      const first = admin.blocks[0];
      if (first.Height !== startHeight) {
        console.warn(
          `[${syncId}] DROP ${admin.validator} wrong start height ${first.Height}`,
        );
        continue;
      }

      if (admin.blocks.length > limit) {
        console.warn(`[${syncId}] DROP ${admin.validator} exceed limit`);
        continue;
      }

      let expectedH = startHeight;
      let okSeq = true;

      for (const b of admin.blocks) {
        if (b.Height !== expectedH) {
          okSeq = false;
          break;
        }
        expectedH++;
      }

      if (!okSeq) {
        console.warn(`[${syncId}] DROP ${admin.validator} broken sequence`);
        continue;
      }

      for (const block of admin.blocks) {
        if (!blockByHeight[block.Height]) blockByHeight[block.Height] = {};

        if (!blockByHeight[block.Height][block.Hash]) {
          blockByHeight[block.Height][block.Hash] = {
            count: 0,
            block,
            validators: [],
          };
        }

        blockByHeight[block.Height][block.Hash].count++;
        blockByHeight[block.Height][block.Hash].validators.push(
          admin.validator,
        );
      }
    }

    console.log(`[${syncId}] HEIGHTS COLLECTED:`, Object.keys(blockByHeight));

    const heights = Object.keys(blockByHeight)
      .map(Number)
      .sort((a, b) => a - b);

    const canonicalBlocks = [];
    let expectedHeight = startHeight;
    let previousHash = "GENESIS";
    console.log("start_height: ", startHeight);
    for (const height of heights) {
      if (height !== expectedHeight) break;

      const candidates = Object.values(blockByHeight[height]);
      let winner = null;

      for (const c of candidates) {
        if (c.count < quorum) continue;
        if (
          expectedHeight !== startHeight &&
          c.block.PreviousHash !== previousHash
        )
          continue;

        if (!winner || c.count > winner.count) winner = c;
      }

      if (!winner) break;

      canonicalBlocks.push({
        ...winner.block,
        validators: winner.validators,
        votes: winner.count,
      });

      previousHash = winner.block.Hash;
      expectedHeight++;
      if (expectedHeight > endHeight) break;
    }

    let lastHeight = 0;
    if (canonicalBlocks.length !== 0) {
      lastHeight = canonicalBlocks[canonicalBlocks.length - 1].Height;
    }
    const lastestBlock = await db.Global_Node.findByPk(1);
    console.log("canonicalBlocks.length: ", canonicalBlocks.length);
    console.log("lastHeight: ", lastHeight);
    console.log("from_height: ", from_height);
    console.log("lastestBlock.global_height: ", lastestBlock.global_height);
    let sync_status = "";
    if (canonicalBlocks.length === 0) {
      sync_status = "out_block";
    } else if (lastHeight === lastestBlock.global_height) {
      sync_status = "complate";
    } else {
      sync_status = "syncing";
    }

    return {
      RM: "Canonical blocks calculated",
      RC: 200,
      RD: {
        sync_status: sync_status,
        blocks: canonicalBlocks,
        height: lastHeight,
        failed,
        complate,
        peer_map_list,
        quorum,
      },
    };
  } catch (error) {
    console.error(`[${syncId}] ERROR`, error);
    return { RM: "Internal server error", RC: 500, RD: error.message };
  }
};

const auto_repair_chain = async (db, nodes, archor_blocks) => {
  try {
    const global_block = await db.Global_Node.findOne();
    if (!archor_blocks) {
      return {
        RM: "fork point is first pos!",
        RC: 200,
        RD: {
          status: "not_truth",
          forkPoint: from_height,
        },
      };
    }
    const from_height = archor_blocks[archor_blocks.length - 1].Height;

    const adminResult = await getBlockFormHeight(db, nodes, from_height, 50);

    if (adminResult.RC !== 200) {
      return {
        status: "error",
        reason: adminResult.RM,
      };
    }

    const adminBlocks = adminResult.RD.blocks;
    if (!adminBlocks || adminBlocks.length === 0) {
      return {
        RM: "fork point is first pos!",
        RC: 200,
        RD: {
          status: "not_truth",
          forkPoint: from_height,
        },
      };
    }

    const anchorMap = new Map();
    for (const a of archor_blocks) {
      anchorMap.set(a.Height, a.Hash);
    }

    let forkPoint = from_height;

    for (const b of adminBlocks) {
      const anchorHash = anchorMap.get(b.Height);

      if (!anchorHash) {
        break;
      }

      if (anchorHash !== b.Hash) {
        break;
      }

      forkPoint = b.Height;
    }

    return {
      RM: "found",
      RC: 200,
      RD: {
        status: "truth",
        active: forkPoint == global_block.global_height ? true : false,
        forkPoint,
        adminBlocks,
      },
    };
  } catch (error) {
    console.error("[auto_repair_chain ERROR]", error);
    return {
      status: "error",
      reason: "internal_server_error",
    };
  }
};

const MaintenanceNode = (db, nodes) => async (req, res) => {
  const requestId = uuidv4();
  const startTime = Date.now();

  try {
    const { NodeID } = req.body;

    if (!NodeID) {
      console.warn(`[MAINTENANCE][${requestId}] Missing NodeID`);
      return res.status(400).json({
        RM: "Missing paramater!",
        RC: 203,
        RD: false,
      });
    }

    console.log(`[MAINTENANCE][${requestId}] Lookup node in DB`, { NodeID });

    const node = await db.peer_map.findOne({
      where: {
        id: NodeID,
        health: "ok",
        status: "active",
      },
    });

    if (!node) {
      console.warn(
        `[MAINTENANCE][${requestId}] Node not found or invalid state`,
        {
          NodeID,
        },
      );
      return res.status(400).json({
        RC: -404,
        RM: `Node '${NodeID}' is not found`,
        RD: false,
      });
    }

    const ws = nodes.get(NodeID);

    if (!ws) {
      console.warn(`[MAINTENANCE][${requestId}] Node socket not connected`, {
        NodeID,
      });
      return res.status(400).json({
        RC: -404,
        RM: `Node '${NodeID}' is not connected`,
        RD: false,
      });
    }

    console.log(`[MAINTENANCE][${requestId}] WS state`, {
      readyState: ws.readyState,
    });

    if (ws.readyState !== 1) {
      console.warn(`[MAINTENANCE][${requestId}] WS not ready`, {
        readyState: ws.readyState,
      });
      return res.status(400).json({
        RC: -410,
        RM: "Node socket not ready",
        RD: false,
      });
    }

    const waitResponse = Helper__funtion.waitRpc(requestId, 3000);

    console.log(
      `[MAINTENANCE][${requestId}] Sending maintenance command to node`,
    );

    await ws.send(
      JSON.stringify({
        type: "Maintenance",
        sessionId: ws._session.sessionId,
        requestId,
        serverTime: Date.now(),
      }),
    );

    const result = await waitResponse;

    console.log(`[MAINTENANCE][${requestId}] Response received`, result);

    if (result.timeout) {
      return res.status(400).json({
        RC: -408,
        RM: "Node timeout",
        RD: false,
      });
    }

    if (result.ok) {
      console.log(
        `[MAINTENANCE][${requestId}] Update node health to maintenance`,
      );

      await node.update({
        health: "maintenance",
      });

      console.log(`[MAINTENANCE][${requestId}] SUCCESS`, {
        durationMs: Date.now() - startTime,
      });

      return res.status(200).json({
        RC: 200,
        RM: "Success",
        RD: true,
      });
    }

    console.warn(
      `[MAINTENANCE][${requestId}] Node rejected maintenance`,
      result,
    );

    return res.status(200).json({
      RC: 200,
      RM: "Failed",
      RD: false,
    });
  } catch (err) {
    console.error(`[MAINTENANCE][${requestId}] INTERNAL ERROR`, err);

    return res.status(500).json({
      RC: 500,
      RM: "Internal server error",
      RD: false,
    });
  }
};

const Drop_block = async (db, nodes) => {
  try {
    const drop_list = await db.Product_Metadata.findAll({
      where: {
        chain_status: "wait-droped",
      },
      limit: 15,
      attributes: ["id"], // Lấy Metadata ID (Lá)
    });

    if (drop_list.length < 1) {
      return;
    }

    const onlineEntries = [];
    for (const [nodeId, ws] of nodes) {
      if (ws && ws.readyState === ws.OPEN) {
        onlineEntries.push([nodeId, ws]);
      }
    }

    const expectedVotes = onlineEntries.length;
    if (expectedVotes === 0) {
      console.warn("NO ONLINE NODES → ABORT");
      return {
        RC: 503,
        RM: "No online nodes to vote",
        RD: null,
      };
    }

    const voteRes = await pair_validate.get_drop_vote(
      db,
      nodes,
      drop_list,
      onlineEntries,
      expectedVotes,
    );

    if (!voteRes || voteRes.RC !== 200) {
      console.warn("VOTE FAILED OR INVALID", voteRes?.RM);
      return;
    }

    const products =
      typeof voteRes.RD.products === "string"
        ? JSON.parse(voteRes.RD.products)
        : voteRes.RD.products;

    const approvedIds = Object.entries(products)
      .filter(([_, v]) => v.approve === true)
      .map(([id]) => id);

    let admin_online = 0;
    let client_online = 0;

    // 2. FIX BUG ẨN: Bắt buộc phải khởi tạo voteRoundId trước khi dùng
    const voteRoundId = uuidv4();

    const waitVoteRound = new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        // Lưu ý: Đảm bảo biến 'voteRounds' (Map) đã được định nghĩa ở global
        const round = voteRounds.get(voteRoundId);
        if (!round) return;

        console.warn("VOTE ROUND TIMEOUT", {
          voteRoundId,
        });

        round.status = "TIMEOUT";
        voteRounds.delete(voteRoundId);

        resolve({
          timeout: true,
          votes: Array.from(round.votes.values()),
        });
      }, 10_000);

      voteRounds.set(voteRoundId, {
        status: "OPEN",
        votes: new Map(),
        expectedVotes,
        timeoutId,
        resolve,
        shouldFinalize() {
          return this.votes.size >= this.expectedVotes;
        },
      });
    });

    if (approvedIds.length > 0) {
      for (const [nodeId, ws] of onlineEntries) {
        const nodeData = await db.peer_map.findByPk(nodeId);
        if (!nodeData) {
          // Lưu ý: Đảm bảo biến 'TAG' đã được định nghĩa
          console.warn("DROP_BLOCK", "NODE DATA NOT FOUND", nodeId);
          continue;
        }

        if (nodeData.node_type === "admin") admin_online++;
        else client_online++;

        ws.send(
          JSON.stringify({
            type: "command",
            command: "drop_product",
            sessionId: ws._session.sessionId,
            requestId: uuidv4(),
            voteRoundId,
            payload: {
              approvedIds, // Node C# sẽ nhận mảng Metadata_ID này để Drop
            },
            serverTime: Date.now(),
          }),
        );
      }

      // 3. FIX KIẾN TRÚC: Update trạng thái 'down' trên bảng Product_Metadata
      await db.Product_Metadata.update(
        { chain_status: "down" },
        { where: { id: approvedIds } },
      );

      const result = await waitVoteRound;
      console.log("drop_res: ", result);
    }
  } catch (error) {
    console.error("FATAL ERROR", error);
    return;
  }
};

const signature_rawdata = async (canonicalVotes) => {
  const data = JSON.stringify(canonicalVotes);

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(data, "utf8");
  signer.end();

  return signer.sign(KeyStore.getPrivateKey(), "base64");
};

const auto_pair_contract = async (db, nodes) => {
  try {
    const settings = await db.System_Settings.findOne({
      where: { key: "ATOACT" },
    });

    if (!settings || settings.enabled !== true) {
      return {
        ok: false,
        msg: "Tự động kích hoạt hợp đồng (On-chain) đang bị tắt.",
      };
    }

    const pendingContracts = await db.Company_Collaboration.findAll({
      where: {
        status: "official",
        onchain_status: "pending",
      },
      limit: 15,
      order: [["official_at", "ASC"]],
    });

    if (pendingContracts.length === 0) {
      return { ok: true, msg: "Không có hợp đồng nào đang chờ On-chain." };
    }

    const result_map = [];

    for (const contract of pendingContracts) {
      await contract.update({ onchain_status: "pairing" });

      const item_result = {
        contract_id: contract.id,
        status: "pairing",
        vote: null,
        commit: null,
      };

      const raw = [
        String(contract.id || "").trim(),
        String(contract.sender_id || "").trim(),
        String(contract.receiver_id || "").trim(),
        String(contract.nda_hash || "").trim(),
      ].join("|");

      const contract_hash = crypto
        .createHash("sha256")
        .update(raw)
        .digest("hex");

      const vote_results = await pair_validate.get_vote(
        db,
        contract_hash,
        contract.id,
        "contract_official",
        "active",
        nodes,
        "new",
      );

      item_result.vote = vote_results;

      if (vote_results.RC !== 200 || !vote_results.RD?.quorum_pass) {
        item_result.status = "vote_failed";
        await contract.update({ onchain_status: "pending" });
        result_map.push(item_result);
        continue;
      }

      const payload = {
        timestamp: String(Date.now()),
        payload: {
          current_id: contract.id,
          type: "contract_official",
          hash: contract_hash,
          version: "1",
          Owner_id: `${contract.sender_id}|${contract.receiver_id}`,
          original_value: raw,
          detail: `Collaboration: ${contract.collaboration_type}`,
          status: "official",
        },
      };

      const commitResp = await pair_validate.pair_request(
        db,
        payload,
        nodes,
        "pair_other",
      );

      item_result.commit = commitResp;

      if (commitResp.RC === 200) {
        await contract.update({
          onchain_status: "on-chain",
          txt_hash: contract_hash,
        });
        item_result.status = "success";
        console.log(
          `[BLOCKCHAIN] Hợp đồng ${contract.id} đã On-chain thành công.`,
        );
      } else {
        await contract.update({ onchain_status: "pending" });
        item_result.status = "commit_failed";
      }

      result_map.push(item_result);
    }

    return {
      ok: true,
      msg: `Đã xử lý On-chain cho ${pendingContracts.length} hợp đồng.`,
      results: result_map,
    };
  } catch (error) {
    console.error("[auto_pair_contract ERROR]", error);
    return {
      ok: false,
      msg: "Lỗi hệ thống khi On-chain hợp đồng.",
      error: error.message,
    };
  }
};

const Auto_pair_batched = async (db, nodes) => {
  try {
    const settings = await db.System_Settings.findOne({
      where: { key: "ATOAPB" },
    });

    if (!settings || settings.enabled !== true) {
      return { ok: false, msg: "Tự động kích hoạt duyệt lô hàng đang bị tắt." };
    }

    const pendingBatches = await db.product_batch.findAll({
      where: {
        Chain_status: "pending",
      },
      limit: 15,
      order: [["updatedAt", "ASC"]],
    });

    if (pendingBatches.length === 0) {
      return { ok: true, msg: "Không có lô hàng nào đang chờ On-chain." };
    }

    const result_map = [];

    for (const batch of pendingBatches) {
      await batch.update({ Chain_status: "paring" });

      const item_result = {
        batch_id: batch.id,
        Chain_status: "paring",
        vote: null,
        commit: null,
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
      const vote_results = await pair_validate.get_vote(
        db,
        batch_hash,
        batch.id,
        "Batch_completed",
        "active",
        nodes,
        "new",
      );

      item_result.vote = vote_results;

      if (vote_results.RC !== 200 || !vote_results.RD?.quorum_pass) {
        item_result.status = "vote_failed";
        await batch.update({ Chain_status: "pending" });
        result_map.push(item_result);
        continue;
      }

      const payload = {
        timestamp: String(Date.now()),
        payload: {
          current_id: batch.id,
          type: "Batch_complate",
          hash: batch_hash,
          version: "1",
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
        "pair_other",
      );
      item_result.commit = commitResp;

      if (commitResp.RC === 200) {
        await batch.update({ Chain_status: "active", txt_hash: batch_hash });
        item_result.Chain_status = "active";
      } else {
        await batch.update({ Chain_status: "pending" });
        item_result.Chain_status = "pending";
      }

      result_map.push(item_result);
    }

    return {
      ok: true,
      msg: `Đã xử lý On-chain cho ${pendingBatches.length} lô hàng.`,
      results: result_map,
    };
  } catch (error) {
    console.error("[auto_pair_batch ERROR]", error);
    return {
      ok: false,
      msg: "Lỗi hệ thống khi On-chain lô hàng.",
      error: error.message,
    };
  }
};

const Auto_pair_shipingorder = async (db, nodes) => {
  const processingIds = [];

  try {
    const settings = await db.System_Settings.findOne({
      where: { key: "ATOASO" },
    });

    if (!settings || settings.enabled !== true) {
      return { ok: false, msg: "Tự động kích hoạt duyệt vận đơn đang bị tắt." };
    }

    const pendingOrders = await db.shipping_order.findAll({
      where: {
        [db.Sequelize.Op.or]: [
          {
            onchain_status: "agreement_pending",
            status: "proposed",
            sender_confirm: "confirmed",
            receiver_confirm: "accepted",
            transporter_confirm: "accepted",
          },
          {
            status: "shipping",
            onchain_status: "agreement_hashed",
            sender_confirm: "confirmed",
            receiver_confirm: "accepted",
            transporter_confirm: "accepted",
          },
          {
            status: "delivered",
            onchain_status: "pickup_verified",
            sender_confirm: "confirmed",
            receiver_confirm: "accepted",
            transporter_confirm: "accepted",
          },
          {
            onchain_status: "delivery_signed", 
            status: "completed",
            payment_status: "complated",
            shipping_payment_status: "complated",
            sender_confirm: "confirmed",
            receiver_confirm: "accepted",
            transporter_confirm: "accepted",
          },
        ],
      },
      include: [{ model: db.product_batch, as: "batches", attributes: ["id"] }],
      limit: 15,
      order: [["updatedAt", "ASC"]],
    });

    if (pendingOrders.length === 0) {
      return { ok: true, msg: "Không có gì để lên chain." };
    }

    const orderIdsToLock = pendingOrders.map((o) => o.id);
    await db.shipping_order.update(
      { onchain_status: "pairing" },
      { where: { id: { [db.Sequelize.Op.in]: orderIdsToLock } } },
    );
    pendingOrders.forEach((o) => processingIds.push(o.id));

    for (const order of pendingOrders) {
      const oldOnchainStatus = order.onchain_status;
      let type = "";
      let targetStatus = "";
      let detailMsg = "";

      switch (true) {
        case oldOnchainStatus === "agreement_pending":
          type = "Shipping_Agreement";
          targetStatus = "agreement_hashed";
          detailMsg = `Khởi tạo vận đơn: ${order.id}`;
          break;

        case order.status === "shipping":
          type = "Shipping_In_Transit";
          targetStatus = "pickup_verified";
          detailMsg = `Hàng xuất kho: ${order.id}`;
          break;

        case order.status === "delivered":
          type = "Shipping_Delivered";
          targetStatus = "delivery_signed";
          detailMsg = `Hàng đã giao: ${order.id}`;
          break;

        // 🚀 LỖI 1 ĐÃ SỬA: Thay "Shipping_Delivered" bằng "delivery_signed" cho đúng dữ liệu thô từ DB
        case order.status === "completed" &&
          order.payment_status === "complated" &&
          order.shipping_payment_status === "complated" &&
          oldOnchainStatus === "delivery_signed":
          type = "complete_shipping";
          targetStatus = "completed";
          detailMsg = `Vận đơn hoàn thành: ${order.id}`;
          break;

        default:
          console.log(
            `[TRACECHAIN] Bỏ qua ${order.id} - Không khớp case. Cập nhật hoàn trả trạng thái gốc.`,
          );
          // 🚀 LỖI 2 ĐÃ SỬA: Hoàn trả lại trạng thái cũ ngay lập tức nếu rơi vào default, không để bị kẹt chữ "pairing" vĩnh viễn
          await db.shipping_order.update(
            { onchain_status: oldOnchainStatus },
            { where: { id: order.id } },
          );
          continue;
      }

      const batchIds = order.batches?.map((b) => b.id).join(",") || "no_batch";
      const raw = [
        String(order.id || "").trim(),
        String(order.status || "").trim(),
        String(oldOnchainStatus || "").trim(),
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
      const order_hash = crypto.createHash("sha256").update(raw).digest("hex");

      try {
        const vote_results = await pair_validate.get_vote(
          db,
          order_hash,
          order.id,
          type,
          "active",
          nodes,
          "new",
        );

        const Owner_id = `${order?.sender_id}|${order?.customer_id}|${order?.shipping_partner}`;
        if (vote_results.RC === 200 && vote_results.RD?.quorum_pass) {
          const payload = {
            timestamp: String(Date.now()),
            payload: {
              current_id: order.id,
              type: type,
              hash: order_hash,
              Owner_id: Owner_id,
              detail: detailMsg,
              original_value: raw,
              status: "active",
              version: "1",
            },
          };

          const commitResp = await pair_validate.pair_request(
            db,
            payload,
            nodes,
            "pair_other",
          );
          if (commitResp.RC === 200) {
            const updateData = { onchain_status: targetStatus };
            if (type === "Shipping_Agreement")
              updateData.hash_agreement = order_hash;
            if (type === "Shipping_In_Transit")
              updateData.hash_transit = order_hash;
            if (type === "Shipping_Delivered")
              updateData.hash_delivered = order_hash;
            if (type === "complete_shipping")
              updateData.hash_completed = order_hash;
            await order.update(updateData);
            console.log(`[TRACECHAIN] ${order.id} - ON-CHAIN SUCCESS.`);
          } else {
            await order.update({ onchain_status: oldOnchainStatus });
          }
        } else {
          await order.update({ onchain_status: oldOnchainStatus });
        }
      } catch (innerError) {
        console.error(
          `[TRACECHAIN] Lỗi xử lý đơn ${order.id}:`,
          innerError.message,
        );
        await order.update({ onchain_status: oldOnchainStatus });
      }
    }

    return { ok: true, msg: "Tiến trình hoàn tất." };
  } catch (error) {
    console.error("[Auto_pair_shipingorder CRITICAL ERROR]", error);

    if (processingIds.length > 0) {
      console.log(
        `>>> [RESCUE] Đang giải cứu ${processingIds.length} đơn hàng bị kẹt...`,
      );
      try {
        await db.shipping_order.update(
          { onchain_status: "agreement_pending" },
          {
            where: {
              id: processingIds,
              onchain_status: "pairing",
              status: "proposed",
            },
          },
        );
        await db.shipping_order.update(
          { onchain_status: "agreement_hashed" },
          {
            where: {
              id: processingIds,
              onchain_status: "pairing",
              status: "shipping",
            },
          },
        );
        await db.shipping_order.update(
          { onchain_status: "pickup_verified" },
          {
            where: {
              id: processingIds,
              onchain_status: "pairing",
              status: "delivered",
            },
          },
        );
        // 🚀 LỖI 3 ĐÃ SỬA: Thêm lệnh giải cứu cho đơn hàng completed nếu hệ thống bị crash đột ngột
        await db.shipping_order.update(
          { onchain_status: "delivery_signed" },
          {
            where: {
              id: processingIds,
              onchain_status: "pairing",
              status: "completed",
            },
          },
        );
      } catch (rescueErr) {
        console.error(
          ">>> [FATAL] Cứu hộ thất bại nặng nề:",
          rescueErr.message,
        );
      }
    }

    return {
      ok: false,
      msg: "Lỗi hệ thống nghiêm trọng, đã thực hiện cứu hộ đơn hàng.",
      error: error.message,
    };
  }
};

const Auto_pair_payment = async (db, nodes) => {
  try {
    const settings = await db.System_Settings.findOne({
      where: { key: "ATOAPS" },
    });

    if (!settings || settings.enabled !== true) {
      return { ok: false, msg: "Tự động kích hoạt duyệt payment đang bị tắt." };
    }

    const pendingPayments = await db.payment_sessions.findAll({
      where: {
        chain_status: "pending",
        status: "paid",
      },
      limit: 15,
      order: [["updatedAt", "ASC"]],
    });

    if (pendingPayments.length === 0) {
      return { ok: true, msg: "Không có giao dịch nào đủ điều kiện On-chain." };
    }

    const result_map = [];

    for (const payment of pendingPayments) {
      await payment.update({ chain_status: "paring" });

      const item_result = {
        payment_id: payment.id,
        chain_status: "paring",
        vote: null,
        commit: null,
      };

      const rawData = [
        String(payment.id || "").trim(),
        String(payment.payment_code || "").trim(),
        String(payment.payer_id || "").trim(),
        String(payment.receiver_id || "").trim(),
        String(payment.amount_actual ?? "0").trim(),
        String(payment.sepay_transaction_id || "").trim(),
        payment.updatedAt ? String(new Date(payment.updatedAt).getTime()) : "0",
      ].join("|");

      const payment_hash = crypto
        .createHash("sha256")
        .update(rawData)
        .digest("hex");

      const vote_results = await pair_validate.get_vote(
        db,
        payment_hash,
        payment.id,
        "Payment_verification",
        "active",
        nodes,
        "new",
      );

      item_result.vote = vote_results;

      if (vote_results.RC !== 200 || !vote_results.RD?.quorum_pass) {
        item_result.status = "vote_failed";
        await payment.update({ chain_status: "pending" });
        result_map.push(item_result);
        continue;
      }

      const payload = {
        timestamp: Date.now(),
        payload: {
          current_id: payment.id,
          type: "Payment_onchain",
          hash: payment_hash,
          version: "1",
          original_value: rawData,
          Owner_id: payment.payer_id,
          detail: `{
            payment_code: ${payment.payment_code},
            amount: ${payment.amount_actual},
            payer: ${payment.payer_id},
            receiver: ${payment.receiver_id},
            sepay_id: ${payment.sepay_transaction_id},
            order_id: ${payment.order_id},
            ship_id: ${payment.ship_id},
          }`,
          status: "active",
        },
      };

      const commitResp = await pair_validate.pair_request(
        db,
        payload,
        nodes,
        "pair_other",
      );

      item_result.commit = commitResp;

      if (commitResp.RC === 200) {
        await payment.update({
          chain_status: "active",
          txt_hash: payment_hash,
        });
        item_result.status = "success";
      } else {
        await payment.update({ chain_status: "pending" });
        item_result.status = "commit_failed";
      }

      result_map.push(item_result);
    }

    return {
      ok: true,
      msg: `Đã xử lý On-chain cho ${pendingPayments.length} giao dịch thanh toán.`,
      results: result_map,
    };
  } catch (error) {
    console.error("[Auto_pair_payment ERROR]", error);
    return {
      ok: false,
      msg: "Lỗi hệ thống khi On-chain payment.",
      error: error.message,
    };
  }
};

export default {
  waitVoteRound,
  Auto_pair_payment,
  Auto_pair_shipingorder,
  Auto_pair_batched,
  auto_pair_contract,
  auto_pair_product,
  Drop_block,
  getNodeBaseInfomation,
  auto_pair_company,
  signature_rawdata,
  get_global_node,
  getBlockFormHeight,
  auto_pair_user,
  requestNodeStatus,
  auto_repair_chain,
  broadcastToFE,
  MaintenanceNode,
};
