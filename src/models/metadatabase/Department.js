import { type } from "os";

export default (sequelize, DataTypes) => {
  const Department = sequelize.define(
    "Department",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      Company_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      role_level: {
        type: DataTypes.ENUM(
          "level_1",
          "level_2",
          "level_3",
          "level_4",
          "level_5",
        ),
        defaultValue: "level_1",
      },
      partname: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      isExcute: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      isRead: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      leader_id: {
        type: DataTypes.STRING,
      },
      part: {
        type: DataTypes.STRING,
        defaultValue: true,
      },
      active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "Department",
      timestamps: true,
      underscored: false,
    },
  );

  Department.associate = (models) => {
    Department.hasMany(models.Company_account_level, {
      foreignKey: "Department",
      sourceKey: "id",
      as: "Department",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Department.hasMany(models.ProductionStaff, {
      foreignKey: "department_id",
      sourceKey: "id",
      as: "staffs",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Department.belongsTo(models.ProductionStaff, {
      foreignKey: "leader_id",
      targetKey: "id",
      as: "leader",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Department.hasMany(models.product_batch, {
      foreignKey: "Department_id",
      sourceKey: "id",
      as: "batches",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  };

  return Department;
};
