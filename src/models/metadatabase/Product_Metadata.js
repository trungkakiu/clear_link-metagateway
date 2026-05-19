export default (sequelize, DataTypes) => {
  const Product_Metadata = sequelize.define(
    "Product_Metadata",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true, // ID riêng cho từng phiên bản
      },
      product_id: {
        type: DataTypes.STRING,
        allowNull: false, // Trỏ về Master
      },
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1, // v1, v2, v3...
      },
      is_latest: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      // --- CÁC TRƯỜNG DỮ LIỆU ĐƯỢC SNAPSHOT ---
      name: { type: DataTypes.STRING },
      price: { type: DataTypes.INTEGER },
      description: { type: DataTypes.STRING },
      main_cardimage: { type: DataTypes.STRING },
      weight: { type: DataTypes.DECIMAL(10, 2) },
      weight_type: { type: DataTypes.ENUM("kilogam", "gam", "ton") },
      status: { type: DataTypes.STRING }, // Trạng thái kinh doanh của version này
      responsible_person: { type: DataTypes.STRING },
      OEMfile: { type: DataTypes.STRING },

      // BẢO CHỨNG BLOCKCHAIN
      txt_hash: {
        type: DataTypes.TEXT,
        comment: "Mã hash bảo chứng của riêng phiên bản này",
      },
      chain_status: {
        type: DataTypes.ENUM("active", "pending", "pairing", "down"),
        defaultValue: "pending",
      },
    },
    {
      tableName: "Product_Metadata",
      timestamps: true,
    },
  );

  Product_Metadata.associate = (models) => {
    Product_Metadata.belongsTo(models.Product, {
      foreignKey: "product_id",
      as: "master",
    });

    Product_Metadata.hasMany(models.product_batch, {
      foreignKey: "product_metadata_id",
      as: "batches",
    });

    Product_Metadata.hasMany(models.Item_image, {
      foreignKey: "parent_id",
      constraints: false,
      as: "sub_images",
    });
  };

  return Product_Metadata;
};
