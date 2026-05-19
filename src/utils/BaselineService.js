import db from "../models/metadatabase/index.js";
import { QueryTypes } from "sequelize";

class BaselineService {
  async refreshBaseline(companyId, actorRole) {
    const oldBaseline = await db.company_behavior_baseline.findOne({
      where: {
        company_id: companyId,
        actor_role: actorRole,
      },
    });

    const lastUpdated = oldBaseline?.last_updated || new Date(0);

    const stats = await db.sequelize.query(
      `
      SELECT 
        COUNT(*) as sample_size,
        AVG(time_since_last_action) as avg_time,  
        STDDEV(time_since_last_action) as std_time,
        AVG(payload_diff_score) as avg_payload,
        STDDEV(payload_diff_score) as std_payload,
        AVG(response_time_ms) as avg_resp,
        STDDEV(response_time_ms) as std_resp,
        AVG(latitude) as avg_lat,
        AVG(longitude) as avg_lon,
        COUNT(DISTINCT device_fingerprint) as unique_devices,
        COUNT(DISTINCT ip_address) as unique_ips,
        SUM(CASE WHEN blockchain_status = 'pending' THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as pending_ratio,
        SUM(CASE WHEN blockchain_status = 'failed' THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as failed_ratio
      FROM Activity_Log_TraceChain
      WHERE company_id = :companyId 
        AND actor_role = :actorRole
        AND created_at > :lastUpdated
      `,
      {
        replacements: { companyId, actorRole, lastUpdated },
        type: QueryTypes.SELECT,
      },
    );

    const basicData = stats[0];

    if (!basicData || basicData.sample_size === 0) {
      console.log(" No new data → skip baseline update");
      return;
    }

    const alpha = 0.2;

    const ema = (oldVal, newVal) => {
      if (oldVal === null || oldVal === undefined) return newVal;
      return alpha * newVal + (1 - alpha) * oldVal;
    };

    const mergeDistribution = (oldMap = {}, newMap = {}) => {
      const result = {};
      const keys = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);

      keys.forEach((k) => {
        const oldVal = oldMap[k] || 0;
        const newVal = newMap[k] || 0;
        result[k] = alpha * newVal + (1 - alpha) * oldVal;
      });

      return result;
    };

    const hourlyData = await db.sequelize.query(
      `
      SELECT 
        EXTRACT(HOUR FROM created_at) as hr,
        COUNT(*) * 1.0 / :total as ratio
      FROM activity_logs
      WHERE company_id = :companyId 
        AND actor_role = :actorRole
        AND created_at > :lastUpdated
      GROUP BY hr
      `,
      {
        replacements: {
          companyId,
          actorRole,
          lastUpdated,
          total: basicData.sample_size,
        },
        type: QueryTypes.SELECT,
      },
    );

    const newHourlyMap = {};
    hourlyData.forEach((row) => {
      newHourlyMap[parseInt(row.hr)] = row.ratio;
    });

    const actionData = await db.sequelize.query(
      `
      SELECT 
        action_type,
        COUNT(*) * 1.0 / :total as ratio
      FROM activity_logs
      WHERE company_id = :companyId 
        AND actor_role = :actorRole
        AND created_at > :lastUpdated
      GROUP BY action_type
      `,
      {
        replacements: {
          companyId,
          actorRole,
          lastUpdated,
          total: basicData.sample_size,
        },
        type: QueryTypes.SELECT,
      },
    );

    const newActionMap = {};
    actionData.forEach((row) => {
      newActionMap[row.action_type] = row.ratio;
    });

    const topIPs = await db.sequelize.query(
      `
      SELECT ip_address 
      FROM activity_logs
      WHERE company_id = :companyId 
        AND actor_role = :actorRole
        AND created_at > :lastUpdated
      GROUP BY ip_address 
      ORDER BY COUNT(*) DESC 
      LIMIT 5
      `,
      {
        replacements: { companyId, actorRole, lastUpdated },
        type: QueryTypes.SELECT,
      },
    );

    const mergedIPs = new Set([
      ...(oldBaseline?.trusted_ips || []),
      ...topIPs.map((t) => t.ip_address),
    ]);

    const trusted_ips = Array.from(mergedIPs).slice(0, 10);

    const updatedBaseline = {
      company_id: companyId,
      actor_role: actorRole,

      avg_time_since_last_action: ema(
        oldBaseline?.avg_time_since_last_action,
        basicData.avg_time,
      ),

      std_time_since_last_action: ema(
        oldBaseline?.std_time_since_last_action,
        basicData.std_time,
      ),

      avg_payload_diff_score: ema(
        oldBaseline?.avg_payload_diff_score,
        basicData.avg_payload,
      ),

      std_payload_diff_score: ema(
        oldBaseline?.std_payload_diff_score,
        basicData.std_payload,
      ),

      avg_response_time: ema(
        oldBaseline?.avg_response_time,
        basicData.avg_resp,
      ),

      std_response_time: ema(
        oldBaseline?.std_response_time,
        basicData.std_resp,
      ),

      avg_latitude: ema(oldBaseline?.avg_latitude, basicData.avg_lat),
      avg_longitude: ema(oldBaseline?.avg_longitude, basicData.avg_lon),

      geo_radius: 0.05,

      unique_device_count: Math.max(
        oldBaseline?.unique_device_count || 0,
        basicData.unique_devices,
      ),

      unique_ip_count: Math.max(
        oldBaseline?.unique_ip_count || 0,
        basicData.unique_ips,
      ),

      bc_pending_ratio: ema(
        oldBaseline?.bc_pending_ratio,
        basicData.pending_ratio,
      ),

      bc_failed_ratio: ema(
        oldBaseline?.bc_failed_ratio,
        basicData.failed_ratio,
      ),

      sample_size: Math.min(
        (oldBaseline?.sample_size || 0) + basicData.sample_size,
        50000,
      ),

      hourly_activity_map: mergeDistribution(
        oldBaseline?.hourly_activity_map,
        newHourlyMap,
      ),

      action_distribution: mergeDistribution(
        oldBaseline?.action_distribution,
        newActionMap,
      ),

      trusted_ips,

      last_updated: new Date(),
    };

    await db.company_behavior_baseline.upsert(updatedBaseline);

    console.log("Baseline updated (EMA + delta mode)");
  }
}

export default new BaselineService();
