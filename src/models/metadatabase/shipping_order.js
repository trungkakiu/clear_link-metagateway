export default (sequelize, DataTypes) => {
  const shipping_order = sequelize.define(
    "shipping_order",
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      sender_id: { type: DataTypes.STRING, allowNull: false },
      customer_id: { type: DataTypes.STRING, allowNull: false },
      shipping_partner: { type: DataTypes.STRING },

      Date_of_request_for_loading: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      Date_of_request_for_delivery: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      Loading_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      Date_of_delivery: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      total_ship_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },

      distance: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      fleet_assignments: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: "Danh sách xe và tài xế: [ {vehicle_id,  driver_id}, ... ]",
      },

      fleet_current_locations: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment:
          "Cấu trúc: { 'VEHICLE_ID_1': { lat: 21.1, lng: 105.2, updatedAt: '...' }, ... }",
      },

      fleet_route_histories: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment:
          "Cấu trúc: { 'VEHICLE_ID_1': [ {lat: 21.1, lng: 105.2}, ... ], 'VEHICLE_ID_2': [...] }",
      },

      fleet_status: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment:
          "Cấu trúc: { 'VEHICLE_ID_1': 'delivering', 'VEHICLE_ID_2': 'delivered' }",
      },

      execution_type: {
        type: DataTypes.ENUM("Single", "Convoy", "Independent"),
        defaultValue: "Single",
      },

      product_total_price: {
        type: DataTypes.DECIMAL(13, 3),
        allowNull: true,
      },

      amount_ship_received: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      minimum_payment_to_start: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      sender_confirm: {
        type: DataTypes.ENUM("pending", "confirmed"),
        defaultValue: "pending",
      },
      receiver_confirm: {
        type: DataTypes.ENUM("pending", "accepted", "rejected"),
        defaultValue: "pending",
      },
      transporter_confirm: {
        type: DataTypes.ENUM("pending", "accepted", "rejected"),
        defaultValue: "pending",
      },
      status: {
        type: DataTypes.ENUM(
          "draft",
          "proposed",
          "ready_to_pick",
          "in_truck",
          "shipping",
          "outTruck",
          "delivered",
          "missing_product",
          "failed",
          "batch_fixed",
          "return",
          "cancelled",
          "pending_putaway",
          "completed",
        ),
        defaultValue: "draft",
      },
      digital_signatures: {
        type: DataTypes.JSON,
        defaultValue: { sender: null, receiver: null, transporter: null },
      },
      cost_per_km: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      payment_method: {
        type: DataTypes.ENUM("system_wallet", "prepaid", "cod", "deposit"),
        defaultValue: "prepaid",
      },
      deposit_ship_percent: {
        type: DataTypes.INTEGER,
        default: 0,
      },
      debt: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },

      payment_status: {
        type: DataTypes.ENUM(
          "unpaid",
          "pending",
          "paid",
          "refunded",
          "partially_paid",
          "complated",
          "",
        ),
        defaultValue: "unpaid",
      },

      shipping_payment_status: {
        type: DataTypes.ENUM(
          "unpaid",
          "pending",
          "paid",
          "refunded",
          "partially_paid",
          "complated",
          "",
        ),
        defaultValue: "unpaid",
      },

      type_delivery: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      type_capatry: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      target_lat: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true,
      },
      target_lng: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true,
      },
      target_add: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      start_lat: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true,
      },
      start_lng: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true,
      },
      start_add: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      total_weight: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        comment: "Tổng khối lượng cả lô (kg) - Tự động tính",
      },
      is_multivehicle: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Đánh dấu đơn hàng này có nhiều xe tham gia hay không",
      },
      vehicle_count: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        comment: "Số lượng xe được điều động",
      },
      execution_type: {
        type: DataTypes.ENUM("single", "convoy", "independent"),
        defaultValue: "single",
        comment:
          "Cách thức di chuyển: single (1 xe), convoy (đi theo đoàn), independent (độc lập)",
      },
      total_quantity: { type: DataTypes.INTEGER, defaultValue: 0 },
      delivery_address: { type: DataTypes.TEXT, allowNull: false },
      Delivery_completed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      Driver_shiping_status: {
        type: DataTypes.ENUM(
          "not_start",
          "partial_ship_start",
          "arrived",
          "partial_arrived",
          "all_ship_start",
          "picking",
          "partial_picking",
          "take_out",
          "partial_take_out",
          "delivering",
          "arrived_arriver",
          "partial_arrived_arriver",
          "partial_delivering",
          "delivered",
          "partial_delivered",
          "return",
          "partial_return",
        ),
        defaultValue: "not_start",
      },
      Location_last_update: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
        comment: "Thời điểm cuối cùng cập nhật vị trí",
      },
      onchain_status: {
        type: DataTypes.ENUM(
          "agreement_pending",
          "agreement_hashed",
          "pairing",
          "pickup_verified",
          "delivery_signed",
          "completed",
          "order_return",
          "batch_fix",
          "failed",
        ),
        defaultValue: "agreement_pending",
      },
      hash_agreement: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "mã bảo chứng chain",
      },
      hash_transit: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "mã bảo chứng chain",
      },
      hash_delivered: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "mã bảo chứng chain",
      },
      hash_completed: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "mã bảo chứng chain",
      },
    },
    {
      tableName: "shipping_order",
      timestamps: true,
      hooks: {
        beforeUpdate: (order, options) => {
          if (
            order.changed("receiver_confirm") ||
            order.changed("transporter_confirm") ||
            order.changed("sender_confirm")
          ) {
            if (
              order.sender_confirm === "confirmed" &&
              order.receiver_confirm === "accepted" &&
              order.transporter_confirm === "accepted"
            ) {
              order.status = "proposed";
              order.onchain_status = "agreement_pending";
            }
          }

          if (order.changed("fleet_status")) {
            const fleetStatusObj = order.fleet_status || {};
            const statuses = Object.values(fleetStatusObj);
            const total = statuses.length;

            if (total > 0) {
              const STATUS_WEIGHTS = {
                not_start: 0,
                ship_start: 1,
                arrived: 2,
                picking: 3,
                delivering: 4,
                arrived_arriver: 5,
                take_out: 6,
                delivered: 7,
                return: 8,
              };

              if (order.changed("fleet_status")) {
                const fleetObj = order.fleet_status || {};
                const fleetValues = Object.values(fleetObj);
                const totalVehicles = fleetValues.length;

                if (totalVehicles > 0) {
                  const weights = fleetValues.map(
                    (s) => STATUS_WEIGHTS[s] || 0,
                  );
                  const minW = Math.min(...weights);
                  const maxW = Math.max(...weights);

                  const isAllSync = fleetValues.every(
                    (s) => STATUS_WEIGHTS[s] === maxW,
                  );

                  switch (maxW) {
                    case 1:
                      order.Driver_shiping_status = isAllSync
                        ? "all_ship_start"
                        : "partial_ship_start";
                      break;
                    case 2:
                      order.Driver_shiping_status = isAllSync
                        ? "arrived"
                        : "partial_arrived";
                      break;
                    case 3:
                      order.Driver_shiping_status = isAllSync
                        ? "picking"
                        : "partial_picking";
                      break;
                    case 5:
                      order.Driver_shiping_status = isAllSync
                        ? "arrived_arriver"
                        : "partial_arrived_arriver";
                      break;
                    case 6:
                      order.Driver_shiping_status = isAllSync
                        ? "take_out"
                        : "partial_take_out";
                      break;
                    case 4:
                      order.Driver_shiping_status = isAllSync
                        ? "delivering"
                        : "partial_delivering";
                      break;
                    case 6:
                      order.Driver_shiping_status = isAllSync
                        ? "delivered"
                        : "partial_delivered";
                      break;
                    case 7:
                      order.Driver_shiping_status = isAllSync
                        ? "return"
                        : "partial_return";
                      break;
                    default:
                      order.Driver_shiping_status = "not_start";
                  }

                  const oldMilestone = order.status;

                  if (minW === 2) order.status = "in_truck";
                  else if (minW === 4) order.status = "shipping";
                  else if (minW === 6) order.status = "outTruck";
                  else if (minW === 7) order.status = "delivered";

                  if (order.status !== oldMilestone) {
                    console.log(
                      `>>> [MILESTONE REACHED]: ${order.status}. Auto-Pushing to Blockchain...`,
                    );
                  }
                }
              }
            }
          }
        },
      },
    },
  );

  shipping_order.associate = (models) => {
    shipping_order.hasMany(models.product_batch, {
      foreignKey: "shipping_order_id",
      as: "batches",
    });
    shipping_order.hasMany(models.Vehicle, {
      foreignKey: "order_now",
      as: "shipping_vehicle",
    });
    shipping_order.hasOne(models.InspectionReports, {
      foreignKey: "shiping_id",
      as: "inspection_report",
    });
    shipping_order.belongsTo(models.Manufacturer, {
      foreignKey: "sender_id",
      as: "sender_m",
      constraints: false,
    });
    shipping_order.belongsTo(models.Distributor, {
      foreignKey: "sender_id",
      as: "sender_d",
      constraints: false,
    });
    shipping_order.belongsTo(models.Retailer, {
      foreignKey: "sender_id",
      as: "sender_r",
      constraints: false,
    });
    shipping_order.belongsTo(models.Manufacturer, {
      foreignKey: "customer_id",
      as: "receiver_m",
      constraints: false,
    });
    shipping_order.belongsTo(models.Distributor, {
      foreignKey: "customer_id",
      as: "receiver_d",
      constraints: false,
    });
    shipping_order.belongsTo(models.Retailer, {
      foreignKey: "customer_id",
      as: "receiver_r",
      constraints: false,
    });
    shipping_order.belongsTo(models.Transporter, {
      foreignKey: "shipping_partner",
      as: "shipper_data",
      constraints: true,
    });
    shipping_order.hasOne(models.payment_sessions, {
      foreignKey: "ship_id",
      as: "Ship_pay_bill",
      constraints: true,
    });
  };

  return shipping_order;
};
