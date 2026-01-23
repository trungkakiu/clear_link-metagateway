import nodeConfig from "../configs/meta_database.json" with { type: "json" };
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { fileURLToPath } from "url";
import { pendingRequests } from "../../meta_server.js";
import { Op } from "sequelize";
import { voteRounds } from "../core/metadata_core/meta_ws_controller.js";
import Helper__funtion from "../utils/Helper__funtion.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRIVATE_KEY = fs.readFileSync(
  path.resolve(__dirname, "../utils/node_private.pem"),
  "utf8",
);

const PUBLIC_KEY = fs.readFileSync(
  path.resolve(__dirname, "../utils/node_public.pem"),
  "utf8",
);

function verifyVote(publicKey, payload, signature) {
  try {
    if (!publicKey || !payload || !signature) return false;

    const normalizedKey = publicKey.replace(/\\n/g, "\n").trim();

    const verify = crypto.createVerify("RSA-SHA256");
    verify.update(payload, "utf8");
    verify.end();

    return verify.verify(
      {
        key: normalizedKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(signature, "base64"),
    );
  } catch (err) {
    console.error("[Verify ERROR]", err);
    return false;
  }
}

const process_user_block = (db, nodes) => async (user_id) => {
  const TRACE = `[PROCESS_USER_BLOCK][${user_id}]`;
  try {
    const user = await db.Actor_model.findOne({
      where: {
        id: user_id,
        status: "pending",
      },
    });

    const version = await db.System_Settings.findOne({
      where: { key: "APPVS" },
    });

    if (user.status !== "pending") {
      console.warn(`${TRACE} SKIP: user already processed`);
      return { ok: false, msg: "User already processed" };
    }

    if (!user) {
      console.warn(`${TRACE} ABORT: invalid or non-pending user`);
      return {
        ok: false,
        msg: "User không hợp lệ hoặc không ở trạng thái pending.",
      };
    }

    const raw = `${user.id}|${user.email}|${user.public_key}|${user.role}`;
    const user_hash = crypto.createHash("sha256").update(raw).digest("hex");

    const payload = {
      timestamp: Date.now(),
      user: {
        id: user.id,
        hash: user_hash,
        version: version.description || "1.0.0",
        type: "create_user",
      },
    };

    const node_map = await db.peer_map.findAll({
      where: { status: "active", health: "ok" },
    });

    const quorum = Math.ceil((2 * node_map.length) / 3);

    const vote_results = await get_vote(
      db,
      raw,
      user.id,
      "user_create",
      "active",
      nodes,
      "new",
    );

    console.log(`${TRACE} VOTE RESULT:`, {
      RC: vote_results?.RC,
      quorum_pass: vote_results?.RD?.quorum_pass,
      admin: vote_results?.RD?.admin,
      client: vote_results?.RD?.client,
      total: vote_results?.RD?.total,
    });

    if (vote_results.RC !== 200) {
      console.warn(`${TRACE} ABORT: vote RPC failed`);
      return {
        ok: false,
        msg: "Lỗi khi gửi vote đến các node.",
        vote: vote_results,
      };
    }

    if (vote_results.RD.vote_true < quorum) {
      console.warn(`${TRACE} ABORT: vote quorum not reached`);
      return {
        ok: false,
        msg: "Không đủ số phiếu đồng thuận.",
        vote: vote_results,
      };
    }

    const commitResp = await pair_request(db, payload, nodes, "pair_user");

    if (commitResp.RC !== 200 || commitResp.RD.complate < quorum) {
      return {
        ok: false,
        msg: "Không đủ số node commit block.",
        vote: vote_results,
        commit: commitResp,
      };
    }

    console.log(`${TRACE} SUCCESS`);

    return {
      ok: true,
      msg: "User đã được xác thực và block đã được commit.",
      vote: vote_results,
      commit: commitResp,
    };
  } catch (error) {
    console.error(`${TRACE} FATAL ERROR`, error);
    return {
      ok: false,
      msg: "Server nội bộ lỗi.",
      error: error.message,
    };
  }
};

const get_vote = async (
  db,
  client_hash,
  current_id,
  type,
  status,
  nodes,
  command_type,
) => {
  try {
    let vote_admin_true = 0;
    let vote_admin_false = 0;
    let vote_client_true = 0;
    let vote_client_false = 0;

    let admin_online = 0;
    let client_online = 0;

    const vote_map = {};

    const signer = crypto.createSign("SHA256");
    signer.update(client_hash);
    signer.end();
    const Signature = signer.sign(PRIVATE_KEY, "base64");

    const voteRoundId = crypto.randomUUID();
    const onlineEntries = [];
    for (const [nodeId, ws] of nodes) {
      if (ws && ws.readyState === ws.OPEN) {
        onlineEntries.push([nodeId, ws]);
      }
    }

    const expectedVotes = onlineEntries.length;

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
        expectedVotes,
        resolve,
        timeoutId,
        shouldFinalize: function () {
          return this.votes.size === this.expectedVotes;
        },
      });
    });

    for (const [nodeId, ws] of onlineEntries) {
      const nodeData = await db.peer_map.findByPk(nodeId);
      if (!nodeData) continue;

      if (nodeData.node_type === "admin") admin_online++;
      else client_online++;

      ws.send(
        JSON.stringify({
          type: "command",
          command: "get_vote",
          requestId: uuidv4(),
          voteRoundId,
          payload: {
            client_hash,
            Signature,
            Public_key: PUBLIC_KEY,
            current_id,
            type,
            command_type,
            status,
          },
          serverTime: Date.now(),
        }),
      );
    }

    const result = await waitVoteRound;

    for (const vote of result.votes) {
      const nodeData = await db.peer_map.findByPk(vote.nodeId);
      if (!nodeData) continue;

      const isValid = verifyVote(
        nodeData.public_key,
        vote.payload,
        vote.signature,
      );

      if (!isValid) {
        if (nodeData.node_type === "admin") vote_admin_false++;
        else vote_client_false++;

        vote_map[vote.nodeId] = {
          status: false,
          node_type: nodeData.node_type,
        };
        continue;
      }

      if (nodeData.node_type === "admin") vote_admin_true++;
      else vote_client_true++;

      vote_map[vote.nodeId] = { status: true, node_type: nodeData.node_type };
    }

    const total_online = admin_online + client_online;

    const admin_pass = vote_admin_true >= Math.ceil((admin_online * 5) / 6);

    const client_block =
      client_online > 0 &&
      vote_client_true + vote_client_false > 0 &&
      vote_client_false > vote_client_true;

    const quorum_pass = admin_pass && !client_block;

    console.log("[VOTE ROUND]", {
      voteRoundId,
      expectedVotes,
      receivedVotes: result.votes.length,
      timeout: result.timeout,
      admin_online,
      client_online,
    });

    console.log("[VOTE QUORUM CHECK]", {
      admin_pass,
      client_block,
      admin: { true: vote_admin_true, false: vote_admin_false },
      client: { true: vote_client_true, false: vote_client_false },
    });

    return {
      RM: quorum_pass ? "Vote PASSED" : "Vote REJECTED",
      RC: quorum_pass ? 200 : 403,
      RD: {
        quorum_pass,
        admin: {
          online: admin_online,
          true: vote_admin_true,
          false: vote_admin_false,
        },
        client: {
          online: client_online,
          true: vote_client_true,
          false: vote_client_false,
        },
        total: {
          online: total_online,
          total: nodes.size,
          ratio: nodes.size > 0 ? total_online / nodes.size : 0,
        },
        vote_map,
      },
    };
  } catch (error) {
    console.error("[get_vote ERROR]", error);
    return { RM: "Internal server error", RC: 500, RD: error.message };
  }
};

