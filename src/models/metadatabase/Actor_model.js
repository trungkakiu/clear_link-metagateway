export default (sequelize, DataTypes) => {
  const Actor_model = sequelize.define(
    "Actor_model",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      address_1: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      address_2: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      public_key: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      personal_tax_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      provider: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "local",
      },
      phone_number: {
        type: DataTypes.STRING,
        defaultValue: "03xxxxxxx",
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      avatar: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      fcm_token: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      Session_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      User_agent: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      role_active: {
        type: DataTypes.ENUM("pending", "not_active", "active"),
        defaultValue: "not_active",
      },
      setup_status: {
        type: DataTypes.ENUM("no_setup", "pending", "ban", "setup"),
        defaultValue: "no_setup",
      },
      is_prime: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      role: {
        type: DataTypes.ENUM(
          "admin",
          "shiper",
          "transporter",
          "staff",
          "user",
          "manufacturer",
          "distributor",
          "retailer",
        ),
        allowNull: false,
        defaultValue: "user",
      },
      status: {
        type: DataTypes.ENUM("active", "block", "pairing", "ban", "pending"),
        allowNull: false,
        defaultValue: "pending",
      },
    },
    {
      tableName: "Actor_model",
      timestamps: true,
      underscored: false,
    },
  );

  Actor_model.associate = (models) => {
    Actor_model.hasMany(models.Manufacturer, {
      foreignKey: "actor_id",
      sourceKey: "id",
      as: "manufacturers",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Actor_model.hasOne(models.Company_account_level, {
      foreignKey: "Actor_id",
      sourceKey: "id",
      as: "company_contact",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Actor_model.hasMany(models.Vehicle, {
      foreignKey: "driver_id",
      as: "DrivenVehicles",
    });
    Actor_model.hasMany(models.TokenBlacklist, {
      foreignKey: "Actor_id",
      as: "black_list_token",
    });
    Actor_model.hasMany(models.Distributor, {
      foreignKey: "actor_id",
      sourceKey: "id",
      as: "distributors",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Actor_model.hasMany(models.Retailer, {
      foreignKey: "actor_id",
      sourceKey: "id",
      as: "retailers",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Actor_model.hasMany(models.Product, {
      foreignKey: "responsible_person",
      sourceKey: "id",
      as: "responsible_products",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    Actor_model.hasMany(models.Transporter, {
      foreignKey: "actor_id",
      sourceKey: "id",
      as: "Transporters",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    Actor_model.hasOne(models.ProductionStaff, {
      foreignKey: "actor_id",
      sourceKey: "id",
      as: "production_staff_info",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Actor_model.hasMany(models.product_batch, {
      foreignKey: "qc_staff_id",
      sourceKey: "id",
      as: "Product_QC",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    Actor_model.hasMany(models.product_batch, {
      foreignKey: "qc_manager_id",
      sourceKey: "id",
      as: "Product_QC_Manager",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
  };

  return Actor_model;
};
