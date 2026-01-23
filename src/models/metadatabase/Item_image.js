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
          "transporter"
        ),
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
    }
  );

  Item_image.associate = () => {};

  return Item_image;
};
