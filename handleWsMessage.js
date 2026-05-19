import { json } from "sequelize";
import meta_ws_controller, {
  voteRounds,
} from "./src/core/metadata_core/meta_ws_controller.js";
import db from "./src/models/metadatabase/index.js";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { pendingRequests } from "./meta_server.js";
import { syncingNodes } from "./meta_server.js";

function normalizePemKey(key) {
  return key.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
}

function verifySignature({ nodeId, timestamp, signature }, publicKey) {
  const payload = `${nodeId}|${timestamp}`;
  const syncingNodes = new Set();
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(payload);
  verifier.end();
  publicKey = normalizePemKey(publicKey);
  return verifier.verify(publicKey, Buffer.from(signature, "base64"));
}

async function verifyNodeHello(msg) {
  // console.log("[verifyNodeHello] input:", {
  //   nodeId: msg?.nodeId,
  //   timestamp: msg?.timestamp,
  //   hasSignature: !!msg?.signature,
  // });

  const { nodeId, timestamp, signature } = msg;

  if (!nodeId || !timestamp || !signature) {
    console.warn("[verifyNodeHello] missing required fields", {
      nodeId,
      timestamp,
      hasSignature: !!signature,
    });
    return null;
  }

  const now = Date.now();
  const diff = Math.abs(now - timestamp);

  if (diff > 20_000) {
    console.warn("[verifyNodeHello] timestamp expired", {
      now,
      timestamp,
      diffMs: diff,
    });
    return null;
  }

  const node = await db.peer_map.findOne({
    where: {
      id: nodeId,
      status: "active",
    },
  });

  if (!node) {
    console.warn("[verifyNodeHello] node not found in peer_map", {
      nodeId,
    });
    return null;
  }

  if (!node.public_key) {
    console.warn("[verifyNodeHello] node has no public_key", {
      nodeId,
    });
    return null;
  }

  let ok = false;
  try {
    ok = verifySignature({ nodeId, timestamp, signature }, node.public_key);
  } catch (err) {
    console.error("[verifyNodeHello] verifySignature threw error", err);
    return null;
  }

  if (!ok) {
    console.warn("[verifyNodeHello] signature verification FAILED", {
      nodeId,
      publicKeyPreview: node.public_key?.slice(0, 40),
      signaturePreview: signature?.slice(0, 40),
    });
    return null;
  }

  return {
    id: node.id,
    role: node.role,
    publicKey: node.public_key,
  };
}

async function handleNodeConnected(ws, globalState) {
  try {
    if (!ws || !ws._session) {
      console.warn("[handleNodeConnected] session missing, abort");
      return;
    }
    const nodeId = ws._session.nodeId;
    const { height, hash, status } = ws._session.clientMeta;
    if (!ws._session.sessionId) {
      console.warn("[handleNodeConnected] sessionId missing, abort");
      return;
    }
    const { sessionId } = ws._session;

    const canonicate_node = globalState;

    const current_node = await db.peer_map.findByPk(nodeId);
    if (!current_node) {
      ws.close(4006, "Node not registered");
      return;
    }

    let nextStatus = "active";
    let code = 200;
    let message = "node connected";

    if (status === "fork") {
      await current_node.update({ health: "fork" });
      nextStatus = "fork";
      code = 409;
      message = "node connected, fork detected";
    } else {
      if (height < canonicate_node.global_height) {
        nextStatus = "syncing";
        code = 201;
        message = "node connected, need sync";
        await current_node.update({ health: "syncing" });
      } else if (
        height > canonicate_node.global_height ||
        hash !== canonicate_node.canonical_block_hash
      ) {
        nextStatus = "fork";
        code = 409;
        message = "node connected, fork detected";
        await current_node.update({ health: "fork" });
      } else {
        await current_node.update({ health: "ok" });
      }
    }

    await ws.send(
      JSON.stringify({
        type: "connected",
        status: nextStatus,
        sessionId: sessionId,
        code,
        message,
      }),
    );

    return console.log(
      `[WS - CONNECTED] - [${nodeId}]: ${JSON.stringify(ws._session, null, 2)}`,
    );
  } catch (error) {
    console.error("handleNodeConnected error:", error);
    return;
  }
}

