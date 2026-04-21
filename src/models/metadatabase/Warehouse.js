"use strict";

export default (sequelize, DataTypes) => {
  const Warehouse = sequelize.define(
    "Warehouse",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      warehouse_type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      warehouse_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      location: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      type: {
        type: DataTypes.ENUM("dry", "cold", "frozen", "normal"),
        defaultValue: "dry",
      },
      author: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("active", "full", "maintenance", "close"),
        defaultValue: "active",
      },
    },
    {
      tableName: "Warehouses",
      timestamps: true,
    },
  );

  Warehouse.associate = (models) => {
    Warehouse.hasMany(models.Warehouse_Zones, {
      foreignKey: "warehouse_id",
      as: "zones",
    });

    Warehouse.belongsTo(models.Distributor, {
      foreignKey: "author",
      constraints: false,
      as: "owner_d",
    });
    Warehouse.belongsTo(models.Retailer, {
      foreignKey: "author",
      constraints: false,
      as: "owner_r",
    });
    Warehouse.belongsTo(models.Transporter, {
      foreignKey: "author",
      constraints: false,
      as: "owner_t",
    });
  };

  return Warehouse;
};
