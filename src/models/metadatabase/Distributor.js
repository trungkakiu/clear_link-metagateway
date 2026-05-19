export default (sequelize, DataTypes) => {
  const Distributor = sequelize.define(
    "Distributor",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      actor_id: {
        type: DataTypes.STRING,
        allowNull: false,
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
      license_number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      delivery_capacity: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      logo: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      contact_person: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      contact_number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      chain_status: {
        type: DataTypes.ENUM("pending", "pairing", "not_pair", "active"),
        defaultValue: "pending",
      },
      txt_hash: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "mã bảo chứng chain",
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

      training_threshold: {
        type: DataTypes.INTEGER,
        defaultValue: 5000,
        comment:
          "Ngưỡng số lượng logs để tự động kích hoạt Retrain (5000 hoặc 10000)",
      },
    },
    {
      tableName: "Distributor",
      timestamps: true,
      underscored: false,
    },
  );

  Distributor.associate = (models) => {
    Distributor.belongsToMany(models.Transporter, {
      through: "Distributor_Transporter",
      foreignKey: "distributor_id",
    });

    Distributor.belongsTo(models.Actor_model, {
      foreignKey: "actor_id",
      targetKey: "id",
      as: "actor_owner",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Distributor.belongsToMany(models.Production_Sector, {
      through: {
        model: "Company_Sector",
        scope: {
          company_type: "Distributor",
        },
      },
      constraints: false,
      foreignKey: "company_id",
      otherKey: "sector_id",
      as: "production_sectors",
    });
    Distributor.hasMany(models.Company_Policy, {
      foreignKey: "company_id",
      as: "company_policies",
      constraints: false,
    });
    Distributor.hasMany(models.Company_Collaboration, {
      foreignKey: "sender_id",
      constraints: false,
      scope: { sender_type: "DISTRIBUTOR" },
      as: "sent_proposals",
    });

    Distributor.hasMany(models.Pinned_Products, {
      foreignKey: "owner_id",
      constraints: false,
      scope: { receiver_type: "DISTRIBUTOR" },
      as: "Owner_pfl",
    });

    Distributor.hasMany(models.Pinned_Products, {
      foreignKey: "pinner_id",
      constraints: false,
      scope: { receiver_type: "DISTRIBUTOR" },
      as: "Pinner_pfl",
    });

    Distributor.hasMany(models.Company_Collaboration, {
      foreignKey: "receiver_id",
      constraints: false,
      scope: { receiver_type: "DISTRIBUTOR" },
      as: "received_proposals",
    });

    Distributor.hasMany(models.Warehouse, {
      foreignKey: "author",
      constraints: false,
      scope: { warehouse_type: "DISTRIBUTOR" },
      as: "warehouses_d",
    });

    Distributor.hasOne(models.Company_market_info, {
      foreignKey: "company_id",
      as: "market_info",
      constraints: false,
      scope: {
        company_type: "Distributor",
      },
    });
  };

  return Distributor;
};
