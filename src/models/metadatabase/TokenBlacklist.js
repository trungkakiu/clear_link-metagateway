export default (sequelize, DataTypes) => {
  const TokenBlacklist = sequelize.define(
    "TokenBlacklist",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
      },
      token: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      Actor_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      expired_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      tableName: "TokenBlacklist",
      timestamps: true,
    }
  );
  TokenBlacklist.associate = (models) => {
    TokenBlacklist.belongsTo(models.Actor_model, {
      foreignKey: "Actor_id",
      targetKey: "id",
      as: "actor",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };
  return TokenBlacklist;
};
