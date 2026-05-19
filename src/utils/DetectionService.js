import db from "../models/metadatabase/index.js";
import axios from "axios";
import crypto from "crypto";

const stableHash = (str) => {
  if (!str) return 0;
  const md5Hex = crypto.createHash("md5").update(String(str)).digest("hex");
  const bigIntValue = BigInt("0x" + md5Hex);
  return Number(bigIntValue % 1000n);
};

class DetectionService {
  async predictAnomaly(rawLog, actor_id, session_id) {
    const [sessionLogs, actorLogs] = await Promise.all([
      db.Activity_Log_TraceChain.findAll({
        where: { session_id: session_id },
        attributes: [
          "action_type",
          "payload_diff_score",
          "time_since_last_action",
        ],
        raw: true,
      }),
      db.Activity_Log_TraceChain.findAll({
        where: { actor_id: actor_id },
        attributes: ["time_since_last_action"],
        order: [["created_at", "DESC"]],
        limit: 200,
        raw: true,
      }),
    ]);

    const session_action_count = sessionLogs.length + 1;
    const session_duration =
      sessionLogs.reduce(
        (sum, log) => sum + (log.time_since_last_action || 0),
        0,
      ) + rawLog.time_since_last_action;
    const uniqueActions = new Set(sessionLogs.map((log) => log.action_type));
    uniqueActions.add(rawLog.action_type);
    const session_unique_actions = uniqueActions.size;
    const totalDiff =
      sessionLogs.reduce((sum, log) => sum + (log.payload_diff_score || 0), 0) +
      rawLog.payload_diff_score;
    const session_avg_diff = totalDiff / session_action_count;

    const actor_total_actions = actorLogs.length + 1;
    const actorSumTime =
      actorLogs.reduce(
        (sum, log) => sum + (log.time_since_last_action || 0),
        0,
      ) + rawLog.time_since_last_action;
    const actor_avg_time = actorSumTime / actor_total_actions;

    let sumVariance = 0;
    actorLogs.forEach((log) => {
      sumVariance += Math.pow(
        (log.time_since_last_action || 0) - actor_avg_time,
        2,
      );
    });
    sumVariance += Math.pow(rawLog.time_since_last_action - actor_avg_time, 2);
    const actor_std_time =
      actor_total_actions > 1
        ? Math.sqrt(sumVariance / (actor_total_actions - 1))
        : 0.0;

    const payload = {
      company_id: rawLog.company_id,
      actor_role: rawLog.actor_role,
      action_type: rawLog.action_type,
      payload_diff_score: rawLog.payload_diff_score,
      latitude: rawLog.latitude || 0,
      longitude: rawLog.longitude || 0,
      is_within_geofence: rawLog.is_within_geofence ? 1 : 0,
      blockchain_status: rawLog.blockchain_status,
      response_time_ms: rawLog.response_time_ms || 0,
      time_since_last_action: rawLog.time_since_last_action || 0,
      process_step: rawLog.process_step || 1,
      hour_of_day: rawLog.hour_of_day,
      device_hash: stableHash(rawLog.device_fingerprint),
      ip_hash: stableHash(rawLog.ip_address),

      session_action_count: session_action_count,
      session_duration: session_duration,
      session_unique_actions: session_unique_actions,
      session_avg_diff: session_avg_diff,

      actor_avg_time: actor_avg_time,
      actor_std_time: actor_std_time,
      actor_total_actions: actor_total_actions,
    };

    try {
      const response = await axios.post(
        "http://localhost:8000/predict",
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            "X-AI-Secret-Key": "TRACECHAIN_SUPER_SECRET_KEY_2026",
          },
          timeout: 2000,
        },
      );
      return response.data;
    } catch (error) {
      console.error("Lỗi khi Ship data sang AI Server:", error.message);
      return { anomaly_score: 0, is_anomaly: false, error: true };
    }
  }
}

export default new DetectionService();
