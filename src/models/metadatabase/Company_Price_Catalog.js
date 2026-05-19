"use strict";

export default (sequelize, DataTypes) => {
  const Company_Price_Catalog = sequelize.define(
    "Company_Price_Catalog",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },

      company_id: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: "Mã định danh của Đại lý/Nhà phân phối",
      },

      product_metadata_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: "Trỏ về bảng Product_Metadata",
      },

      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: "Số lượng sản phẩm tương ứng với giá bán",
      },

      sale_price: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: "Giá bán ra cho khách hàng",
      },

      description: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "Mô tả thêm về giá bán (nếu cần)",
      },

      currency: {
        type: DataTypes.STRING,
        defaultValue: "VND",
      },

      status: {
        type: DataTypes.ENUM("active", "inactive"),
        defaultValue: "active",
        comment: "Trạng thái hiển thị trên POS",
      },
    },
    {
      tableName: "Company_Price_Catalog",
      timestamps: true,
      indexes: [
        {
          unique: true,
          name: "unique_company_product_price",
          fields: ["company_id", "product_metadata_id"],
        },
      ],
    },
  );

  Company_Price_Catalog.associate = (models) => {
    Company_Price_Catalog.belongsTo(models.Product_Metadata, {
      foreignKey: "product_metadata_id",
      as: "product_info",
    });
  };

  return Company_Price_Catalog;
};
