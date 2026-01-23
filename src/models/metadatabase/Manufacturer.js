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
      status: {
        type: DataTypes.ENUM(
          "active",
          "pending",
          "in_down_progess",
          "donw",
          "not_active"
        ),
      },
      factory_name: {
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
      location: {
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
    },
    {
      tableName: "Manufacturer",
      timestamps: true,
      underscored: false,
    }
  );

  Manufacturer.associate = (models) => {
    Manufacturer.belongsTo(models.Actor_model, {
      foreignKey: "actor_id",
      targetKey: "id",
      as: "actor_owner",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
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
    Manufacturer.hasMany(models.product_batch, {
      foreignKey: "author",
      sourceKey: "id",
      as: "batches",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return Manufacturer;
};
