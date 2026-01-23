export default (sequelize, DataTypes) => {
  const Retailer = sequelize.define(
    "Retailer",
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
      store_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      store_address: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      branch_count: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      product_lines: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      contact_person: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      contact_phone: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      tableName: "Retailer",
      timestamps: true,
      underscored: false,
    }
  );

  Retailer.associate = (models) => {
    Retailer.belongsTo(models.Actor_model, {
      foreignKey: "actor_id",
      targetKey: "id",
      as: "actor_owner",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return Retailer;
};
