export default (sequelize, DataTypes) => {
  const Product_category = sequelize.define(
    "Product_category",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      cate_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      author: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("available", "pre_order", "custom_order"),
        allowNull: false,
        defaultValue: "available",
      },
    },
    {
      tableName: "Product_category",
      timestamps: true,
      underscored: false,
    }
  );

  Product_category.associate = (models) => {
    Product_category.hasMany(models.Product, {
      foreignKey: "category_id",
      as: "products",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    Product_category.belongsTo(models.Manufacturer, {
      foreignKey: "author",
      targetKey: "id",
      as: "manufacturer",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return Product_category;
};
