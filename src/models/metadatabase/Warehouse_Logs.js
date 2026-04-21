"use strict";
export default (sequelize, DataTypes) => {
  const Warehouse_Logs = sequelize.define(
    "Warehouse_Logs",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      action_type: {
        type: DataTypes.ENUM("INBOUND", "OUTBOUND", "TRANSFER", "ADJUSTMENT"),
        allowNull: false,
      },
      product_id: { type: DataTypes.UUID, allowNull: false },
      batch_id: { type: DataTypes.STRING, allowNull: false },
      from_slot: { type: DataTypes.UUID, allowNull: true },
      to_slot: { type: DataTypes.UUID, allowNull: true },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      actor_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: "Người thực hiện (Manager/Staff)",
      },
      tx_hash: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "Mã giao dịch Blockchain sau khi bọc thép dữ liệu",
      },
      notes: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: "Warehouse_Logs", timestamps: true },
  );

  return Warehouse_Logs;
};
