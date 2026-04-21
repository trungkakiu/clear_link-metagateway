export default (sequelize, DataTypes) => {
  const Item_image = sequelize.define(
    "Item_image",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      image_name: DataTypes.STRING,

      image_type: {
        type: DataTypes.ENUM(
          "actor",
          "product",
          "distributor",
          "manufacturer",
          "retailer",
          "vehicle",
          "transporter",
        ),
        allowNull: false,
      },
      parent_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      owner_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      url: DataTypes.STRING,
      img_des: DataTypes.STRING,
      index: DataTypes.INTEGER,

      status: {
        type: DataTypes.ENUM("censored", "pending", "rejected"),
        defaultValue: "pending",
      },
    },
    {
      tableName: "Item_image",
      timestamps: true,
    },
  );

  Item_image.associate = (models) => {
    Item_image.belongsTo(models.Vehicle, {
      foreignKey: "owner_id",
      constraints: false,
      as: "vehicle",
    });
    Item_image.belongsTo(models.Product, {
      foreignKey: "owner_id",
      constraints: false,
      as: "Product",
    });
  };

  return Item_image;
};