const pair_request = async (db, payload, nodes, type) => {
  try {
    const peer_map_list = {};
    let complate = 0;
    let failed = 0;

    const admin_block = {};
    let winner = null;

    const totalAdmin = await db.peer_map.findAll({
      where: { node_type: "admin", health: "ok" },
    });
    const quorum = Math.floor(totalAdmin.length / 2) + 1;
    const tasks = [];

    for (const [nodeId, ws] of nodes) {
      const task = (async () => {
        const nodeData = await db.peer_map.findByPk(nodeId);
        if (!nodeData) {
          peer_map_list[nodeId] = false;
          return;
        }

        if (nodeData.health != "ok") {
          peer_map_list[nodeId] = false;
          return;
        }

        const requestId = uuidv4();
        const waitResponse = Helper__funtion.waitRpc(
          pendingRequests,
          requestId,
          3000,
        );

        ws.send(
          JSON.stringify({
            type: "command",
            command: type,
            requestId,
            payload,
            serverTime: Date.now(),
          }),
        );

        const result = await waitResponse;
        if (result.timeout) {
          peer_map_list[nodeId] = false;
          failed++;
          return;
        }

        if (result.block.ok) {
          peer_map_list[nodeId] = true;
          complate++;
        } else {
          peer_map_list[nodeId] = false;
          failed++;
          console.log(nodeId, "failed");
        }
        if (result.block.type === "admin") {
          admin_block[nodeId] = result.block;
        }
      })();

      tasks.push(task);
    }

    await Promise.allSettled(tasks);
    const adminResults = Object.values(admin_block).filter(
      (r) => r && r.block_hash && r.height && r.previous,
    );

    if (adminResults.length === 0) {
      return {
        RM: "No admin consensus result",
        RC: 409,
        RD: { failed, complate },
      };
    }

    const consensusMap = {};

    for (const r of adminResults) {
      if (!consensusMap[r.block_hash]) {
        consensusMap[r.block_hash] = {
          count: 0,
          height: r.height,
          previous: r.previous,
          validators: [],
        };
      }

      consensusMap[r.block_hash].count++;
      consensusMap[r.block_hash].validators.push(r.validator);
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
        RM: "Consensus not reached (quorum failed)",
        RC: 409,
        RD: { failed, complate },
      };
    }

    console.log("[PAIR][META] updating global_node with:", {
      height: winner.height,
      hash: winner.block_hash,
      validators: winner.validators,
    });

    await db.Global_Node.update(
      {
        global_height: winner.height,
        canonical_block_hash: winner.block_hash,
        previous_block_hash: winner.previous,
        last_commit_node: winner.validators.join(","),
        last_block_time: new Date(),
        updated_from: "push",
        network_status: "healthy",
      },
      { where: { id: 1 } },
    );

    return {
      RM: "pair item complete!",
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
    console.error("[pair_request ERROR]", error);
    return {
      RM: "Internal server error",
      RC: 500,
      RD: error.message,
    };
  }
};

