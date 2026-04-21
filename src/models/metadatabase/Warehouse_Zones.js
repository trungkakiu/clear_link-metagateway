"use strict";

export default (sequelize, DataTypes) => {
  const Warehouse_Zones = sequelize.define(
    "Warehouse_Zones",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      warehouse_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      index: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      zone_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      is_expirable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      storage_method: {
        type: DataTypes.ENUM(
          "RACKING",
          "BULK_STORAGE",
          "FLOOR_STACKING",
          "OPEN_AREA",
          "COLD_STORAGE",
        ),
        allowNull: false,
        defaultValue: "RACKING",
        comment:
          "Phương thức lưu trữ: Racking cho hàng có date, Bulk cho hàng tập trung",
      },
      status: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "Warehouse_Zones",
      timestamps: true,
    },
  );

  Warehouse_Zones.associate = (models) => {
    Warehouse_Zones.belongsTo(models.Warehouse, {
      foreignKey: "warehouse_id",
      as: "Warehouse_storage",
    });
    Warehouse_Zones.hasMany(models.Warehouse_Racks, {
      foreignKey: "zone_id",
      as: "Racks",
    });
    Warehouse_Zones.hasMany(models.Warehouse_Slots, {
      foreignKey: "zone_id",
      as: "Slots",
    });
  };

  return Warehouse_Zones;
};
