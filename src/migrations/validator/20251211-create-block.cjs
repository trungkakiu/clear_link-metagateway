"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Block", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      Height: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      Hash: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      PreviousHash: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      current_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      Timestamp: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      MerkleRoot: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      Creator: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      Owner_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      ValidatorSignature: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      original_value: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      Version: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal(
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
        ),
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("Block");
  },
};
