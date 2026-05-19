export default (sequelize, DataTypes) => {
  const payment_sessions = sequelize.define(
    "payment_sessions",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      order_id: { type: DataTypes.INTEGER },
      payer_id: { type: DataTypes.STRING },
      ship_id: {
        type: DataTypes.STRING,
      },
      actor_pay_id: { type: DataTypes.STRING },
      receiver_id: { type: DataTypes.STRING },
      amount_expected: { type: DataTypes.DECIMAL(20, 2) },
      amount_actual: { type: DataTypes.DECIMAL(20, 2) },
      payment_code: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "Mã nội dung chuyển khoản (Ví dụ: PIN12345)",
      },
      status: {
        type: DataTypes.ENUM("pending", "paid", "partially_paid", "deposit"),
        defaultValue: "pending",
      },
      payment_method: {
        type: DataTypes.ENUM("system_wallet", "prepaid", "cod", "deposit"),
        defaultValue: "prepaid",
      },
      chain_status: {
        type: DataTypes.ENUM("pending", "not_ready", "paring", "active"),
        defaultValue: "not_ready",
      },
      txt_hash: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "mã bảo chứng chain",
      },
      type: {
        type: DataTypes.ENUM("verify", "paybill"),
        defaultValue: "paybill",
      },
      sepay_transaction_id: { type: DataTypes.INTEGER },
      updated_at: { type: DataTypes.DATE },
    },
    {
      tableName: "payment_sessions",
      timestamps: true,
      underscored: false,
      indexes: [
        {
          unique: true,
          name: "unique_payment_code",
          fields: ["payment_code"],
        },
      ],
    },
  );

  payment_sessions.associate = (models) => {
    payment_sessions.belongsTo(models.Pinned_Products, {
      foreignKey: "order_id",
      constraints: true,
      as: "order",
    });

    payment_sessions.belongsTo(models.Actor_model, {
      foreignKey: "actor_pay_id",
      constraints: false,
      as: "payer",
    });

    payment_sessions.hasOne(models.shipping_order, {
      foreignKey: "ship_id",
      constraints: false,
      as: "ship_pay",
    });
  };

  return payment_sessions;
};
