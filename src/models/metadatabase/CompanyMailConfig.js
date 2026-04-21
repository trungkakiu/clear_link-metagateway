export default (sequelize, DataTypes) => {
  const CompanyMailConfig = sequelize.define(
    "CompanyMailConfig",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },

      company_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      from_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      from_email: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      reply_to: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      smtp_host: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      smtp_port: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      smtp_secure: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      smtp_username: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      smtp_password_encrypted: {
        type: DataTypes.TEXT,
        allowNull: false,
      },

      provider: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },

      verified_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      last_test_status: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      last_test_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "company_mail_config",
      timestamps: true,
      underscored: true,
    },
  );

  return CompanyMailConfig;
};
