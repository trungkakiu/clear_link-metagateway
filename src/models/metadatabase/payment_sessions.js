export default (sequelize, DataTypes) => {
  const payment_sessions = sequelize.define(
    "payment_sessions",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      order_id: { type: DataTypes.INTEGER },
      payer_id: { type: DataTypes.STRING },
      actor_pay_id: { type: DataTypes.STRING },
      receiver_id: { type: DataTypes.STRING },
      amount_expected: { type: DataTypes.DECIMAL(20, 2) },
      amount_actual: { type: DataTypes.DECIMAL(20, 2) },
      payment_code: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true,
        comment: "Mã nội dung chuyển khoản (Ví dụ: PIN12345)",
      },
      status: {
        type: DataTypes.ENUM("pending", "paid", "partially_paid", "deposit"),
        defaultValue: "pending",
      },
      sepay_transaction_id: { type: DataTypes.INTEGER },
      updated_at: { type: DataTypes.DATE },
    },
    {
      tableName: "payment_sessions",
      timestamps: true,
      underscored: false,
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
  };

  return payment_sessions;
};
