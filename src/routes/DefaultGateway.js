import express from "express";
import meta_controller from "../core/metadata_core/meta_controller.js";
import JwtVetify from "../utils/JwtVetify.js";
import db from "../models/metadatabase/index.js";
import meta_core_controller from "../core/metadata_core/meta_core_controller.js";
import productUpload from "../core/meta_image_controller.js/productUpload.js";
import Helper__funtion from "../utils/Helper__funtion.js";
import passport from "passport";
import meta_ws_controller from "../core/metadata_core/meta_ws_controller.js";
import JwtAction from "../utils/JwtAction.js";

const router = express.Router();

const DefaultGateway = (app, nodes) => {
  try {
    Helper__funtion.RouteGroup(router, [], (r) => {
      r.get(
        "/auth/google",
        passport.authenticate("google", {
          scope: ["profile", "email"],
          session: false,
        }),
      );

      r.get(
        "/auth/google/callback",
        passport.authenticate("google", {
          session: false,
          failureRedirect: "/auth/google/fail",
        }),

        (req, res) => {
          const token = JwtAction.JwtSign({
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            role: req.user.role,
          });
          res.redirect(`${process.env.FRONTEND_URL}/oauth?token=${token}`);
        },
      );

      r.get("/auth/google/fail", (req, res) => {
        res.status(401).send("GOOGLE AUTH FAILED");
      });

      r.get("/status", (req, res) => {
        res.status(200).json({ message: "API is running" });
      });
      r.get(
        "/public/node-infomation/detail/:node_id",
        meta_core_controller.getNodeInfomation(nodes, db),
      );
      r.get(
        "/public/base-node-infomation/detail/:node_id",
        meta_ws_controller.getNodeBaseInfomation(nodes, db),
      );

      r.post("/user/authen/register", meta_controller.RegisterActive);

      r.post("/admin/authen/login", meta_controller.AdminLoginActive);

      r.post("/user_authen/authen/login", meta_controller.userLogin);

      r.post(
        "/user-authen/auth/node-setup-login",
        meta_controller.user_setup_login(db),
      );
    });

    Helper__funtion.RouteGroup(router, [JwtVetify.verifyToken(db)], (r) => {
      r.post("/user/authen/verify-user-otp", meta_controller.checkUserOTP());
      r.post(
        "/user/authen/drop-block/:type/:block_id",
        JwtVetify.RequireOTP(db),
        meta_controller.dropUserBlock(db),
      );
      r.post("/user/product/raw-data", meta_controller.createRawProduct(db));
      r.post("/authen/create-otp-admin", meta_controller.createAdminOTP);

      r.post("/user_authen/authen/logout", meta_controller.userLogout);

      r.post("/user/regis/role", meta_controller.create_pending_profile);

      r.post(
        "/user_requset/support/mail",
        meta_controller.mailResendPendingUser(db),
      );

      r.get("/user/me", meta_controller.getMe(db));

      r.post(
        "/user/authen/create-otp",
        meta_controller.genPublickey(db, nodes),
      );

      r.get(
        "/user/get-dashboard/:user_id",
        meta_core_controller.get_dashboard(db),
      );

      r.get(
        "/user/categories/get-categories",
        meta_controller.getCategories(db),
      );

      r.post(
        "/user/categories/create-categories",
        meta_controller.createCategories(db),
      );

      r.post(
        "/user/manufacturer-control/addnew/product",
        productUpload.fields([
          { name: "main_cardimage", maxCount: 1 },
          { name: "sub_images", maxCount: 20 },
        ]),
        meta_core_controller.product_upload(db),
      );

      r.get(
        "/user/manufacturer-control/product/list",
        meta_core_controller.getUserProductPending(db),
      );

      r.post(
        "/node/create-info/infomation",
        meta_core_controller.create_nodeinfo(db),
      );
    });

    Helper__funtion.RouteGroup(
      router,
      [JwtVetify.verifyToken(db), JwtVetify.isAdmin()],
      (r) => {
        r.post("/admin/authen/send-admin-otp", meta_controller.createAdminOTP);

        r.post(
          "/admin/authen/maintenance-node",
          meta_ws_controller.MaintenanceNode(db, nodes),
        );
        r.post(
          "/admin/node-control/create-admin-node",
          meta_core_controller.create_Admin_node(db),
        );

        r.post(
          "/admin/authen/verify-admin-otp",
          meta_controller.verifyAdminOTP,
        );

        r.get("/admin/user/get-all", meta_controller.get_user_actor(db));

        r.get(
          "/admin/node-infomation/list",
          meta_core_controller.getAllNodeInfo(nodes, db),
        );

        r.get(
          "/admin/data/get-pending-request",
          meta_core_controller.getPendingRequest(db),
        );

        r.post(
          "/admin/role/change-stage/:UserStage/:role/:RoleStage",
          meta_core_controller.changeStatus_user(db),
        );

        r.get("/admin/settings/get-all", meta_controller.getAllSettings);

        r.post("/admin/settings/update", meta_controller.updateSetting);

        r.post("/admin/settings/create", meta_controller.createSetting);
      },
    );

    return app.use("/api", router);
  } catch (error) {
    console.log("Default Gateway error: ", error);
  }
};

export default DefaultGateway;
