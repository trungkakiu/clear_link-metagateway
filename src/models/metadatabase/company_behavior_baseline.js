export default (sequelize, DataTypes) => {
  const company_behavior_baseline = sequelize.define(
    "company_behavior_baseline",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },

      // ===== CONTEXT =====
      company_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      actor_role: {
        type: DataTypes.ENUM(
          "manufacturer",
          "distributor",
          "admin",
          "retailer",
          "transporter",
          "user",
        ),
        allowNull: false,
      },

      // ===== TIME BEHAVIOR =====
      avg_time_since_last_action: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      std_time_since_last_action: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      // ===== DÂN CHƠI HỆ CHI TIẾT =====
      hourly_activity_map: {
        type: DataTypes.JSON, // Lưu tỉ lệ hoạt động theo khung giờ (0-23)
        allowNull: true,
      },

      action_distribution: {
        type: DataTypes.JSON, // Lưu tỉ lệ các loại action: { "BC_PUSH": 0.8, "CRUD_UPDATE": 0.2 }
        allowNull: true,
      },

      trusted_ips: {
        type: DataTypes.JSON, // Danh sách các IP hay dùng nhất
        allowNull: true,
      },

      risk_threshold_override: {
        type: DataTypes.FLOAT, // Ngưỡng riêng cho từng Role (Admin thì gắt hơn User)
        defaultValue: 0.5,
      },
      // ===== DATA CHANGE BEHAVIOR =====
      avg_payload_diff_score: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      std_payload_diff_score: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      // ===== SYSTEM PERFORMANCE =====
      avg_response_time: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      std_response_time: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      // ===== SESSION =====
      avg_session_duration: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      avg_session_action_count: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      // ===== GEO =====
      avg_latitude: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      avg_longitude: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      geo_radius: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      // ===== DEVICE / NETWORK =====
      unique_device_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      unique_ip_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      // ===== BLOCKCHAIN =====
      bc_pending_ratio: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      bc_failed_ratio: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      // ===== META =====
      sample_size: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      last_updated: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "company_behavior_baseline",
      timestamps: true,
      underscored: true,

      indexes: [
        {
          unique: true,
          fields: ["company_id", "actor_role"],
        },
      ],
    },
  );

  company_behavior_baseline.associate = (models) => {};

  return company_behavior_baseline;
};
