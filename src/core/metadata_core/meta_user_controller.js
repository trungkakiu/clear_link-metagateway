const getUserDashbroad = (db) => async (req, res) => {
  try {
    const { company_id, id } = req?.user;
    const yourInfo = await db.Vehicle.findOne({
      where: {
        owner_id: company_id,
        driver_id: id,
      },
      include: [
        {
          model: db.shipping_order,
          as: "order",
          required: false,
          attributes: {
            exclude: [
              "product_total_price",
              "digital_signatures",
              "payment_method",
              "payment_status",
            ],
          },
        },
        {
          model: db.Fleet,
          through: { attributes: [] },
        },
      ],
    });

    return res.status(200).json({
      RM: "Thông tin của bạn!",
      RC: 200,
      RD: yourInfo,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RM: "Lỗi hệ thống!",
      RC: 500,
    });
  }
};

const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

const updatePos = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { lat, lng, order, vehicle_id } = req.body;

    if (!lat || !lng || !order || !vehicle_id) {
      if (t) await t.rollback();
      return res.status(400).json({
        RM: "Thiếu thông tin (tọa độ, đơn hàng hoặc ID xe)!",
        RC: 400,
      });
    }

    const currentOrder = await db.shipping_order.findByPk(order, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!currentOrder) {
      if (t) await t.rollback();
      return res.status(404).json({ RM: "Không tìm thấy đơn hàng!", RC: 404 });
    }

    if (currentOrder.Driver_shiping_status === "not_start") {
      if (t) await t.rollback();
      return res.status(200).json({
        RM: "Vận đơn chưa ở trạng thái vận chuyển!",
        RC: 201,
      });
    }

    const currentLocations = { ...currentOrder.fleet_current_locations };
    const fleet_status = { ...currentOrder.fleet_status };
    if (fleet_status[vehicle_id] !== "delivering") {
      if (t) await t.rollback();
      return res.status(400).json({
        RM: "Xe chưa bắt đầu đơn hàng!",
        RC: 400,
      });
    }

    currentLocations[vehicle_id] = {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      updatedAt: new Date().toISOString(),
    };

    const routeHistories = { ...currentOrder.fleet_route_histories };
    let vehicleHistory = Array.isArray(routeHistories[vehicle_id])
      ? [...routeHistories[vehicle_id]]
      : [];

    const newLat = parseFloat(lat);
    const newLng = parseFloat(lng);
    const nowISO = new Date().toISOString();

    if (vehicleHistory.length > 0) {
      const lastPoint = vehicleHistory[vehicleHistory.length - 1];
      const dist = getDistance(lastPoint.lat, lastPoint.lng, newLat, newLng);

      if (dist < 20) {
        lastPoint.time = nowISO;
      } else {
        vehicleHistory.push({ lat: newLat, lng: newLng, time: nowISO });
      }
    } else {
      vehicleHistory.push({ lat: newLat, lng: newLng, time: nowISO });
    }

    routeHistories[vehicle_id] = vehicleHistory;

    await currentOrder.update(
      {
        fleet_current_locations: currentLocations,
        fleet_route_histories: routeHistories,
        Location_last_update: new Date(),
      },
      { transaction: t },
    );

    await t.commit();
    return res
      .status(200)
      .json({ RM: "Cập nhật vị trí đội xe thành công!", RC: 200 });
  } catch (error) {
    if (t) await t.rollback();
    console.error(">>> [GPS UPDATE ERR]:", error);
    return res.status(500).json({ RM: "Lỗi hệ thống!", RC: 500 });
  }
};

const userUpdatefcm_token = (db) => async (req, res) => {
  try {
    const { fcm_token } = req.body;
    const { id } = req?.user;
    if (!fcm_token) {
      return res.status(400).json({
        RM: "Thiếu thông tin!",
        RC: 400,
      });
    }
    const user = await db.Actor_model.findByPk(id);
    if (!user) {
      return res.status(404).json({
        RM: "Không tìm thấy người dùng!",
        RC: 404,
      });
    }
    await user.update({ fcm_token });
    return res.status(200).json({
      RM: "Cập nhật fcm_token thành công!",
      RC: 200,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RM: "Lỗi hệ thống!",
      RC: 500,
    });
  }
};

export default {
  updatePos,
  userUpdatefcm_token,
  getUserDashbroad,
};
