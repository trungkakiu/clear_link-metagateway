// meta_server.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import meta_db from "./src/models/metadatabase/index.js";
import cors_setting from "./src/utils/cors_setting.js";
import minimist from "minimist";
import fs from "fs";
import path from "path";
import DefaultGateway from "./src/routes/DefaultGateway.js";
import meta_controller from "./src/core/metadata_core/meta_controller.js";
import Server_setting_loop from "./Server_setting_loop.js";
import http from "http"; // << thêm
import { WebSocketServer } from "ws"; // << thêm
import meta_core_controller from "./src/core/metadata_core/meta_core_controller.js";
import db from "./src/models/metadatabase/index.js";
import WsGateWay from "./src/routes/WsGateWay.js";
import { handleWsMessage } from "./handleWsMessage.js";
import { fileURLToPath } from "url";
import meta_ws_controller from "./src/core/metadata_core/meta_ws_controller.js";
import { where } from "sequelize";
import "./src/auth/google.strategy.js";
import passport from "passport";

dotenv.config();

const args = minimist(process.argv.slice(2));
const configPath =
  args.config || path.resolve("src/configs/meta_database.json");

if (!fs.existsSync(configPath)) {
  console.error(`Không tìm thấy file cấu hình: ${configPath}`);
  process.exit(1);
}
const nodeConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const app = express();
const server = http.createServer(app);
const wssNode = new WebSocketServer({ server });

let nodes = new Map();
let wsBySessionId = new Map();
export let pendingRequests = new Map();
export let syncingNodes = new Map();

wssNode.on("connection", (ws, req) => {
  try {
    ws._state = "UNAUTHENTICATED";
    ws._session = null;

    const handshakeTimeout = setTimeout(() => {
      console.log("Handshake timeout check");
      if (ws._state !== "AUTHENTICATED") {
        ws.close(4000, "Handshake timeout");
      }
    }, 5000);

    ws.on("message", (raw) => {
      handleWsMessage(nodes, pendingRequests, wsBySessionId)(
        ws,
        raw,
        handshakeTimeout,
      );
    });

    ws.on("close", () => {
      const session = ws._session;
      if (!session) return;

      const { nodeId, sessionId } = session;

      ws._state = "DISCONNECTED";
      ws._session = null;

      nodes.delete(nodeId);
      wsBySessionId.delete(sessionId);

      for (const [rid, pending] of pendingRequests.entries()) {
        if (pending.sessionId === sessionId) {
          pending.resolve({ ok: false, reason: "ws_disconnected" });
          pendingRequests.delete(rid);
        }
      }
      clearTimeout(handshakeTimeout);
      console.warn("[WS][DISCONNECT]", { nodeId, sessionId });
    });
  } catch (err) {
    console.error("Lỗi kết nối WebSocket:", err);
    ws.close(1011, "Internal server error");

    return;
  }
});

app.use(passport.initialize());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) res.header("Access-Control-Allow-Origin", origin);

  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const PORT = nodeConfig.port || process.env.PORT || 5099;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  try {
    await meta_db.sequelize.authenticate();
    console.log(`Kết nối MetaDatabase [${nodeConfig.db.name}] thành công.`);
    await meta_db.sequelize.sync();

    app.use(
      "/main-card",
      express.static(path.join(__dirname, "src", "Access", "Main_avatar")),
    );

    await meta_db.Global_Node.findOrCreate({
      where: { id: 1 },
      defaults: {
        global_height: 0,
        canonical_block_hash: "GENESIS",
        updated_from: "pull",
        network_status: "healthy",
      },
    });

    DefaultGateway(app, nodes, pendingRequests);
    WsGateWay(app, nodes, pendingRequests);
    Server_setting_loop.loop_ATOAPP(db, nodes);
    Server_setting_loop.loop_ATOAPU(db, nodes);
    Server_setting_loop.loop_ATOGGN(db, nodes);
    Server_setting_loop.loop_ATORMP(db, nodes);
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Meta Server chạy tại: http://0.0.0.0:${PORT}`);
      console.log(`WebSocket chạy tại: ws://0.0.0.0:${PORT}`);
    });

    process.on("SIGINT", () => {
      console.log("Đang dừng Meta Node...");
      process.exit(0);
    });
  } catch (err) {
    console.error("Lỗi khởi động Meta Node:", err.message);
    process.exit(1);
  }
})();
