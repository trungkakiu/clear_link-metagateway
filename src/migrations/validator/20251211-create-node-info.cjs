"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Node_Info", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      node_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      role: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "validator",
      },

      address: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      ip_address: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      public_key: {
        type: Sequelize.TEXT("long"),
        allowNull: false,
      },

      stake: {
        type: Sequelize.DOUBLE,
        allowNull: false,
        defaultValue: 0,
      },

      reputation_score: {
        type: Sequelize.DOUBLE,
        allowNull: false,
        defaultValue: 100,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "active",
      },

      node_type: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "user_validator",
      },

      block_height: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      ping_latency: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },

      network_speed: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },

      storage_usage: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },

      cpu_usage: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },

      memory_usage: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },

      last_active: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: Math.floor(Date.now() / 1000),
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("Node_Info");
  },
};
