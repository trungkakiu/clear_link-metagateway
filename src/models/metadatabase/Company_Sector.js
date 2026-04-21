export default (sequelize, DataTypes) => {
  const Company_Sector = sequelize.define(
    "Company_Sector",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      // ID của doanh nghiệp (Lấy từ bảng tương ứng)
      company_id: {
        type: DataTypes.STRING,
        allowNull: false,
        // BỎ references ở đây vì ID này có thể thuộc về 4 bảng khác nhau
      },
      // Phân loại: 'manufacturer', 'distributor', 'retailer', 'transporter'
      company_type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      sector_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Production_Sectors",
          key: "id",
        },
      },
      is_main_sector: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    },
    {
      tableName: "Company_Sector",
      timestamps: true,
    },
  );

  return Company_Sector;
};
