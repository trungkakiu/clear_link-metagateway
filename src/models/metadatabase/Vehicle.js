export default (sequelize, DataTypes) => {
  const Vehicle = sequelize.define(
    "Vehicle",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      plate_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      vehicle_type: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      capacity: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("available", "in_service", "under_maintenance"),
        allowNull: true,
      },
      driver_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      location: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      gps_tracking: {
        type: DataTypes.JSON,
        allowNull: false,
      },
    },
    {
      tableName: "Vehicle",
      timestamps: true,
      underscored: false,
    }
  );

  Vehicle.associate = (models) => {
    Vehicle.belongsToMany(models.Fleet, {
      through: "Fleet_Vehicle",
      foreignKey: "vehicle_id",
    });
    Vehicle.belongsTo(models.Actor_model, {
      as: "Driver",
      foreignKey: "driver_id",
    });
  };

  return Vehicle;
};
