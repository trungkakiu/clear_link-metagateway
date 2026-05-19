export default (sequelize, DataTypes) => {
  const Transporter = sequelize.define(
    "Transporter",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      actor_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM(
          "active",
          "pending",
          "in_down_progess",
          "banding",
          "not_active",
        ),
      },
      company_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      license_number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      fleet_count: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      operation_area: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      contact_person: {
        type: DataTypes.STRING,
        defaultValue: "03xxxxxxx",
        allowNull: false,
      },
      address_detail: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      location: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true,
      },
      latitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true,
      },
      contact_phone: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      logo: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      chain_status: {
        type: DataTypes.ENUM("pending", "pairing", "not_pair", "active"),
        defaultValue: "pending",
      },
      AI_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Bật/Tắt tính năng AI Anomaly Detection cho công ty này",
      },

      log_counter: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment:
          "Đếm số log tích lũy kể từ lần tính Baseline/Retrain cuối cùng",
      },
      txt_hash: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "mã bảo chứng chain",
      },
      training_threshold: {
        type: DataTypes.INTEGER,
        defaultValue: 5000,
        comment:
          "Ngưỡng số lượng logs để tự động kích hoạt Retrain (5000 hoặc 10000)",
      },
    },
    {
      tableName: "Transporter",
      timestamps: true,
      underscored: false,
    },
  );

  Transporter.associate = (models) => {
    Transporter.hasMany(models.Fleet, { foreignKey: "transporter_id" });
    Transporter.belongsTo(models.Actor_model, {
      foreignKey: "actor_id",
      targetKey: "id",
      as: "actor_owner",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Transporter.hasMany(models.Company_Policy, {
      foreignKey: "company_id",
      as: "company_policies",
      constraints: false,
    });

    Transporter.hasMany(models.Pinned_Products, {
      foreignKey: "owner_id",
      constraints: false,
      scope: { receiver_type: "TRANSPORTER" },
      as: "Owner_pfl",
    });

    Transporter.hasMany(models.Pinned_Products, {
      foreignKey: "pinner_id",
      constraints: false,
      scope: { receiver_type: "TRANSPORTER" },
      as: "Pinner_pfl",
    });
    Transporter.hasOne(models.shipping_price_config, {
      foreignKey: "Author",
      as: "base_price",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Transporter.hasMany(models.Warehouse, {
      foreignKey: "author",
      constraints: false,
      scope: { warehouse_type: "TRANSPORTER" },
      as: "warehouses_t",
    });
    Transporter.belongsToMany(models.Production_Sector, {
      through: {
        model: "Company_Sector",
        scope: {
          company_type: "Transporter",
        },
      },
      constraints: false,
      foreignKey: "company_id",
      otherKey: "sector_id",
      as: "production_sectors",
    });

    Transporter.hasOne(models.Company_market_info, {
      foreignKey: "company_id",
      as: "market_info",
      constraints: false,
      scope: {
        company_type: "Transporter",
      },
    });

    Transporter.hasOne(models.shipping_price_config, {
      foreignKey: "Author",
      as: "Order_price",
      constraints: true,
    });

    Transporter.hasMany(models.Company_Collaboration, {
      foreignKey: "sender_id",
      constraints: false,
      scope: { sender_type: "TRANSPORTER" },
      as: "sent_proposals",
    });

    Transporter.hasMany(models.Company_Collaboration, {
      foreignKey: "receiver_id",
      constraints: false,
      scope: { receiver_type: "TRANSPORTER" },
      as: "received_proposals",
    });
    Transporter.belongsToMany(models.Distributor, {
      through: "Distributor_Transporter",
      foreignKey: "transporter_id",
    });
  };

  return Transporter;
};
