import express from "express";
import JwtVetify from "../utils/JwtVetify.js";
import meta_core_controller from "../core/metadata_core/meta_core_controller.js";
import pair_validate from "../core_API/pair_validate.js";
import db from "../models/metadatabase/index.js";

const router = express.Router();

const WsGateWay = (app, nodes, pendingRequests) => {
  router.post("/admin/test", meta_core_controller.repair_block(db, nodes));
  app.use("/api/ws", router);
};

export default WsGateWay;
