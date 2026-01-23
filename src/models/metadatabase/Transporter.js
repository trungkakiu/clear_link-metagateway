export default (sequelize, DataTypes) => {
  const Transporter = sequelize.define(
    "Transporter",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      actor_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM(
          "active",
          "pending",
          "in_down_progess",
          "donw",
          "not_active"
        ),
      },
      company_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      license_number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      fleet_count: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      operation_area: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      contact_manager: {
        type: DataTypes.STRING,
        defaultValue: "03xxxxxxx",
        allowNull: false,
      },
      contact_phone: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      tableName: "Transporter",
      timestamps: true,
      underscored: false,
    }
  );

  Transporter.associate = (models) => {
    Transporter.hasMany(models.Fleet, { foreignKey: "transporter_id" });
    Transporter.belongsTo(models.Actor_model, {
      foreignKey: "actor_id",
      targetKey: "id",
      as: "actor_owner",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Transporter.belongsToMany(models.Distributor, {
      through: "Distributor_Transporter",
      foreignKey: "transporter_id",
    });
  };

  return Transporter;
};
