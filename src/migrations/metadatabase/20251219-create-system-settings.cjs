"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    /**
     * Nếu bảng đã tồn tại → ALTER
     * Nếu chưa tồn tại → CREATE
     */

    const tableExists = await queryInterface
      .describeTable("System_Settings")
      .then(() => true)
      .catch(() => false);

    if (!tableExists) {
      await queryInterface.createTable("System_Settings", {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },

        key: {
          type: Sequelize.STRING,
          allowNull: false,
          unique: true,
        },

        title: {
          type: Sequelize.TEXT,
          allowNull: false,
        },

        danger: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },

        description: {
          type: Sequelize.STRING,
          allowNull: true,
        },

        impact: {
          type: Sequelize.STRING,
          allowNull: true,
        },

        enabled: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
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
    } else {
      /**
       * ALTER TABLE – chuẩn hóa cấu trúc
       */

      const table = await queryInterface.describeTable("System_Settings");

      if (!table.title) {
        await queryInterface.addColumn("System_Settings", "title", {
          type: Sequelize.TEXT,
          allowNull: false,
          defaultValue: "",
        });
      }

      if (!table.danger) {
        await queryInterface.addColumn("System_Settings", "danger", {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        });
      }

      if (!table.description) {
        await queryInterface.addColumn("System_Settings", "description", {
          type: Sequelize.STRING,
          allowNull: true,
        });
      }

      if (!table.impact) {
        await queryInterface.addColumn("System_Settings", "impact", {
          type: Sequelize.STRING,
          allowNull: true,
        });
      }

      if (!table.enabled) {
        await queryInterface.addColumn("System_Settings", "enabled", {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        });
      }

      /**
       * OPTIONAL: dọn rác cột cũ
       * Chỉ bật nếu anh chắc chắn không dùng nữa
       */
      if (table.value) {
        await queryInterface.removeColumn("System_Settings", "value");
      }

      if (table.type) {
        await queryInterface.removeColumn("System_Settings", "type");
      }
    }
  },

  async down(queryInterface, Sequelize) {

    await queryInterface.dropTable("System_Settings");
  },
};
