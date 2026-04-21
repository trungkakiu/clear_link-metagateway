export default (sequelize, DataTypes) => {
  const Manufacturer = sequelize.define(
    "Manufacturer",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      actor_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      is_custom_ready: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment:
          "Đánh dấu doanh nghiệp có nhận sản xuất theo yêu cầu (OEM) hay không",
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
      license_number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      tax_code: {
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
      logo: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      production_capacity: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      certifications: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      contact_person: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      contact_phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      contact_mail: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      chain_status: {
        type: DataTypes.ENUM("pending", "pairing", "not_pair", "active"),
        defaultValue: "pending",
      },
    },
    {
      tableName: "Manufacturer",
      timestamps: true,
      underscored: false,
    },
  );

  Manufacturer.associate = (models) => {
    Manufacturer.belongsTo(models.Actor_model, {
      foreignKey: "actor_id",
      targetKey: "id",
      as: "actor_owner",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    Manufacturer.hasOne(models.Company_market_info, {
      foreignKey: "company_id",
      as: "market_info",
      constraints: false,
      scope: {
        company_type: "Manufacturer",
      },
    });

    Manufacturer.hasMany(models.Company_Policy, {
      foreignKey: "company_id",
      as: "company_policies",
      constraints: false,
    });

    Manufacturer.belongsToMany(models.Production_Sector, {
      through: {
        model: "Company_Sector",
        scope: {
          company_type: "Manufacturer",
        },
      },
      foreignKey: "company_id",
      otherKey: "sector_id",
      as: "production_sectors",
      constraints: false,
    });

    Manufacturer.hasMany(models.Product, {
      foreignKey: "manufacturer_id",
      sourceKey: "id",
      as: "products",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Manufacturer.hasMany(models.Product_category, {
      foreignKey: "author",
      sourceKey: "id",
      as: "categories",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    Manufacturer.hasMany(models.Company_Collaboration, {
      foreignKey: "sender_id",
      constraints: false,
      scope: { sender_type: "MANUFACTURER" },
      as: "sent_proposals",
    });

    Manufacturer.hasMany(models.Company_Collaboration, {
      foreignKey: "receiver_id",
      constraints: false,
      scope: { receiver_type: "MANUFACTURER" },
      as: "received_proposals",
    });
    Manufacturer.hasMany(models.product_batch, {
      foreignKey: "author",
      sourceKey: "id",
      as: "batches",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Manufacturer.hasMany(models.Pinned_Products, {
      foreignKey: "owner_id",
      constraints: false,
      scope: { receiver_type: "MANUFACTURER" },
      as: "Owner_pfl",
    });

    Manufacturer.hasMany(models.Pinned_Products, {
      foreignKey: "pinner_id",
      constraints: false,
      scope: { receiver_type: "MANUFACTURER" },
      as: "Pinner_pfl",
    });
  };

  return Manufacturer;
};
