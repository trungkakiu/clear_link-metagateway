export default (sequelize, DataTypes) => {
  const Product = sequelize.define(
    "Product",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      price: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      responsible_person: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      author: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      main_cardimage: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM(
          "available",
          "out_of_stock",
          "discontinued",
          "not_sold",
          "pre_order",
          "back_order",
          "limited_edition",
          "clearance",
          "exclusive",
          "custom_order",
        ),
        allowNull: false,
      },
      chain_status: {
        type: DataTypes.ENUM(
          "active",
          "pending",
          "pairing",
          "down",
          "wait-droped",
        ),
        defaultValue: "pending",
      },
      stock_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      category_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "Product",
      timestamps: true,
      underscored: false,
    },
  );

  Product.associate = (models) => {
    Product.belongsTo(models.Product_category, {
      foreignKey: "category_id",
      targetKey: "id",
      as: "category",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    Product.belongsTo(models.Manufacturer, {
      foreignKey: "author",
      targetKey: "id",
      as: "manufacturer",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Product.hasMany(models.product_batch, {
      foreignKey: "product_id",
      as: "batches",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    Product.belongsTo(models.Actor_model, {
      foreignKey: "responsible_person",
      targetKey: "id",
      as: "responsible_actor",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
  };

  return Product;
};
