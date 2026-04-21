import { type } from "os";

export default (sequelize, DataTypes) => {
  const ProductionStaff = sequelize.define(
    "ProductionStaff",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
      },
      address: {
        type: DataTypes.STRING,
      },
      CCCD: {
        type: DataTypes.STRING,
      },
      avatar: {
        type: DataTypes.STRING,
      },
      contract_file: {
        type: DataTypes.STRING,
      },
      profile_file: {
        type: DataTypes.STRING,
      },
      email: {
        type: DataTypes.STRING,
      },
      phonenumber: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      Company_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      banking_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      banking_brand: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      role: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      department_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      actor_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM(
          "working",
          "on_leave",
          "quit_job",
          "ban",
          "pending",
        ),
        defaultValue: "working",
      },
    },
    {
      tableName: "ProductionStaff",
      timestamps: true,
    },
  );
  ProductionStaff.associate = (models) => {
    ProductionStaff.belongsTo(models.Department, {
      foreignKey: "department_id",
      targetKey: "id",
      as: "department",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    ProductionStaff.hasOne(models.Department, {
      foreignKey: "leader_id",
      sourceKey: "id",
      as: "leaderDepartment",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    ProductionStaff.belongsTo(models.Actor_model, {
      foreignKey: "actor_id",
      targetKey: "id",
      as: "actor_info",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };
  return ProductionStaff;
};
