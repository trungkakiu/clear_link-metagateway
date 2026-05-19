export default (sequelize, DataTypes) => {
  const Activity_Log_TraceChain = sequelize.define(
    "Activity_Log_TraceChain",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        comment: "Mã định danh duy nhất cho mỗi bản ghi log",
      },
      // --- NHÓM ĐỊNH DANH (WHO) ---
      actor_id: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: "ID của người thực hiện hành động (Driver, Staff, Admin)",
      },
      session_id: {
        type: DataTypes.STRING,
        allowNull: true,
        comment:
          "ID phiên làm việc: Giúp AI nhóm các hành động rời rạc thành một chuỗi hành vi logic",
      },
      company_id: {
        type: DataTypes.STRING,
        allowNull: false,
        comment:
          "ID của công ty/tổ chức sở hữu actor: giúp AI phân nhóm hành vi theo đặc thù doanh nghiệp",
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
        comment:
          "Vai trò của actor tại thời điểm log: giúp AI học quyền hạn tương ứng",
      },

      action_type: {
        type: DataTypes.ENUM(
          "CRUD_CREATE",
          "CRUD_UPDATE",
          "CRUD_DELETE",
          "CRUD_GET",
          "SOCKET_EMIT",
          "BC_PUSH",
        ),
        allowNull: false,
        comment:
          "Loại tác động hệ thống: Giúp AI phân loại luồng dữ liệu tĩnh hay real-time",
      },
      resource_id: {
        type: DataTypes.STRING,
        allowNull: true,
        comment:
          "ID của đối tượng bị tác động (Ví dụ: Order_001, Milestone_XYZ)",
      },
      payload_diff_score: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
        comment:
          "Điểm số chênh lệch dữ liệu (đã qua tiền xử lý): dùng trực tiếp làm feature cho AI",
      },

      // --- NHÓM VỊ TRÍ & THIẾT BỊ (WHERE & CONTEXT) ---
      latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: true,
        comment: "Tọa độ vĩ độ thực tế khi phát sinh hành động",
      },
      longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true,
        comment: "Tọa độ kinh độ thực tế khi phát sinh hành động",
      },
      is_within_geofence: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment:
          "Xác nhận tọa độ có nằm trong vùng an toàn (Kho/Điểm giao) hay không",
      },
      device_fingerprint: {
        type: DataTypes.STRING,
        allowNull: true,
        comment:
          "Mã định danh thiết bị: Giúp AI phát hiện truy cập từ thiết bị lạ",
      },
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: "Địa chỉ IP thực hiện request",
      },

      hour_of_day: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment:
          "Khung giờ thực hiện hành động (0-23), AI cực kỳ cần trường này",
      },

      // TRƯỜNG NÀY ĐỂ AI BIẾT ĐÂU LÀ HÀNH VI ĐÚNG/SAI ĐỂ HỌC:
      ground_truth_target: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "0: Người thường, 1: Hacker (Chỉ dùng cho training)",
      },

      // --- NHÓM QUY TRÌNH & BLOCKCHAIN (CHAIN CONTEXT) ---
      process_step: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Thứ tự bước trong quy trình vận chuyển (Ví dụ: Bước 2/5)",
      },
      blockchain_status: {
        type: DataTypes.ENUM("not_pushed", "pending", "confirmed", "failed"),
        defaultValue: "not_pushed",
        comment:
          "Trạng thái On-chain: Đối chiếu tính minh bạch giữa DB và Ledger",
      },

      // --- NHÓM HIỆU NĂNG ---
      response_time_ms: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment:
          "Thời gian xử lý của hệ thống (ms): Phát hiện nghẽn hoặc bot spam",
      },
      time_since_last_action: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Khoảng thời gian (ms) từ action trước đó của cùng actor",
      },
      is_verified_label: {
        type: DataTypes.ENUM("pending", "true_anomaly", "false_positive"),
        defaultValue: "pending",
        comment: "Xác nhận của admin về anomaly",
      },
      reviewed_by: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      anomaly_source: {
        type: DataTypes.ENUM("rule", "ai"),
        allowNull: true,
      },
      anomaly_score: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      risk_level: {
        type: DataTypes.ENUM("critical", "high", "low", "pending"),
        defaultValue: "pending",
      },
      is_training_sample: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Đánh dấu bản ghi này đã được dùng để train AI hay chưa",
      },
    },
    {
      tableName: "Activity_Log_TraceChain",
      timestamps: true,
      underscored: true,
      comment:
        "Bảng lưu trữ lịch sử hoạt động tổng thể phục vụ huấn luyện mô hình Anomaly Detection",
    },
  );

  Activity_Log_TraceChain.associate = (models) => {
    Activity_Log_TraceChain.belongsTo(models.Actor_model, {
      foreignKey: "actor_id",
      as: "performer",
    });
  };

  return Activity_Log_TraceChain;
};
