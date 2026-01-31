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
      return {
        ok: false,
        msg: "Auto approve product is disabled.",
      };
    }

    const product_list = await db.Product.findAll({
      where: { chain_status: "pending" },
      limit: 5,
    });

    if (!product_list || product_list.length === 0) {
      return {
        ok: false,
        msg: "Không có sản phẩm pending.",
      };
    }

    const result_map = [];

    for (const product of product_list) {
      await product.update({
        chain_status: "pairing",
      });
      const item_result = {
        product_id: product.id,
        vote: null,
        commit: null,
        status: "pairing",
      };

      const raw = `${product.id}|${product.author}|${product.responsible_person}|${product.price}`;

      const product_hash = crypto
        .createHash("sha256")
        .update(raw)
        .digest("hex");

      const vote_results = await pair_validate.get_vote(
        db,
        product_hash,
        product.id,
        "product_create",
        "active",
        nodes,
        "new",
      );

      item_result.vote = vote_results;

      if (
        vote_results.RC !== 200 ||
        !vote_results.RD ||
        vote_results.RD.quorum_pass !== true
      ) {
        item_result.status = "vote_failed";
        await product.update({
          chain_status: "pending",
        });
        result_map.push(item_result);
        continue;
      }

      const payload = {
        timestamp: Date.now(),
        payload: {
          current_id: product.id,
          type: "product_create",
          hash: product_hash,
          version: "1.0.1",
          Owner_id: product.author,
          status: "active",
          detail: "none",
        },
      };

      const commitResp = await pair_validate.pair_request(
        db,
        payload,
        nodes,
        "pair_product",
      );

      item_result.commit = commitResp;

      if (
        commitResp.RC === 200 &&
        commitResp.RD &&
        commitResp.RD.complate >=
          Math.ceil((vote_results.RD.admin.online * 5) / 6)
      ) {
        await product.update({ chain_status: "active" });
        console.log("vote_success: ", JSON.stringify(item_result, null, 2));
        item_result.status = "success";
      } else {
        await product.update({ chain_status: "pending" });
        console.log("vote_failed: ", JSON.stringify(item_result, null, 2));
        item_result.status = " ";
      }
      result_map.push(item_result);
    }
    return {
      ok: true,
      msg: "Đã xử lý danh sách sản phẩm.",
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
    console.log("requestNodeStatus for NodeID:", NodeID);
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
        RM: "No admin node online",
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
      return {
        ok: false,
        msg: "Auto approve user is disabled.",
      };
    }
    console.log("PAIR USER");
    const user_list = await db.Actor_model.findAll({
      where: {
        role_active: "active",
        status: "pending",
        public_key: {
          [Op.ne]: "null",
        },
      },
      limit: 5,
    });

    if (!user_list || user_list.length === 0) {
      return {
        ok: false,
        msg: "Không có người dùng pending.",
      };
    }
    console.log("USER LIST LENGTH: ", user_list.length);
    const result_map = {};

    for (const user of user_list) {
      await user.update({ status: "pairing" });

      const result = await pair_validate.process_user_block(
        db,
        nodes,
        pendingRequests,
      )(user);

      if (result.ok) {
        await user.update({ status: "active" });
      } else {
        await user.update({ status: "pending" });
      }
    }
    return console.log("[USER PAIR]: ", result_map);
  } catch (error) {
    console.error("[auto_pair_product ERROR]", error);
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
      return { RM: "No admin node online", RC: 409, RD: [] };
    }

    const quorum = Math.floor(adminNodes.length / 2) + 1;

    const tasks = [];
    const adminResponses = [];

    for (const { nodeId, ws } of adminNodes) {
      const task = (async () => {
        peer_map_list[nodeId] = false;

        const requestId = uuidv4();

        console.log("Helper__funtion.waitRpc =", Helper__funtion.waitRpc);
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
        console.log(`[${syncId}] RESPONSE from ${nodeId}:`, result);

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

      console.log(
        `[${syncId}] SELECT height=${height} hash=${winner.block.Hash} votes=${winner.count}`,
      );

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
    const drop_list = await db.Product.findAll({
      where: {
        chain_status: "wait-droped",
      },
      limit: 5,
      attributes: ["id"],
    });

    if (drop_list.length < 1) {
      console.log("NO PRODUCT TO DROP → EXIT");
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
    const waitVoteRound = new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
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
          console.warn(TAG, "NODE DATA NOT FOUND", nodeId);
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
              approvedIds,
            },
            serverTime: Date.now(),
          }),
        );
      }
      await db.Product.update(
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

export default {
  waitVoteRound,
  auto_pair_product,
  Drop_block,
  getNodeBaseInfomation,
  signature_rawdata,
  get_global_node,
  getBlockFormHeight,
  auto_pair_user,
  requestNodeStatus,
  auto_repair_chain,
  broadcastToFE,
  MaintenanceNode,
};
