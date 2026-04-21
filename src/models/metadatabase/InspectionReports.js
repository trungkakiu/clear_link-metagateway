export default (sequelize, DataTypes) => {
  const InspectionReports = sequelize.define(
    "InspectionReports",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      shiping_id: DataTypes.STRING,
      inspector_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      inspection_type: {
        type: DataTypes.ENUM(
          "return_shipment",
          "repair_product",
          "quality_check",
          "confirm_delivery",
        ),
        allowNull: false,
      },
      inspection_status: {
        type: DataTypes.ENUM("passed", "failed", "pending"),
        defaultValue: "pending",
      },
      condition_summary: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      report_file_url: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      blockchain_hash: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "InspectionReports",
      timestamps: true,
    },
  );

  InspectionReports.associate = (models) => {
    InspectionReports.belongsTo(models.shipping_order, {
      foreignKey: "shiping_id",
      as: "shipping",
    });
  };

  return InspectionReports;
};
