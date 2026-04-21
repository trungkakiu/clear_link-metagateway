export default (sequelize, DataTypes) => {
  const Notification = sequelize.define(
    "Notification",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      Owner_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      Actor_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      banner: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      isSystemNotification: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      target_actor: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      noitfi_level: {
        type: DataTypes.ENUM("1", "2", "3", "4", "5"),
        defaultValue: "1",
      },
      linkToAction: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("seen", "unread", "delete", "can't_send"),
        defaultValue: "unread",
      },
      message: { type: DataTypes.STRING, allowNull: true },
    },
    {
      tableName: "Notification",
      timestamps: true,
      underscored: false,
    },
  );

  Notification.associate = (models) => {};

  return Notification;
};
