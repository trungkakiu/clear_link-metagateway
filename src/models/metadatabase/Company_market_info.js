export default (sequelize, DataTypes) => {
  const Company_market_info = sequelize.define(
    "Company_market_info",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      company_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      company_type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      slug: {
        type: DataTypes.STRING,
        // unique: true,
        allowNull: false,
        comment: "Đường dẫn định danh: market/cong-ty-a",
      },
      slogan: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Giới thiệu chi tiết doanh nghiệp",
      },
      logo_url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      banner_url: {
        type: DataTypes.STRING,
        allow_Null: true,
      },
      social_links: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: { website: "", linkedin: "", facebook: "" },
      },
      gallery: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
      },
      rating_avg: {
        type: DataTypes.FLOAT,
        defaultValue: 5.0,
      },
      total_deals: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "Tổng số hợp đồng đã thực hiện trên sàn",
      },
      is_active_market: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Cho phép hiển thị trên Marketplace hay ẩn đi",
      },
      is_oem_ready: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Có nhận sản xuất/gia công theo yêu cầu không",
      },
    },
    {
      tableName: "Company_market_info",
      timestamps: true,
    },
  );
  Company_market_info.associate = (models) => {
    Company_market_info.belongsTo(models.Manufacturer, {
      foreignKey: "company_id",
      constraints: false,
      as: "manufacturer_info",
    });

    Company_market_info.belongsTo(models.Distributor, {
      foreignKey: "company_id",
      constraints: false,
      as: "distributor_info",
    });

    Company_market_info.belongsTo(models.Retailer, {
      foreignKey: "company_id",
      constraints: false,
      as: "retailer_info",
    });

    Company_market_info.belongsTo(models.Transporter, {
      foreignKey: "company_id",
      constraints: false,
      as: "transporter_info",
    });
  };
  return Company_market_info;
};
