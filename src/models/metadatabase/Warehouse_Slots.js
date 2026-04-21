"use strict";
export default (sequelize, DataTypes) => {
  const Warehouse_Slots = sequelize.define(
    "Warehouse_Slots",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      slot_code: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: "Tọa độ: ví dụ A1-R01-L02-S03",
      },
      rack_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      zone_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      max_weight: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
      current_weight: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
      status: {
        type: DataTypes.ENUM("EMPTY", "PARTIAL", "FULL", "MAINTENANCE"),
        defaultValue: "EMPTY",
      },
      allowed_categories: {
        type: DataTypes.JSON, 
        allowNull: true,
      },
    },
    { tableName: "Warehouse_Slots", timestamps: true },
  );

  Warehouse_Slots.associate = (models) => {
    Warehouse_Slots.belongsTo(models.Warehouse_Racks, {
      foreignKey: "rack_id",
      as: "rack",
    });
    Warehouse_Slots.belongsTo(models.Warehouse_Zones, {
      foreignKey: "zone_id",
      as: "zone",
    });
    Warehouse_Slots.hasMany(models.Stock_Inventory, {
      foreignKey: "slot_id",
      as: "inventory",
    });
  };
  return Warehouse_Slots;
};
