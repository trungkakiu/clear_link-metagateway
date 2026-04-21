import crypto from "crypto";

export default (sequelize, DataTypes) => {
  const ContractTemplate = sequelize.define(
    "ContractTemplate",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      Owner: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      template_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      collaboration_type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      pdf_file: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      content_html: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      version: {
        type: DataTypes.STRING,
        defaultValue: "1.0.0",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      created_by: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      content_hash: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "contract_templates",
      timestamps: true,
      underscored: true,
      hooks: {
        beforeSave: (template) => {
          if (template.changed("content_html")) {
            const secret =
              process.env.CONTRACT_SECRET_KEY ||
              "AWS_SUPPLY_CHAIN_PRIVATE_KEY_2026";

            template.content_hash = crypto
              .createHmac("sha256", secret)
              .update(template.content_html)
              .digest("hex");

            console.log(
              `[Security] Re-hashed Template ${template.id} using HMAC-SHA256`,
            );
          }
        },
      },
    },
  );

  return ContractTemplate;
};
