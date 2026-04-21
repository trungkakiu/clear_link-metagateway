export default (sequelize, DataTypes) => {
  const shipping_price_config = sequelize.define(
    "shipping_price_config",
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      config_name: { type: DataTypes.STRING, defaultValue: "BẢNG GIÁ TỔNG" },
      Author: { type: DataTypes.STRING },
      container_base_price: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
      tanker_base_price: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
      refrigerated_base_price: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0,
      },
      truck_closed_base_price: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0,
      },
      min_distance: {
        type: DataTypes.INTEGER,
        defaultValue: 5,
      },
      min_price: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0,
      },
      truck_open_base_price: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0,
      },
      dump_truck_base_price: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0,
      },
      passenger_base_price: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
      crane_truck_base_price: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0,
      },
      flatbed_base_price: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },

      general_fee: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
      electronics_fee: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
      food_beverage_fee: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
      chemicals_fee: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
      garment_fee: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
      medical_fee: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
      construction_fee: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },

      fuel_surcharge_percent: {
        type: DataTypes.DECIMAL(5, 2),
        defaultValue: 0,
        comment: "% Phụ phí xăng dầu",
      },
      tax_percent: { type: DataTypes.DECIMAL(5, 2), defaultValue: 10 },

      active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      tableName: "shipping_price_config",
      timestamps: true,
    },
  );
  shipping_price_config.associate = (models) => {
    shipping_price_config.belongsTo(models.Transporter, {
      foreignKey: "Author",
      as: "Shiping_price",
    });
  };

  return shipping_price_config;
};
