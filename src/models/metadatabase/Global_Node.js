// src/models/global_node.js
export default (sequelize, DataTypes) => {
  const Global_Node = sequelize.define(
    "Global_Node",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        defaultValue: 1,
      },

      global_height: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },

      canonical_block_hash: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },

      previous_block_hash: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },

      last_commit_node: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      last_block_time: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      updated_from: {
        type: DataTypes.ENUM("push", "pull"),
        allowNull: false,
      },

      network_status: {
        type: DataTypes.ENUM("healthy", "degraded", "fork_risk"),
        allowNull: false,
        defaultValue: "healthy",
      },
    },
    {
      tableName: "Global_Node",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      underscored: true,
    },
  );

  return Global_Node;
};
