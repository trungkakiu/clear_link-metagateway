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
import compression from "compression";
import DefaultGateway from "./src/routes/DefaultGateway.js";
import meta_controller from "./src/core/metadata_core/meta_controller.js";
import Server_setting_loop from "./Server_setting_loop.js";
import http from "http";
import { WebSocketServer } from "ws";
import meta_core_controller from "./src/core/metadata_core/meta_core_controller.js";
import db from "./src/models/metadatabase/index.js";
import WsGateWay from "./src/routes/WsGateWay.js";
import { handleWsMessage } from "./handleWsMessage.js";
import { fileURLToPath } from "url";
import meta_ws_controller from "./src/core/metadata_core/meta_ws_controller.js";
import { where } from "sequelize";
import "./src/auth/google.strategy.js";
import passport from "passport";
import clientServer, { broadcastNotification } from "./client_socket_server.js";

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
app.set("trust proxy", true);

app.use(compression());

const STATIC_CACHE_CONFIG = {
  maxAge: "7d",
  immutable: true,
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.removeHeader("Pragma");
  },
};

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

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      "https://app.clearlink.io.vn",
      "https://api.clearlink.io.vn",
      "https://admin.clearlink.io.vn",
      "https://user.clearlink.io.vn",
      "http://localhost:3012",
      "http://localhost:3010",
      "http://127.0.0.1:3012",
      "http://127.0.0.1:3010",
    ];
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("CORS policy: Origin không được phép."));
    }
  },
  methods: "GET,POST,PUT,DELETE,OPTIONS",
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "x-device-id",
    "x-session-id",
    "x-challenge-code",
    "ngrok-skip-browser-warning",
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
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
      express.static(
        path.join(__dirname, "src", "Access", "Main_avatar"),
        STATIC_CACHE_CONFIG,
      ),
    );

    app.use(
      "/box-card",
      express.static(
        path.join(__dirname, "src", "Access", "box"),
        STATIC_CACHE_CONFIG,
      ),
    );

    app.use(
      "/Sector-logo",
      express.static(
        path.join(__dirname, "src", "Access", "Sector_logo"),
        STATIC_CACHE_CONFIG,
      ),
    );

    app.use(
      "/Sector-banner",
      express.static(
        path.join(__dirname, "src", "Access", "Sector_banner"),
        STATIC_CACHE_CONFIG,
      ),
    );

    app.use(
      "/Company-logo",
      express.static(
        path.join(__dirname, "src", "Access", "Company_logo"),
        STATIC_CACHE_CONFIG,
      ),
    );

    app.use(
      "/Sub-image",
      express.static(
        path.join(__dirname, "src", "Access", "Sub_productimage"),
        STATIC_CACHE_CONFIG,
      ),
    );

    app.use(
      "/User-avatar",
      express.static(
        path.join(__dirname, "src", "Access", "User_avatar"),
        STATIC_CACHE_CONFIG,
      ),
    );

    app.use(
      "/OEM-file",
      express.static(
        path.join(__dirname, "src", "Access", "OEM_toturial"),
        STATIC_CACHE_CONFIG,
      ),
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
    Server_setting_loop.loop_ATOASO(db, nodes);
    Server_setting_loop.loop_ATORMP(db, nodes);
    Server_setting_loop.loop_ATOAPC(db, nodes);
    Server_setting_loop.loop_ATOACT(db, nodes);
    Server_setting_loop.loop_ATOAPB(db, nodes);
    Server_setting_loop.initCronJobs(db);
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Meta Server chạy tại: http://0.0.0.0:${PORT}`);
      console.log(`WebSocket chạy tại: ws://0.0.0.0:${PORT}`);
    });

    clientServer.listen(6099, "0.0.0.0", () => {
      console.log("Client Socket Server running on port 6099");
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
