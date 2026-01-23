export default (sequelize, DataTypes) => {
  const Fleet = sequelize.define(
    "Fleet",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      transporter_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      fleet_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      fleet_code: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      manager_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      manager_phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      operation_area: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      vehicle_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("active", "inactive", "maintenance"),
        allowNull: false,
      },
    },
    {
      tableName: "Fleet",
      timestamps: true,
      underscored: false,
    }
  );

  Fleet.associate = (models) => {
    Fleet.belongsTo(models.Transporter, { foreignKey: "transporter_id" });
    Fleet.belongsToMany(models.Vehicle, {
      through: "Fleet_Vehicle",
      foreignKey: "fleet_id",
    });
  };

  return Fleet;
};
