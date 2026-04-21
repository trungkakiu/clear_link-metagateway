"use strict";
export default (sequelize, DataTypes) => {
  const Product_Packaging = sequelize.define(
    "Product_Packaging",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      author: {
        type: DataTypes.STRING,
      },
      pack_code: {
        type: DataTypes.STRING,
        comment: "Mã loại hộp (VD: CARTON-XL, PALLET-STD)",
      },
      image_printer: {
        type: DataTypes.STRING,
      },
      decription_image: {
        type: DataTypes.STRING,
      },
      status: {
        type: DataTypes.ENUM("active", "deactive"),
      },
      length: { type: DataTypes.DECIMAL(10, 2) },
      width: { type: DataTypes.DECIMAL(10, 2) },
      height: { type: DataTypes.DECIMAL(10, 2) },
      volume: {
        type: DataTypes.VIRTUAL,
        get() {
          return (this.length * this.width * this.height) / 1000000;
        },
        comment: "Thể tích khối",
      },
      max_weight_capacity: {
        type: DataTypes.DECIMAL(10, 2),
        comment: "Tải trọng tối đa của hộp",
      },
      material: {
        type: DataTypes.STRING,
        comment: "Chất liệu (Gỗ, nhựa, Carton)",
      },
    },
    { tableName: "Product_Packaging" },
  );
  Product_Packaging.associate = (models) => {
    Product_Packaging.hasMany(models.product_batch, {
      foreignKey: "Product_box_model",
      as: "Batch_boxed",
    });
  };
  return Product_Packaging;
};
