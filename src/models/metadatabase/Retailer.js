export default (sequelize, DataTypes) => {
  const Retailer = sequelize.define(
    "Retailer",
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
          "donw",
          "not_active",
        ),
      },
      company_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      store_address: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      branch_count: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      product_lines: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      contact_person: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      license_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      logo: {
        type: DataTypes.STRING,
        allowNull: true,
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
      chain_status: {
        type: DataTypes.ENUM("pending", "pairing", "not_pair", "active"),
        defaultValue: "pending",
      },
    },
    {
      tableName: "Retailer",
      timestamps: true,
      underscored: false,
    },
  );

  Retailer.associate = (models) => {
    Retailer.belongsTo(models.Actor_model, {
      foreignKey: "actor_id",
      targetKey: "id",
      as: "actor_owner",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    Retailer.hasMany(models.Warehouse, {
      foreignKey: "author",
      constraints: false,
      scope: { warehouse_type: "RETAILER" },
      as: "warehouses_r",
    });

    Retailer.hasMany(models.Company_Collaboration, {
      foreignKey: "sender_id",
      constraints: false,
      scope: { sender_type: "RETAILER" },
      as: "sent_proposals",
    });

    Retailer.hasMany(models.Company_Collaboration, {
      foreignKey: "receiver_id",
      constraints: false,
      scope: { receiver_type: "RETAILER" },
      as: "received_proposals",
    });
    Retailer.belongsToMany(models.Production_Sector, {
      through: {
        model: "Company_Sector",
        scope: {
          company_type: "Retailer",
        },
      },
      constraints: false,
      foreignKey: "company_id",
      otherKey: "sector_id",
      as: "production_sectors",
    });
    Retailer.hasOne(models.Company_market_info, {
      foreignKey: "company_id",
      as: "market_info",
      constraints: false,
      scope: {
        company_type: "Retailer",
      },
    });

    Retailer.hasMany(models.Pinned_Products, {
      foreignKey: "owner_id",
      constraints: false,
      scope: { receiver_type: "MANUFACTURER" },
      as: "Owner_pfl",
    });

    Retailer.hasMany(models.Pinned_Products, {
      foreignKey: "pinner_id",
      constraints: false,
      scope: { receiver_type: "RETAILER" },
      as: "Pinner_pfl",
    });

    Retailer.hasMany(models.Company_Policy, {
      foreignKey: "company_id",
      as: "company_policies",
      constraints: false,
    });
  };

  return Retailer;
};
