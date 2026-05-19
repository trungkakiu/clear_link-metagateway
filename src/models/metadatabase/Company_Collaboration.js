import { Model, Op } from "sequelize";

export default (sequelize, DataTypes) => {
  const Company_Collaboration = sequelize.define(
    "Company_Collaboration",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },

      sender_id: { type: DataTypes.STRING, allowNull: false },
      sender_type: {
        type: DataTypes.ENUM(
          "MANUFACTURER",
          "DISTRIBUTOR",
          "RETAILER",
          "TRANSPORTER",
        ),
        allowNull: false,
      },

      receiver_id: { type: DataTypes.STRING, allowNull: false },
      receiver_type: {
        type: DataTypes.ENUM(
          "MANUFACTURER",
          "DISTRIBUTOR",
          "RETAILER",
          "TRANSPORTER",
        ),
        allowNull: false,
      },

      sender_company_name: DataTypes.STRING,
      sender_contact_name: DataTypes.STRING,
      sender_contact_phone: DataTypes.STRING,
      sender_contact_email: DataTypes.STRING,
      receiver_company_name: DataTypes.STRING,
      receiver_contact_email: DataTypes.STRING,

      status: {
        type: DataTypes.ENUM(
          "pending",
          "accepted",
          "negotiating",
          "negotiating_acp",
          "negotiating_rej",
          "signing",
          "official",
          "rejected",
          "canceled",
        ),
        defaultValue: "pending",
      },

      proposal_message: DataTypes.TEXT,
      collaboration_type: DataTypes.ENUM(
        "OEM Manufacturing",
        "Comprehensive Partnership",
        "Supply Chain Connection",
        "Distributor",
      ),
      attached_profile_url: DataTypes.STRING,

      nda_hash: DataTypes.STRING,
      contract_pdf_url: DataTypes.STRING,
      contract_id: DataTypes.STRING,
      digital_signatures: { type: DataTypes.JSON, defaultValue: {} },
      txt_hash: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "mã bảo chứng chain",
      },
      onchain_status: { type: DataTypes.STRING, defaultValue: "off-chain" },
      accepted_at: DataTypes.DATE,
      official_at: DataTypes.DATE,
    },
    {
      tableName: "Company_Collaborations",
      timestamps: true,
      hooks: {
        afterFind: (results) => {
          if (!results) return;
          const formatData = (item) => {
            item.setDataValue(
              "sender_data",
              item.sender_m ||
                item.sender_d ||
                item.sender_r ||
                item.sender_t ||
                null,
            );

            item.setDataValue(
              "receiver_data",
              item.receiver_m ||
                item.receiver_d ||
                item.receiver_r ||
                item.receiver_t ||
                null,
            );

            const fields = [
              "sender_m",
              "sender_d",
              "sender_r",
              "sender_t",
              "receiver_m",
              "receiver_d",
              "receiver_r",
              "receiver_t",
            ];
            fields.forEach((f) => delete item.dataValues[f]);
          };

          if (Array.isArray(results)) {
            results.forEach(formatData);
          } else {
            formatData(results);
          }
        },
      },
    },
  );

  Company_Collaboration.associate = (models) => {
    Company_Collaboration.belongsTo(models.Manufacturer, {
      foreignKey: "sender_id",
      constraints: false,
      as: "sender_m",
    });
    Company_Collaboration.belongsTo(models.ContractTemplate, {
      foreignKey: "contract_id",
      constraints: false,
      as: "contract_template",
    });
    Company_Collaboration.belongsTo(models.Distributor, {
      foreignKey: "sender_id",
      constraints: false,
      as: "sender_d",
    });
    Company_Collaboration.belongsTo(models.Retailer, {
      foreignKey: "sender_id",
      constraints: false,
      as: "sender_r",
    });
    Company_Collaboration.belongsTo(models.Transporter, {
      foreignKey: "sender_id",
      constraints: false,
      as: "sender_t",
    });

    Company_Collaboration.belongsTo(models.Manufacturer, {
      foreignKey: "receiver_id",
      constraints: false,
      as: "receiver_m",
    });
    Company_Collaboration.belongsTo(models.Distributor, {
      foreignKey: "receiver_id",
      constraints: false,
      as: "receiver_d",
    });
    Company_Collaboration.belongsTo(models.Retailer, {
      foreignKey: "receiver_id",
      constraints: false,
      as: "receiver_r",
    });
    Company_Collaboration.belongsTo(models.Transporter, {
      foreignKey: "receiver_id",
      constraints: false,
      as: "receiver_t",
    });
  };

  return Company_Collaboration;
};
