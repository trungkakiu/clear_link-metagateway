export default (sequelize, DataTypes) => {
  const Company_account_level = sequelize.define(
    "Company_account_level",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      Actor_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      Company_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      role_level: {
        type: DataTypes.ENUM(
          "level_1",
          "level_2",
          "level_3",
          "level_4",
          "level_5"
        ),
        defaultValue: "level_1",
      },
      status: {
        type: DataTypes.ENUM("active", "down", "ban"),
        defaultValue: "active",
      },
      isExcute: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      isRead: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "Company_account_level",
      timestamps: true,
      underscored: false,
    }
  );

  Company_account_level.associate = (models) => {
    Company_account_level.belongsTo(models.Actor_model, {
      foreignKey: "Actor_id",
      sourceKey: "id",
      as: "owner_id",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return Company_account_level;
};
