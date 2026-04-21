"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("CompanyMailConfig", {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },

      company_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      from_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      from_email: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      reply_to: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      smtp_host: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      smtp_port: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      smtp_secure: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },

      smtp_username: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      smtp_password_encrypted: {
        type: Sequelize.TEXT,
        allowNull: false,
      },

      provider: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },

      verified_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      last_test_status: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      last_test_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },

      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("CompanyMailConfig");
  },
};
