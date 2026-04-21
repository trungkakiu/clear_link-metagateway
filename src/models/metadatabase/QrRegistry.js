export default (sequelize, DataTypes) => {
  const QrRegistry = sequelize.define(
    "QrRegistry",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      Author: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      Actor_scaned: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      Actor_created: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      target_batch: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      target_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      target_type: {
        type: DataTypes.ENUM("BATCH", "ORDER", "PRODUCT"),
        allowNull: false,
      },
      secure_token: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      print_status: {
        type: DataTypes.ENUM("pending", "printed", "failed"),
        defaultValue: "pending",
      },
      print_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      status: {
        type: DataTypes.ENUM("verified", "pending", "revoked"),
        defaultValue: "pending",
      },
      blockchain_proof: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "QrRegistry",
      timestamps: true,
      underscored: false,
    },
  );

  QrRegistry.associate = (models) => {
    QrRegistry.belongsTo(models.Actor_model, {
      foreignKey: "Actor_created",
      as: "creator_actor",
    });

    QrRegistry.belongsTo(models.Actor_model, {
      foreignKey: "Actor_scaned",
      as: "scanner_actor",
    });

    QrRegistry.belongsTo(models.Manufacturer, {
      foreignKey: "Author",
      as: "owner_company",
    });

    QrRegistry.belongsTo(models.product_batch, {
      foreignKey: "target_batch",
      constraints: false,
      as: "batch_detail",
    });

    QrRegistry.belongsTo(models.shipping_order, {
      foreignKey: "target_id",
      constraints: false,
      as: "order_detail",
    });
  };

  return QrRegistry;
};
