export default (sequelize, DataTypes) => {
  const product_batch = sequelize.define(
    "product_batch",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      batch_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      product_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      author: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      manufacture_date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      expiry_date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      tableName: "product_batch",
      timestamps: true,
      underscored: false,
    }
  );

  product_batch.associate = (models) => {
    product_batch.belongsTo(models.Product, {
      foreignKey: "product_id",
      targetKey: "id",
      as: "product",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    product_batch.belongsTo(models.Manufacturer, {
      foreignKey: "author",
      targetKey: "id",
      as: "Manufacture_manager",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return product_batch;
};
