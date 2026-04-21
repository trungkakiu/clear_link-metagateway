export default (sequelize, DataTypes) => {
  const Fleet_Vehicle = sequelize.define(
    "Fleet_Vehicle",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true, // Để tự động tăng cho khỏe anh ạ
      },
      fleet_id: { type: DataTypes.STRING, allowNull: false },
      vehicle_id: { type: DataTypes.STRING, allowNull: false },
      assigned_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      released_date: { type: DataTypes.DATE, allowNull: true },
      status: {
        type: DataTypes.ENUM("active", "inactive"),
        defaultValue: "active",
      },
      note: { type: DataTypes.STRING, allowNull: true },
    },
    { tableName: "Fleet_Vehicle", timestamps: true },
  );

  return Fleet_Vehicle;
};
