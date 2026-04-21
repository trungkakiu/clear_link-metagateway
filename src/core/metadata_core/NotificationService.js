import admin from "firebase-admin";
import { broadcastNotification } from "../../../client_socket_server.js";
import serviceAccount from "../../auth/testggfb-bde24-firebase-adminsdk-fbsvc-e4767d08cd.json" assert { type: "json" };
import db from "../../models/metadatabase/index.js";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const NotificationService = {
  async sendSmartNotification(
    noti_id = "123",
    target_company_id,
    role,
    message,
    target_id,
    target_type = "SYSTEM_NOTI",
    level = "level_1",
    linkToAction = "/",
    admin_target = true,
  ) {
    broadcastNotification(
      noti_id,
      target_company_id,
      message,
      linkToAction,
      target_type,
      "unread",
      level,
      target_id,
      admin_target,
    );

    this.sendFirebasePush(target_company_id, role, message).catch((err) => {
      console.error("[FCM] Lỗi bắn Push ngầm:", err);
    });
  },

  async sendFirebasePush(
    target_company_id,
    role,
    message,
    target_actor_ids = [],
  ) {
    try {
      const whereCondition = {
        Company_id: target_company_id,
        status: "active",
      };

      if (target_actor_ids.length > 0) {
        whereCondition.Actor_id = target_actor_ids;
      }

      const accountLevels = await db.Company_account_level.findAll({
        where: whereCondition,
        include: [
          {
            model: db.Actor_model,
            as: "owner_id",
            attributes: ["fcm_token", "name", "id"],
            where: {
              fcm_token: { [db.Sequelize.Op.ne]: null },
            },
          },
        ],
      });

      if (!accountLevels || accountLevels.length === 0) {
        console.log(
          `[FCM] Skip: Không tìm thấy Actor nào có Token thuộc Company ${target_company_id}`,
        );
        return;
      }

      await Promise.all(
        accountLevels.map(async (acc) => {
          const user = acc.owner_id;
          const payload = {
            notification: {
              title: "ClearLink Notification",
              body: message || "Bạn có thông báo mới",
            },
            data: {
              link: "https://app.clearlink.io.vn/",
              type: "SYSTEM_NOTI",
            },
            token: user.fcm_token,
          };

          try {
            await admin.messaging().send(payload);
          } catch (error) {
            console.error(`[FCM] x Lỗi gửi cho ${user.name}:`, error.message);
          }
        }),
      );
    } catch (dbError) {
      console.error(`[FCM][DB-ERROR]:`, dbError);
    }
  },
};

export default NotificationService;
