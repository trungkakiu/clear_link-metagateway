export default (sequelize, DataTypes) => {
  const System_Settings = sequelize.define(
    "System_Settings",
    {
      key: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
      },
      title: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      danger: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      description: {
        type: DataTypes.STRING,
      },
      impact: {
        type: DataTypes.STRING,
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      type_value: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      value: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      tableName: "System_Settings",
      timestamps: true,
    },
  );

  return System_Settings;
};
