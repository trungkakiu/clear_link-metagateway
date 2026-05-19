export default (sequelize, DataTypes) => {
  const Fleet = sequelize.define(
    "Fleet",
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      transporter_id: { type: DataTypes.STRING, allowNull: false },
      fleet_name: { type: DataTypes.STRING, allowNull: false },
      fleet_code: { type: DataTypes.STRING, allowNull: false },
      manager_name: { type: DataTypes.STRING, allowNull: false },
      manager_phone: { type: DataTypes.STRING, allowNull: true },
      operation_area: { type: DataTypes.JSON, allowNull: true },
      status: {
        type: DataTypes.ENUM("active", "inactive", "maintenance"),
        defaultValue: "active",
      },
      fleet_type: {
        type: DataTypes.ENUM(
          "dry_cargo",
          "cold_chain",
          "container",
          "express",
          "special",
        ),
        defaultValue: "dry_cargo",
        comment: "Loại đội xe: Hàng khô, hàng lạnh, container, giao nhanh...",
      },

      fuel_norm_average: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "Định mức tiêu hao xăng dầu trung bình (Lít/100km)",
      },

      monthly_budget: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        comment: "Ngân sách hoạt động tối đa mỗi tháng của đội",
      },

      manager_id: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "ID tài khoản của trưởng đội xe",
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Mô tả nhiệm vụ hoặc mục tiêu của đội xe",
      },
    },
    {
      tableName: "Fleet",
      timestamps: true,
      indexes: [
        {
          name: "idx_fleet_code_unique",
          unique: true,
          fields: ["fleet_code"],
        },
        {
          name: "idx_fleet_transporter_id",
          fields: ["transporter_id"],
        },
      ],
    },
  );

  Fleet.associate = (models) => {
    Fleet.belongsTo(models.Transporter, { foreignKey: "transporter_id" });
    Fleet.belongsToMany(models.Vehicle, {
      through: "Fleet_Vehicle",
      foreignKey: "fleet_id",
    });
  };
  return Fleet;
};
