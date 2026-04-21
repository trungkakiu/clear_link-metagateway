export default (sequelize, DataTypes) => {
  const Pinned_Products = sequelize.define(
    "Pinned_Products",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      product_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      owner_id: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: "ID nhà sản xuất gốc (Người đi thuê)",
      },
      total_price: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      payment_method: {
        type: DataTypes.ENUM(
          "COD",
          "BANK",
          "DEPOSIT_50",
          "DEPOSIT_40",
          "DEPOSIT_60",
          "DEPOSIT_70",
        ),
        defaultValue: "COD",
        allowNull: false,
      },
      payment_code: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true,
        comment: "Mã nội dung chuyển khoản (Ví dụ: PIN12345)",
      },
      debt: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      payment_status: {
        type: DataTypes.ENUM(
          "BANK_awaiting_payment",
          "BANK_partially_payment",
          "partially_paid",
          "deposit",
          "COD_wait",
          "complated",
          "rejected",
          "return",
          "no_set",
        ),
        defaultValue: "no_set",
        allowNull: false,
      },
      amount_received: {
        type: DataTypes.DECIMAL(20, 2),
        defaultValue: 0,
      },
      amount_remaining: {
        type: DataTypes.DECIMAL(20, 2),
        defaultValue: 0,
      },
      is_OEM: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      Quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      Start_date: {
        type: DataTypes.DATE,
      },
      End_date: {
        type: DataTypes.DATE,
      },
      pinner_id: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: "ID xưởng nhận việc (Đối tác)",
      },
      pinner_role: {
        type: DataTypes.ENUM(
          "manufacturer",
          "distributor",
          "retailer",
          "transporter",
        ),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(
          "active",
          "inactive",
          "removed",
          "payment_process",
          "pending",
          "rejected",
          "partially_completed",
          "shipping_all",
          "partially_shipping",
          "ready_to_pick_all",
          "partially_ready",
          "currently_in_production",
          "under_censorship",
          "completed",
        ),
        defaultValue: "pending",
      },
      minimum_payment_to_start: {
        type: DataTypes.DECIMAL(20, 2),
        defaultValue: 0,
      },
      Product_batch: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      Company_Collaboration: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "Pinned_Products",
      timestamps: true,
      underscored: false,
    },
  );

  Pinned_Products.associate = (models) => {
    Pinned_Products.belongsTo(models.Product, {
      foreignKey: "product_id",
      targetKey: "id",
      as: "product_pinner",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    Pinned_Products.hasMany(models.InspectionReports, {
      foreignKey: "order_id",
      as: "inspection_reports",
    });

    Pinned_Products.belongsTo(models.Manufacturer, {
      foreignKey: "owner_id",
      constraints: false,
      as: "owner_m",
    });
    Pinned_Products.belongsTo(models.Distributor, {
      foreignKey: "owner_id",
      constraints: false,
      as: "owner_d",
    });
    Pinned_Products.belongsTo(models.Retailer, {
      foreignKey: "owner_id",
      constraints: false,
      as: "owner_r",
    });
    Pinned_Products.belongsTo(models.Transporter, {
      foreignKey: "owner_id",
      constraints: false,
      as: "owner_t",
    });

    Pinned_Products.belongsTo(models.Manufacturer, {
      foreignKey: "pinner_id",
      constraints: false,
      as: "pinner_m",
    });
    Pinned_Products.belongsTo(models.Distributor, {
      foreignKey: "pinner_id",
      constraints: false,
      as: "pinner_d",
    });
    Pinned_Products.belongsTo(models.Retailer, {
      foreignKey: "pinner_id",
      constraints: false,
      as: "pinner_r",
    });
    Pinned_Products.belongsTo(models.Transporter, {
      foreignKey: "pinner_id",
      constraints: false,
      as: "pinner_t",
    });
    Pinned_Products.hasMany(models.product_batch, {
      foreignKey: "Order_owner",
      constraints: true,
      as: "batchs",
    });
    Pinned_Products.hasMany(models.payment_sessions, {
      foreignKey: "order_id",
      constraints: true,
      as: "bills",
    });
  };

  return Pinned_Products;
};
