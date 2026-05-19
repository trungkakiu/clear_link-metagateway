"use strict";
export default (sequelize, DataTypes) => {
  const Stock_Inventory = sequelize.define(
    "Stock_Inventory",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      slot_id: { type: DataTypes.UUID, allowNull: false },
      product_id: { type: DataTypes.STRING, allowNull: false },
      batch_id: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: "Mã lô hàng định danh trên Blockchain",
      },
      quantity: { type: DataTypes.INTEGER, defaultValue: 0 },
      expiry_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      qr_code: { type: DataTypes.STRING, allowNull: true },
    },
    { tableName: "Stock_Inventory", timestamps: true },
  );

  Stock_Inventory.associate = (models) => {
    Stock_Inventory.belongsTo(models.Warehouse_Slots, {
      foreignKey: "slot_id",
      as: "location",
    });
    Stock_Inventory.belongsTo(models.Product, {
      foreignKey: "product_id",
      as: "product_info",
    });
    Stock_Inventory.belongsTo(models.product_batch, {
      foreignKey: "batch_id",
      as: "batch_info",
    });
  };
  return Stock_Inventory;
};
