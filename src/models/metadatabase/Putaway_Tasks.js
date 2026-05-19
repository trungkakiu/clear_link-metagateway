// Tạo file mới: Putaway_Tasks.js
"use strict";
export default (sequelize, DataTypes) => {
  const Putaway_Tasks = sequelize.define(
    "Putaway_Tasks",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      shipping_order_id: { type: DataTypes.STRING, allowNull: false },
      batch_id: { type: DataTypes.STRING, allowNull: false },
      product_id: { type: DataTypes.STRING, allowNull: false },
      suggested_slot_id: { type: DataTypes.UUID, allowNull: false },
      suggested_quantity: { type: DataTypes.INTEGER, allowNull: false },
      status: {
        type: DataTypes.ENUM("PENDING", "COMPLETED", "OVERRIDDEN", "CANCELLED"),
        defaultValue: "PENDING",
      },
    },
    { tableName: "Putaway_Tasks", timestamps: true },
  );
  
  Putaway_Tasks.associate = (models) => {
    Putaway_Tasks.belongsTo(models.Warehouse_Slots, {
      foreignKey: "suggested_slot_id",
      as: "slot",
    });

    Putaway_Tasks.belongsTo(models.product_batch, {
      foreignKey: "batch_id",
      as: "batch",
    });
  };
  return Putaway_Tasks;
};
