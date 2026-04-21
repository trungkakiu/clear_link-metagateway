export default (sequelize, DataTypes) => {
  const tb_transactions = sequelize.define(
    "tb_transactions",

    {
      id: { type: DataTypes.INTEGER, primaryKey: true }, // ID từ SePay (92704)
      gateway: { type: DataTypes.STRING }, // Vietcombank/BIDV
      transaction_date: { type: DataTypes.DATE }, // 2023-03-25 14:02:37
      account_number: { type: DataTypes.STRING }, // Số TK nhận
      amount_in: { type: DataTypes.DECIMAL(20, 2) }, // transferAmount (nếu in)
      amount_out: { type: DataTypes.DECIMAL(20, 2) }, // transferAmount (nếu out)
      accumulated: { type: DataTypes.DECIMAL(20, 2) }, // Số dư sau GD
      code: { type: DataTypes.STRING }, // Mã code SePay nhận diện
      transaction_content: { type: DataTypes.TEXT },
      reference_number: { type: DataTypes.STRING },
      body: { type: DataTypes.TEXT },
      order_id: { type: DataTypes.STRING },
    },
    {
      tableName: "tb_transactions",
      timestamps: true,
      underscored: false,
    },
  );

  tb_transactions.associate = (models) => {};

  return tb_transactions;
};
