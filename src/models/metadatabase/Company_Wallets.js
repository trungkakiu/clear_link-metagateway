"use strict";
export default (sequelize, DataTypes) => {
  const Company_Wallets = sequelize.define(
    "Company_Wallets",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      company_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      bank_code: {
        type: DataTypes.STRING,
        comment: "Mã ngân hàng (vcb, mbb, icb... theo chuẩn Napas)",
      },
      account_number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      account_name: {
        type: DataTypes.STRING,
        comment: "Tên chủ tài khoản (Dùng để đối soát auto)",
      },
      balance: {
        type: DataTypes.DECIMAL(20, 2),
        defaultValue: 0.0,
        comment: "Số dư thực có thể rút",
      },
      frozen_balance: {
        type: DataTypes.DECIMAL(20, 2),
        defaultValue: 0.0,
        comment: "Số dư đang bị khóa (đang giao dịch, chờ giải ngân)",
      },
      daily_payout_limit: {
        type: DataTypes.DECIMAL(20, 2),
        defaultValue: 100000000.0,
        comment: "Giới hạn rút tiền hàng ngày",
      },
      last_payout_time: {
        type: DataTypes.DATE,
        comment:
          "Thời điểm giao dịch rút tiền gần nhất (dùng để reset limit hàng ngày)",
      },

      is_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Đã xác thực tài khoản ngân hàng chính chủ chưa",
      },
      status: {
        type: DataTypes.ENUM("active", "locked", "pending", "reject"),
        defaultValue: "pending",
        comment: "Trạng thái tài khoản ví",
      },
      reject_resson: {
        type: DataTypes.STRING,
      },
      QR_pay: {
        type: DataTypes.STRING,
        comment: "qr thanh toán",
      },
      wallet_kyc: {
        type: DataTypes.STRING,
        comment: "file xác minh tài khoản ví",
      },
    },
    {
      tableName: "Company_Wallets",
      timestamps: true,
      indexes: [
        {
          unique: true,
          name: "unique_company_wallet",
          fields: ["company_id"],
        },
      ],
    },
  );

  Company_Wallets.associate = (models) => {
    Company_Wallets.belongsTo(models.Distributor, {
      foreignKey: "company_id",
      constraints: false,
      as: "company_d",
    });
    Company_Wallets.belongsTo(models.Retailer, {
      foreignKey: "company_id",
      constraints: false,
      as: "company_r",
    });
    Company_Wallets.belongsTo(models.Transporter, {
      foreignKey: "company_id",
      constraints: false,
      as: "company_t",
    });
    Company_Wallets.belongsTo(models.Manufacturer, {
      foreignKey: "company_id",
      constraints: false,
      as: "company_m",
    });
  };

  return Company_Wallets;
};