export const handleWsMessage =
  (nodes, wsBySessionId) => async (ws, raw, handshakeTimeout) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "client_log") {
        if (msg.sessionId !== ws._session.sessionId) {
          console.log(
            `[CLIENT - LOG] [AUTHENTICATED]: ${JSON.stringify(msg, null, 2)}`,
          );

          return;
        }
      }

      const canonicate_node = await db.Global_Node.findByPk(1);
      if (ws._state === "AUTHENTICATED" && !ws._session) {
        console.error("[WS] AUTHENTICATED but session missing");
        ws.close(1011, "Invalid server state");
        clearTimeout(handshakeTimeout);
        return;
      }

      if (msg.type === "init" && ws._state === "AUTHENTICATED") {
        ws.send(
          JSON.stringify({
            type: "error",
            code: 409,
            message: "INIT_ALREADY_DONE",
          }),
        );
        clearTimeout(handshakeTimeout);
        return;
      }

      if (ws._state === "UNAUTHENTICATED") {
        if (msg.type !== "init") {
          console.log("Handshake required:", msg);
          ws.close(4002, "Handshake required");
          return;
        }

        const node = await verifyNodeHello(msg);
        if (!node) {
          console.log("Invalid node hello:", msg);
          ws.close(4003, "Invalid signature");
          return;
        }

        ws._session = {
          sessionId: uuidv4(),
          nodeId: node.id,
          role: node.role,
          connectedAt: Date.now(),
          clientMeta: {
            height: msg.height,
            hash: msg.hash,
            status: msg.status,
          },
        };

        ws._state = "AUTHENTICATED";

        if (nodes.has(node.id)) {
          console.log("DUPLICATE_NODE");
          nodes.get(node.id).close(4009, "DUPLICATE_NODE");
        }
        await nodes.set(node.id, ws);

        await handleNodeConnected(ws, canonicate_node);
        clearTimeout(handshakeTimeout);
        return;
      }

      if (!ws._session || !ws._session.sessionId) {
        console.log("Session expired");
        ws.close(4001, "Session expired");
        clearTimeout(handshakeTimeout);
        return;
      }

      const sessionId = ws._session.sessionId;
      if (msg.sessionId !== sessionId) {
        console.log("Invalid sessionId in message:", msg);
        ws.close(4004, "Invalid session");
        clearTimeout(handshakeTimeout);
        return;
      }
      const nodeId = ws._session.nodeId;
      ws._session.lastSeen = Date.now();

      switch (msg.type) {
        case "client_log": {
          // console.log("Client_log: ", msg);
          return;
        }

        case "client_debug": {
          // console.log("client_debug: ", msg);
          return;
        }

        case "drop_precheck_vote_ack": {
          console.log(
            `[WS - VOTE - DROP - RES] - [${msg.nodeId}]: ${JSON.stringify(msg, null, 2)}`,
          );

          const round = voteRounds.get(msg.voteRoundId);

          if (!round || round.status !== "OPEN") return;

          if (round.votes.has(msg.nodeId)) return;

          round.votes.set(msg.nodeId, msg);

          const finalizeResult = round.shouldFinalize
            ? round.shouldFinalize(round.votes)
            : "NO_FUNC";

          if (finalizeResult === true) {
            clearTimeout(round.timeoutId);
            round.status = "FINALIZED";
            voteRounds.delete(msg.voteRoundId);

            round.resolve({
              timeout: false,
              votes: Array.from(round.votes.values()),
            });
          }

          break;
        }

        case "heartbeat":
          const client_status = msg.status;
          if (client_status === "fork") {
            await ws.send(
              JSON.stringify({
                type: "connected",
                sessionId: sessionId,
                status: "fork",
                code: 409,
                message: "fork process",
              }),
            );
            return;
          }

          const current_node = await db.peer_map.findByPk(msg.nodeId);
          if (!current_node) {
            await ws.send(
              JSON.stringify({
                type: "error",
                code: 401,
                message: "Node not registered in peer_map",
              }),
            );
            return;
          }

          let status = "active";
          let code = 200;
          let message = "node connected";

          if (msg.height < canonicate_node.global_height) {
            status = "syncing";
            code = 201;
            message = "node connected, need sync";
            await current_node.update({ health: "syncing" });
          } else if (
            msg.height > canonicate_node.global_height ||
            msg.hash != canonicate_node.canonical_block_hash
          ) {
            status = "fork";
            code = 409;
            message = "node connected, fork detected";
            await current_node.update({ health: "fork" });
          } else {
            await current_node.update({ health: "ok" });
          }

          nodes.set(msg.nodeId, ws);

          await ws.send(
            JSON.stringify({
              type: "connected",
              status,
              sessionId: sessionId,
              code,
              message,
            }),
          );

          break;

        case "drop_response": {
          console.log(
            `[WS - DROP - RES] - [${msg.nodeId}]: ${JSON.stringify(msg, null, 2)}`,
          );

          const round = voteRounds.get(msg.voteRoundId);

          if (!round || round.status !== "OPEN") return;

          if (round.votes.has(msg.nodeId)) return;

          round.votes.set(msg.nodeId, msg);

          const finalizeResult = round.shouldFinalize
            ? round.shouldFinalize(round.votes)
            : "NO_FUNC";

          if (finalizeResult === true) {
            clearTimeout(round.timeoutId);
            round.status = "FINALIZED";
            voteRounds.delete(msg.voteRoundId);

            round.resolve({
              timeout: false,
              votes: Array.from(round.votes.values()),
            });
          }

          break;
        }
        case "command_response": {
          // console.log(
          //   `[WS - CMD - RESPONSE] - [${msg.nodeId}]: ${JSON.stringify(msg, null, 2)}`,
          // );
          const entry = pendingRequests.get(msg.requestId);
          if (entry) {
            clearTimeout(entry.timer);
            pendingRequests.delete(msg.requestId);
            entry(msg);
          } else {
            console.warn("WS: No resolver found for requestId:", msg.requestId);
          }
          break;
        }
        case "vote_response": {
          console.log(
            `[WS - VOTE - RESPONSE] - [${msg.nodeId}]: ${JSON.stringify(msg, null, 2)}`,
          );

          const round = voteRounds.get(msg.voteRoundId);

          if (!round || round.status !== "OPEN") return;

          if (round.votes.has(msg.nodeId)) return;

          round.votes.set(msg.nodeId, msg);

          const finalizeResult = round.shouldFinalize
            ? round.shouldFinalize(round.votes)
            : "NO_FUNC";

          if (finalizeResult === true) {
            clearTimeout(round.timeoutId);
            round.status = "FINALIZED";
            voteRounds.delete(msg.voteRoundId);

            round.resolve({
              timeout: false,
              votes: Array.from(round.votes.values()),
            });
          }

          break;
        }
        case "pair_user_response": {
          console.log(
            `[WS - USERPAIR - RESPONSE] - [${msg.nodeId || "UNKNOWN"}]:`,
            JSON.stringify(msg, null, 2),
          );
          const entry = pendingRequests.get(msg.requestId);

          if (!entry) {
            console.warn("WS: No resolver found for requestId:", msg.requestId);
            break;
          }

          if (entry.timer) clearTimeout(entry.timer);
          pendingRequests.delete(msg.requestId);

          if (typeof entry.resolve === "function") {
            entry.resolve(msg);
          } else {
            console.error(
              "WS: pendingRequests entry has no resolve()",
              msg.requestId,
              entry,
            );
          }

          break;
        }
        case "server_global_node": {
          const entry = pendingRequests.get(msg.requestId);

          if (!entry) {
            console.warn("WS: No resolver found for requestId:", msg.requestId);
            break;
          }

          if (entry.timer) clearTimeout(entry.timer);
          pendingRequests.delete(msg.requestId);

          if (typeof entry.resolve === "function") {
            entry.resolve(msg);
          } else {
            console.error(
              "WS: pendingRequests entry has no resolve()",
              msg.requestId,
              entry,
            );
          }

          break;
        }
        case "pair_product_response": {
          const entry = await pendingRequests.get(msg.requestId);

          if (!entry) {
            console.warn("WS: No resolver found for requestId:", msg.requestId);
            break;
          }

          if (entry.timer) clearTimeout(entry.timer);
          pendingRequests.delete(msg.requestId);

          if (typeof entry.resolve === "function") {
            entry.resolve(msg);
          } else {
            console.error(
              "WS: pendingRequests entry has no resolve()",
              msg.requestId,
              entry,
            );
          }
          break;
        }
        case "pair_other_response": {
          const entry = await pendingRequests.get(msg.requestId);

          if (!entry) {
            console.warn("WS: No resolver found for requestId:", msg.requestId);
            break;
          }

          if (entry.timer) clearTimeout(entry.timer);
          pendingRequests.delete(msg.requestId);

          if (typeof entry.resolve === "function") {
            entry.resolve(msg);
          } else {
            console.error(
              "WS: pendingRequests entry has no resolve()",
              msg.requestId,
              entry,
            );
          }
          break;
        }

        case "Batch_trace_respone":
        case "Product_trace_respone":
        case "Company_trace_respone":
        case "Ship_trace_respone": {
          console.log(`\n[WS DEBUG] Recivier ${msg.type}`);
          console.log(
            `[WS DEBUG RAW] Payload nhận được:`,
            JSON.stringify(msg, null, 2),
          ); // IN RA ĐỂ XEM CẤU TRÚC THẬT

          const entry = await pendingRequests.get(msg.requestId);

          if (!entry) {
            console.warn("WS: No resolver found for requestId:", msg.requestId);
            break;
          }

          if (entry.timer) clearTimeout(entry.timer);
          pendingRequests.delete(msg.requestId);

          if (typeof entry.resolve === "function") {
            // FIX: Tìm đúng cái ruột chứa "ok: true" và "block"
            // Nó có thể nằm ở msg.payload, msg.data, msg.result hoặc nằm luôn ở msg
            const actualData = msg.payload || msg.data || msg.result || msg;

            // Đảm bảo Nhạc trưởng nhận được đúng format
            entry.resolve(actualData);
          } else {
            console.error(
              "WS: pendingRequests entry has no resolve()",
              msg.requestId,
            );
          }
          break;
        }
        case "override_block_respone": {
          console.log(
            `[WS - REPAIRBLOCk - RESPONSE] - [${msg.nodeId}]: ${msg}`,
          );
          const resolver = pendingRequests.get(msg.requestId);

          if (resolver) {
            pendingRequests.delete(msg.requestId);
            resolver(msg);
          } else {
            console.warn("WS: No resolver found for requestId:", msg.requestId);
          }
          break;
        }
        case "get_block_response": {
          const entry = pendingRequests.get(msg.requestId);

          if (!entry) {
            console.warn("WS: No resolver found for requestId:", msg.requestId);
            break;
          }

          if (entry.timer) clearTimeout(entry.timer);
          pendingRequests.delete(msg.requestId);

          if (typeof entry.resolve === "function") {
            entry.resolve(msg);
          } else {
            console.error(
              "WS: pendingRequests entry has no resolve()",
              msg.requestId,
              entry,
            );
          }

          break;
        }

        case "archor_block_fork": {
          console.log(`[WS - ARCHORBLOCK] - [${msg.nodeId}]: ${msg}`);
          const current_peer = await db.peer_map.findByPk(msg.nodeId);
          const archor_block = msg.archor_block;
          if (archor_block) {
            const res = await meta_ws_controller.auto_repair_chain(
              db,
              nodes,
              archor_block,
            );

            if (res) {
              if (res.RC == 200) {
                if (res.RD.status === "truth") {
                  await current_peer.update({ health: "syncing" });
                }
                await ws.send(
                  JSON.stringify({
                    type: "fork_response",
                    truth_point: res.RD.status === "truth" ? true : false,
                    ok: true,
                    active: res.RD.active,
                    message: res.RM,
                    fork_point: res.RD.forkPoint,
                  }),
                );
              }
            } else {
              await ws.send(
                JSON.stringify({
                  type: "fork_response",
                  truth_point: false,
                  ok: false,
                  active: false,
                  message: "server error!",
                  fork_point: -1,
                }),
              );
            }
          }
          break;
        }

        case "sync_request": {
          const nodeId = msg.nodeId;
          if (!nodeId) return;
          const startedAt = Date.now();
          console.log("responese");
          const current = syncingNodes.get(nodeId);
          if (current) {
            if (current.sessionId === msg.sessionId) {
              await ws.send(
                JSON.stringify({
                  type: "sync_response",
                  ok: false,
                  status: "syncing",
                  sessionId: msg.sessionId,
                  code: 429,
                  sync_status: "busy",
                  blocks: [],
                }),
              );
              return;
            } else {
              syncingNodes.delete(nodeId);
            }
          }

          syncingNodes.set(nodeId, {
            sessionId: msg.sessionId,
            startedAt: Date.now(),
          });

          try {
            console.log(
              `[WS - SYNC - REQUEST] - [${nodeId}]: ${JSON.stringify(
                msg,
                null,
                2,
              )}`,
            );

            const node_allow = await db.peer_map.findByPk(nodeId);
            const limit = msg.limit ?? 20;

            if (msg.from_height > canonicate_node.global_height) {
              await ws.send(
                JSON.stringify({
                  type: "sync_response",
                  status: "fork",
                  sync_status: "node_fork",
                  blocks: [],
                  code: 409,
                  ok: false,
                  message: "node connected, fork detected",
                }),
              );
              return;
            }

            if (!node_allow) {
              await ws.send(
                JSON.stringify({
                  type: "sync_response",
                  status: "fork",
                  sync_status: "node_outlaw",
                  blocks: [],
                  ok: false,
                  code: 403,
                  message: "your node are outlaw",
                }),
              );
              return;
            }

            if (
              node_allow.health !== "syncing" &&
              node_allow.health !== "maintenance"
            ) {
              await ws.send(
                JSON.stringify({
                  type: "sync_response",
                  status: node_allow.health,
                  code: 409,
                  sync_status: "invalid_status",
                  ok: false,
                  message: "node connected, detected invalid status",
                }),
              );
              return;
            }

            const block = await meta_ws_controller.getBlockFormHeight(
              db,
              nodes,
              msg.from_height,
              limit,
            );

            if (!block) {
              await ws.send(
                JSON.stringify({
                  type: "sync_response",
                  status: node_allow.health,
                  blocks: [],
                  sync_status: "out_block",
                  code: 404,
                  ok: false,
                  message: "block not found",
                }),
              );
              return;
            }

            if (block.RC != 200) {
              await ws.send(
                JSON.stringify({
                  type: "sync_response",
                  status: node_allow.health,
                  blocks: [],
                  code: 500,
                  sync_status: "server_error",
                  ok: false,
                  message: block.RM,
                }),
              );
              return;
            }

            await ws.send(
              JSON.stringify({
                type: "sync_response",
                status: node_allow.health,
                blocks: block.RD.blocks ?? [],
                code: 200,
                sync_status: block.RD.sync_status,
                ok: true,
                message: "block response",
              }),
            );
            console.log("ĐÃ TRẢ DỮ LIỆU CHO NODE C#");
            syncingNodes.delete(nodeId);
          } finally {
            if (Date.now() - startedAt > 30000) {
              syncingNodes.delete(nodeId);
            }
          }

          break;
        }

        case "Maintenance_responese": {
          console.log(
            `[WS - MAINTENANCE - RES] - [${nodeId}]: ${JSON.stringify(
              msg,
              null,
              2,
            )}`,
          );
          const entry = pendingRequests.get(msg.requestId);

          if (!entry) {
            console.warn("WS: No resolver found for requestId:", msg.requestId);
            break;
          }

          if (entry.timer) clearTimeout(entry.timer);
          pendingRequests.delete(msg.requestId);

          if (typeof entry.resolve === "function") {
            entry.resolve(msg);
          } else {
            console.error(
              "WS: pendingRequests entry has no resolve()",
              msg.requestId,
              entry,
            );
          }
          break;
        }

        case "fork_maintenance_response": {
          console.warn(
            `[WS - FORKMAINTENANCE - RESPONSE] - [${msg.nodeId}]: ${JSON.stringify(
              msg,
              null,
              2,
            )}`,
          );
          const entry = pendingRequests.get(msg.requestId);
          break;
        }
        default:
          clearTimeout(handshakeTimeout);
          console.log("Unknown WS message type:", msg.type);
          break;
      }
    } catch (err) {
      console.error("WS message parse error:", err);
    }
  };
