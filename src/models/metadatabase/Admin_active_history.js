export default (sequelize, DataTypes) => {
  const Admin_active_history = sequelize.define(
    "Admin_active_history",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      User_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      Admin_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      Mail: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      OTP: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      Message: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("invalid", "valid", "done", "pending", "expired"),
        allowNull: true,
      },
      node_target_address: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "Địa chỉ node mục tiêu cho hành động quản trị",
      },
      type: {
        type: DataTypes.ENUM(
          "system",
          "otp-check",
          "config",
          "user_action",
          "reset_password",
        ),
        allowNull: false,
      },
      challenge_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "Admin_active_history",
      timestamps: true,
      underscored: false,
    },
  );

  Admin_active_history.associate = (models) => {
    Admin_active_history.belongsTo(models.Actor_model, {
      foreignKey: "Admin_id",
      targetKey: "id",
      as: "admin_info",
    });
  };

  return Admin_active_history;
};
