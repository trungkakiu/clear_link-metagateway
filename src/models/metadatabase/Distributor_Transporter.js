export default (sequelize, DataTypes) => {
  const Distributor_Transporter = sequelize.define(
    "Distributor_Transporter",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      distributor_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      transporter_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      contract_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      contract_start: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      contract_end: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      service_scope: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("active", "paused", "terminated"),
        allowNull: false,
      },
      notes: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "Distributor_Transporter",
      timestamps: true,
      underscored: false,
    }
  );

  Distributor_Transporter.associate = (models) => {
    Distributor_Transporter.belongsTo(models.Distributor, {
      foreignKey: "distributor_id",
      as: "distributor",
    });

    Distributor_Transporter.belongsTo(models.Transporter, {
      foreignKey: "transporter_id",
      as: "transporter",
    });
  };

  return Distributor_Transporter;
};
