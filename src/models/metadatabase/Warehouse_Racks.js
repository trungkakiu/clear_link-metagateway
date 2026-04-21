"use strict";

export default (sequelize, DataTypes) => {
  const Warehouse_Racks = sequelize.define(
    "Warehouse_Racks",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      rack_code: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: "Mã dãy kệ, ví dụ: R01, R02",
      },
      zone_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      rack_type: {
        type: DataTypes.ENUM("SELECTIVE", "DRIVE_IN", "FLOW", "CANTILEVER"),
        allowNull: false,
        defaultValue: "SELECTIVE",
      },
      maximum_weight: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
      },
      max_height: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 2.0,
        comment: "Chiều cao thông thủy tối đa của ô kệ (mét)",
      },
      current_weight: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
      },
      num_levels: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      num_slots_per_level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
    },
    {
      tableName: "Warehouse_Racks",
      timestamps: true,
    },
  );

  Warehouse_Racks.associate = (models) => {
    Warehouse_Racks.belongsTo(models.Warehouse_Zones, {
      foreignKey: "zone_id",
      as: "zone_data",
    });

    Warehouse_Racks.hasMany(models.Warehouse_Slots, {
      foreignKey: "rack_id",
      as: "slots",
    });
  };

  return Warehouse_Racks;
};
