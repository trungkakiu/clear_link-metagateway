export default (sequelize, DataTypes) => {
  const product_batch = sequelize.define(
    "product_batch",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      batch_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      Department_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      product_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      author: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      manufacture_date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      expiry_date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      isOEM: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      QC_Pass: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      QC_Failed: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      Order_owner: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      parent_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      is_supplement: {
        type: DataTypes.BOOLEAN,
      },
      Product_box_model: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "Product_Packaging",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      status: {
        type: DataTypes.ENUM(
          "completed",
          "in_progress",
          "not_completed",
          "pending",
          "pairing",
          "QC_checking",
          "QC_passed",
          "QC_failed",
          "stop_production",
          "cancelled",
        ),
        defaultValue: "in_progress",
        allowNull: false,
      },

      Shiping_status: {
        type: DataTypes.ENUM(
          "completed",
          "in_progress",
          "not_completed",
          "pending",
          "ready",
          "cancelled",
          "return",
          "no_set",
        ),
        defaultValue: "no_set",
        allowNull: false,
      },
      progress_quantity: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      qc_staff_id: {
        type: DataTypes.STRING,
        allowValue: true,
      },
      qc_manager_id: {
        type: DataTypes.STRING,
        allowValue: true,
      },
      total_box: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      is_boxed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      shipping_order_id: {
        type: DataTypes.STRING,
        allowValue: true,
      },
      total_price: {
        type: DataTypes.DECIMAL(20, 3),
        allowNull: true,
      },
      shiping_batch_id: {
        type: DataTypes.STRING,
        allowValue: true,
      },
      total_pallet: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      weight_per_unit: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "Khối lượng trên mỗi đơn vị sản phẩm (kg)",
      },
      total_weight: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "Tổng khối lượng cả lô (kg) - Tự động tính",
      },
      length: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "Chiều dài kiện hàng/lô hàng (m)",
      },
      width: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "Chiều rộng kiện hàng/lô hàng (m)",
      },
      height: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "Chiều cao kiện hàng/lô hàng (m)",
      },
      total_cbm: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "Tổng thể tích chiếm dụng (m3)",
      },
      is_independent: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Đánh dấu đây là hàng tự do, không theo Pinned Order",
      },
      payment_status: {
        type: DataTypes.ENUM(
          "banking_wait",
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
      payment_content: {
        type: DataTypes.STRING,
        unique: true,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      tableName: "product_batch",
      timestamps: true,
      underscored: false,
      hooks: {
        beforeSave: async (batch, options) => {
          await calculateTotalPrice(batch, sequelize.models);
        },
        afterUpdate: async (batch, options) => {
          if (batch.changed("Shiping_status") || batch.changed("status")) {
            await syncPinnedProductStatus(batch, sequelize.models);
          }
        },

        afterCreate: async (batch, options) => {
          await syncPinnedProductStatus(batch, sequelize.models);
        },
      },
    },
  );

  product_batch.associate = (models) => {
    product_batch.belongsTo(models.Actor_model, {
      foreignKey: "qc_staff_id",
      targetKey: "id",
      as: "QC",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    product_batch.belongsTo(models.Product_Packaging, {
      foreignKey: "Product_box_model",
      targetKey: "id",
      as: "boxed",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    product_batch.belongsTo(models.shipping_order, {
      foreignKey: "shipping_order_id",
      targetKey: "id",
      as: "Order_batches",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    product_batch.belongsTo(models.Actor_model, {
      foreignKey: "qc_manager_id",
      targetKey: "id",
      as: "QC_manager",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    product_batch.belongsTo(models.Department, {
      foreignKey: "Department_id",
      targetKey: "id",
      as: "Department",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    product_batch.belongsTo(models.Product, {
      foreignKey: "product_id",
      targetKey: "id",
      as: "product",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    product_batch.belongsTo(models.Manufacturer, {
      foreignKey: "author",
      targetKey: "id",
      as: "Manufacture_manager",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    product_batch.belongsTo(models.Pinned_Products, {
      foreignKey: "Order_owner",
      targetKey: "id",
      as: "Pinned_order",
    });
    product_batch.hasMany(models.QrRegistry, {
      foreignKey: "target_id",
      targetKey: "id",
      as: "Qr_codes",
    });
  };

  return product_batch;
};

async function calculateTotalPrice(batch, models) {
  try {
    const qcPass = parseInt(batch.QC_Pass) || 0;
    const quantity = parseInt(batch.quantity) || 0;

    const product = await models.Product.findByPk(batch.product_id);
    if (product && product.price) {
      const unitPrice = parseFloat(product.price) || 0;
      batch.total_price = unitPrice * qcPass;
    }

    if (batch.weight_per_unit) {
      const weightPerUnit = parseFloat(batch.weight_per_unit) || 0;
      batch.total_weight = weightPerUnit * quantity;
    }
  } catch (error) {
    console.error("Lỗi khi tính total_price trong Hook:", error);
  }
}

async function syncPinnedProductStatus(batch, models) {
  try {
    const orderOwnerId = batch.Order_owner;
    if (!orderOwnerId) return;

    const allBatches = await models.product_batch.findAll({
      where: { Order_owner: orderOwnerId },
    });

    const total = allBatches.length;
    if (total === 0) return;

    const countDone = allBatches.filter(
      (b) => b.Shiping_status === "completed",
    ).length;
    const countShipping = allBatches.filter(
      (b) => b.Shiping_status === "in_progress",
    ).length;
    const countReady = allBatches.filter(
      (b) => b.Shiping_status === "ready",
    ).length;
    const countQC = allBatches.filter((b) => b.status === "QC_checking").length;
    const countProduction = allBatches.filter(
      (b) => b.status === "in_progress",
    ).length;

    const pinnedOrder = await models.Pinned_Products.findByPk(orderOwnerId);
    if (!pinnedOrder) return;

    let newStatus = pinnedOrder.status;

    if (countDone === total) {
      newStatus = "completed";
    } else if (countDone > 0) {
      newStatus = "partially_completed";
    } else if (countShipping === total) {
      newStatus = "shipping_all";
    } else if (countShipping > 0) {
      newStatus = "partially_shipping";
    } else if (countReady === total) {
      newStatus = "ready_to_pick_all";
    } else if (countReady > 0) {
      newStatus = "partially_ready";
    } else if (countProduction > 0) {
      newStatus = "currently_in_production";
    } else if (countQC > 0) {
      newStatus = "under_censorship";
    }

    if (newStatus !== pinnedOrder.status) {
      await pinnedOrder.update({ status: newStatus });
      console.log(
        `[TraceChain Logic] Order ${orderOwnerId}: ${countDone}/${total} batches done. Status -> ${newStatus}`,
      );
    }
  } catch (error) {
    console.error("Lỗi đồng bộ chi tiết:", error);
  }
}