function canonicalStringify(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

const get_drop_vote = async (db, nodes, drop_list) => {
  const TAG = "[DROP_VOTE]";
  const voteRoundId = crypto.randomUUID();

  console.log(TAG, "START", {
    voteRoundId,
    dropCount: drop_list.length,
  });

  try {
    const productVoteMap = {};
    for (const p of drop_list) {
      productVoteMap[p.id] = {
        admin_true: 0,
        admin_false: 0,
        client_true: 0,
        client_false: 0,
        voters: {},
      };
    }

    console.log(TAG, "INIT productVoteMap", Object.keys(productVoteMap));

    let admin_online = 0;
    let client_online = 0;

    const onlineEntries = [];
    for (const [nodeId, ws] of nodes) {
      if (ws && ws.readyState === ws.OPEN) {
        onlineEntries.push([nodeId, ws]);
      }
    }

    console.log(TAG, "ONLINE NODES", {
      online: onlineEntries.length,
      total: nodes.size,
    });

    const expectedVotes = onlineEntries.length;
    if (expectedVotes === 0) {
      console.warn(TAG, "NO ONLINE NODES → ABORT");
      return {
        RC: 503,
        RM: "No online nodes to vote",
        RD: null,
      };
    }

    const waitVoteRound = new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        const round = voteRounds.get(voteRoundId);
        if (!round) return;

        console.warn(TAG, "VOTE ROUND TIMEOUT", {
          voteRoundId,
          receivedVotes: round.votes.size,
          expectedVotes: round.expectedVotes,
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

    for (const [nodeId, ws] of onlineEntries) {
      const nodeData = await db.peer_map.findByPk(nodeId);
      if (!nodeData) {
        console.warn(TAG, "NODE DATA NOT FOUND", nodeId);
        continue;
      }

      if (nodeData.node_type === "admin") admin_online++;
      else client_online++;

      console.log(TAG, "SEND VOTE REQUEST", {
        voteRoundId,
        nodeId,
        node_type: nodeData.node_type,
      });

      ws.send(
        JSON.stringify({
          type: "command",
          command: "drop_precheck_vote",
          requestId: uuidv4(),
          voteRoundId,
          payload: {
            products: drop_list.map((p) => ({
              product_id: p.id,
            })),
          },
          serverTime: Date.now(),
        }),
      );
    }

    console.log(TAG, "VOTE REQUEST SENT", {
      admin_online,
      client_online,
      expectedVotes,
    });

    // ============================
    // 5. WAIT FOR VOTES
    // ============================
    const result = await waitVoteRound;
    console.log("result: ", JSON.stringify(result, null, 2));

    console.log(TAG, "VOTE ROUND FINISHED", {
      voteRoundId,
      timeout: result.timeout,
      receivedVotes: result.votes.length,
    });

    // ============================
    // 6. PROCESS VOTES
    // ============================
    for (const vote of result.votes) {
      console.log(TAG, "PROCESS VOTE", {
        voteRoundId,
        fromNode: vote.nodeId,
      });

      const nodeData = await db.peer_map.findByPk(vote.nodeId);
      if (!nodeData) {
        console.warn(TAG, "VOTE NODE NOT FOUND", vote.nodeId);
        continue;
      }

      const signBody = {
        type: "drop_precheck_vote_ack",
        voteRoundId: vote.voteRoundId,
        nodeId: vote.nodeId,
        votePayload: vote.votePayload,
      };

      const raw = canonicalStringify(signBody);

      const verifier = crypto.createVerify("RSA-SHA256");
      verifier.update(raw);
      verifier.end();

      const isValid = verifier.verify(
        nodeData.public_key,
        vote.signature,
        "base64",
      );

      if (!isValid) {
        console.warn(TAG, "INVALID SIGNATURE", {
          voteRoundId,
          nodeId: vote.nodeId,
        });
        continue;
      }

      for (const v of vote.payload.votes) {
        const { product_id, approve } = v;
        const record = productVoteMap[product_id];

        if (!record) {
          console.warn(TAG, "UNKNOWN PRODUCT IN VOTE", product_id);
          continue;
        }

        record.voters[vote.nodeId] = approve;

        if (nodeData.node_type === "admin") {
          approve ? record.admin_true++ : record.admin_false++;
        } else {
          approve ? record.client_true++ : record.client_false++;
        }

        console.log(TAG, "VOTE COUNTED", {
          voteRoundId,
          nodeId: vote.nodeId,
          product_id,
          approve,
          node_type: nodeData.node_type,
        });
      }
    }

    // ============================
    // 7. QUORUM PER PRODUCT
    // ============================
    const product_results = {};

    for (const [productId, v] of Object.entries(productVoteMap)) {
      const admin_pass =
        admin_online > 0 && v.admin_true >= Math.ceil((admin_online * 5) / 6);

      const client_block = client_online > 0 && v.client_false > v.client_true;

      const quorum_pass = admin_pass && !client_block;

      product_results[productId] = {
        approve: quorum_pass,
        admin: {
          true: v.admin_true,
          false: v.admin_false,
          online: admin_online,
        },
        client: {
          true: v.client_true,
          false: v.client_false,
          online: client_online,
        },
        voters: v.voters,
      };

      console.log(TAG, "QUORUM RESULT", {
        voteRoundId,
        productId,
        quorum_pass,
        admin_true: v.admin_true,
        admin_false: v.admin_false,
        client_true: v.client_true,
        client_false: v.client_false,
      });
    }

    // ============================
    // 8. FINAL LOG
    // ============================
    console.log(TAG, "END", {
      voteRoundId,
      admin_online,
      client_online,
      total_online: admin_online + client_online,
    });

    return {
      RC: 200,
      RM: "Drop vote finished",
      RD: {
        voteRoundId,
        products: JSON.stringify(product_results),
        summary: {
          admin_online,
          client_online,
          total_online: admin_online + client_online,
          timeout: result.timeout,
        },
      },
    };
  } catch (error) {
    console.error(TAG, "FATAL ERROR", {
      voteRoundId,
      error,
    });

    return {
      RC: 500,
      RM: "Internal server error",
      RD: error.message,
    };
  }
};

export default {
  get_vote,
  get_drop_vote,
  pair_request,
  process_user_block,
};
