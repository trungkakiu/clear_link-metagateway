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
      reserved_weight: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
        comment:
          "Trọng lượng/Số lượng đang được hệ thống gợi ý cất vào (Giữ chỗ mềm)",
      },
      length: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
      width: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
      height: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
      max_volume: {
        type: DataTypes.DECIMAL(10, 4),
        defaultValue: 0,
        comment: "Sức chứa tối đa theo Thể tích (m³)",
      },
      current_volume: {
        type: DataTypes.DECIMAL(10, 4),
        defaultValue: 0,
        comment: "Thể tích đang bị chiếm dụng thực tế (m³)",
      },
      reserved_volume: {
        type: DataTypes.DECIMAL(10, 4),
        defaultValue: 0,
        comment: "Thể tích đang bị thuật toán giữ chỗ (m³)",
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
