export default (sequelize, DataTypes) => {
  const Product = sequelize.define(
    "Product",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true, // ID gốc không đổi (ví dụ: PROD_001)
      },
      author: {
        type: DataTypes.STRING,
        allowNull: false, // Nhà sản xuất tạo ra SP này
      },
      type: {
        type: DataTypes.ENUM(
          "general",
          "electronics",
          "food_beverage",
          "chemicals",
          "garment",
          "medical",
          "construction",
        ),
        defaultValue: "general",
      },
      OEM: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      category_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      stock_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0, // Số lượng tồn kho thực tế (biến động liên tục nên để ở Master)
      },
    },
    {
      tableName: "Product",
      timestamps: true,
    },
  );

  Product.associate = (models) => {
    Product.belongsTo(models.Product_category, {
      foreignKey: "category_id",
      as: "category",
    });
    Product.belongsTo(models.Manufacturer, {
      foreignKey: "author",
      as: "manufacturer_info",
    });
    Product.hasMany(models.Product_Metadata, {
      foreignKey: "product_id",
      as: "versions",
    });
  };

  return Product;
};
