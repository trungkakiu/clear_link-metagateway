export default (sequelize, DataTypes) => {
  const Fleet_Vehicle = sequelize.define(
    "Fleet_Vehicle",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      fleet_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      vehicle_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      assigned_date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      released_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("active", "inactive"),
        allowNull: false,
      },
      note: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "Fleet_Vehicle",
      timestamps: true,
      underscored: false,
    }
  );

  Fleet_Vehicle.associate = (models) => {
    Fleet_Vehicle.belongsTo(models.Fleet, { foreignKey: "fleet_id" });
    Fleet_Vehicle.belongsTo(models.Vehicle, { foreignKey: "vehicle_id" });
  };

  return Fleet_Vehicle;
};
