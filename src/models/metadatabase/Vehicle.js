export default (sequelize, DataTypes) => {
  const Vehicle = sequelize.define(
    "Vehicle",
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      owner_id: { type: DataTypes.STRING, allowNull: false },
      plate_number: { type: DataTypes.STRING, allowNull: false },
      vin_number: { type: DataTypes.STRING, allowNull: true },
      vehicle_type: { type: DataTypes.STRING, allowNull: true },
      capacity: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      capacity_unit: {
        type: DataTypes.ENUM("kg", "ton", "m3"),
        defaultValue: "kg",
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      length: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "Chiều dài lòng thùng (m)",
      },
      width: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "Chiều rộng lòng thùng (m)",
      },
      height: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "Chiều cao lòng thùng (m)",
      },
      max_cbm: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "Tổng thể tích thùng (m3) - Tự động tính L*W*H",
      },
      curb_weight: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "Khối lượng bản thân xe (xác xe) - kg",
      },
      gross_vehicle_weight: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "Trọng lượng toàn bộ cho phép (Hàng + Xe) - kg",
      },
      status: {
        type: DataTypes.ENUM(
          "available",
          "in_service",
          "under_maintenance",
          "booked",
        ),
        defaultValue: "available",
      },
      description_img: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      vehicle_category: {
        type: DataTypes.ENUM(
          "container",
          "tanker",
          "refrigerated",
          "truck_closed",
          "truck_open",
          "dump_truck",
          "passenger",
          "crane_truck",
          "flatbed",
        ),
        allowNull: false,
        defaultValue: "truck_closed",
        comment: "Phân loại công năng của xe",
      },
      order_now: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      },
      driver_id: { type: DataTypes.STRING, allowNull: true },
      last_maintenance: { type: DataTypes.DATE },
      next_maintenance: { type: DataTypes.DATE },
      vehicle_main_avatar: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      current_location_name: { type: DataTypes.STRING, allowNull: true },
      gps_tracking: { type: DataTypes.JSON, allowNull: true },
    },
    {
      tableName: "Vehicle",
      timestamps: true,
      indexes: [
        {
          unique: true,
          name: "unique_plate_number",
          fields: ["plate_number"],
        },
      ],
      hooks: {
        beforeSave: (vehicle) => {
          if (vehicle.length && vehicle.width && vehicle.height) {
            vehicle.max_cbm = (
              vehicle.length *
              vehicle.width *
              vehicle.height
            ).toFixed(2);
          }
        },
      },
    },
  );

  Vehicle.associate = (models) => {
    Vehicle.belongsTo(models.Transporter, {
      foreignKey: "owner_id",
      as: "Owner",
    });

    Vehicle.belongsToMany(models.Fleet, {
      through: "Fleet_Vehicle",
      foreignKey: "vehicle_id",
    });

    Vehicle.belongsTo(models.Actor_model, {
      as: "Driver",
      foreignKey: "driver_id",
      onDelete: "SET NULL",
    });

    Vehicle.hasMany(models.Item_image, {
      foreignKey: "parent_id",
      as: "sub_images",
      constraints: false,
      scope: {
        image_type: "vehicle",
      },
    });
    Vehicle.belongsTo(models.shipping_order, {
      foreignKey: "order_now",
      as: "order",
    });
  };
  return Vehicle;
};
