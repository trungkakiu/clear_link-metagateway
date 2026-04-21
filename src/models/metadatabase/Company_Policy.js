export default (sequelize, DataTypes) => {
  const Company_Policy = sequelize.define(
    "Company_Policy",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      company_id: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: "ID của Manufacturer, Distributor, v.v.",
      },
      policy_type: {
        type: DataTypes.ENUM(
          "warranty",
          "shipping",
          "payment",
          "return",
          "other",
        ),
        defaultValue: "other",
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "Nội dung văn bản của điều khoản",
      },
      version: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      pdf_file_url: {
        type: DataTypes.STRING,
      },
    },
    {
      tableName: "Company_Policy",
      timestamps: true,
    },
  );

  Company_Policy.associate = (models) => {
    Company_Policy.belongsTo(models.Manufacturer, {
      foreignKey: "company_id",
      constraints: false,
      as: "manufacturer_policy",
    });

    Company_Policy.belongsTo(models.Distributor, {
      foreignKey: "company_id",
      constraints: false,
      as: "distributor_policy",
    });

    Company_Policy.belongsTo(models.Retailer, {
      foreignKey: "company_id",
      constraints: false,
      as: "retailer_policy",
    });

    Company_Policy.belongsTo(models.Transporter, {
      foreignKey: "company_id",
      constraints: false,
      as: "transporter_policy",
    });
  };

  return Company_Policy;
};
