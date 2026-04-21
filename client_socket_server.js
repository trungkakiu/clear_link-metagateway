import { WebSocketServer } from "ws";
import http from "http";
import db from "./src/models/metadatabase/index.js";
import { create } from "domain";

const clientServer = http.createServer();
const wssClient = new WebSocketServer({ server: clientServer });

export let companyClients = new Map();

wssClient.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;
  ws._state = "UNAUTHENTICATED";
  const roleMapping = {
    manufacturer: "Manufacturer",
    distributor: "Distributor",
    retailer: "Retailer",
    transporter: "Transporter",
  };

  ws.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw);
      if (data.type === "AUTH_CLIENT") {
        const mappedTable = roleMapping[data.role];

        if (!mappedTable) {
          console.error(`[6099][AUTH-FAILED] Role không hợp lệ: ${data.role}`);
          return ws.close(4000, "Invalid Role");
        }

        const userExist = await db[mappedTable].findByPk(data.company_id);

        if (!userExist || userExist.id !== data.company_id) {
          return ws.close(4003, "Unauthorized");
        }

        ws._state = "AUTHENTICATED";
        ws._company_id = data.company_id;
        ws._role = data.role;
        ws._user_id = data.user_id;
        ws._level = data.level || "level_1";

        if (!companyClients.has(ws._company_id)) {
          companyClients.set(ws._company_id, new Set());
        }
        companyClients.get(ws._company_id).add(ws);

        ws.send(
          JSON.stringify({
            type: "AUTH_SUCCESS",
            message: "Connected to 6099",
          }),
        );
      }
    } catch (err) {
      console.error("[6099][MESSAGE-ERROR]:", err);
    }
  });

  ws.on("close", () => {
    if (ws._company_id && companyClients.has(ws._company_id)) {
      companyClients.get(ws._company_id).delete(ws);

      if (companyClients.get(ws._company_id).size === 0) {
        console.log(
          `[6099][STATS] Company [${ws._company_id}] hiện tại không còn ai online.`,
        );
      }
    } else {
      console.log(`[6099][CLOSE] Một kết nối chưa xác thực đã đóng.`);
    }
  });
});

export const broadcastNotification = (
  noti_id,
  target_company_id,
  message,
  linkToAction = "",
  type,
  status = "unread",
  level,
  target_actor_ids = [],
  is_admintarget = false,
) => {
  const clients = companyClients.get(target_company_id);
  console.log(target_actor_ids, is_admintarget);
  if (!clients || clients.size === 0) {
    console.log(
      `[6099][SKIP] Không có ai online tại Company: ${target_company_id}`,
    );
    return;
  }

  const targetSet = new Set(target_actor_ids?.map((id) => id.toString()));
  const isGlobal = target_actor_ids.length === 0;
  const notiLevel = parseInt(level?.toString().replace("level_", "") || 1);

  clients.forEach((ws) => {
    if (ws.readyState === 1) {
      const wsUserId = ws._user_id?.toString();
      const userLevel = parseInt(
        (ws._level || "level_1").toString().replace("level_", ""),
      );

      const isInTargetList = isGlobal || targetSet.has(wsUserId);

      const isPrivilegedAdmin = is_admintarget && userLevel >= 4;

      if (isInTargetList || isPrivilegedAdmin) {
        if (userLevel >= notiLevel) {
          ws.send(
            JSON.stringify({
              id: Date.now(),
              type: "NOTI",
              data: {
                id: noti_id,
                message: message,
                linkToAction: linkToAction,
                status: status,
                noitfi_level: level,
                noti_type: type,
                createdAt: new Date(),
              },
            }),
          );
        }
      }
    }
  });
};

export default clientServer;
