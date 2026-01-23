export default (sequelize, DataTypes) => {
  const Distributor = sequelize.define(
    "Distributor",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      actor_id: {
        type: DataTypes.STRING,
        allowNull: false,
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
        allowNull: false,
      },
      license_number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      warehouse_location: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      delivery_capacity: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      contact_person: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      contact_number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      tableName: "Distributor",
      timestamps: true,
      underscored: false,
    }
  );

  Distributor.associate = (models) => {
    Distributor.belongsToMany(models.Transporter, {
      through: "Distributor_Transporter",
      foreignKey: "distributor_id",
    });

    Distributor.belongsTo(models.Actor_model, {
      foreignKey: "actor_id",
      targetKey: "id",
      as: "actor_owner",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return Distributor;
};
