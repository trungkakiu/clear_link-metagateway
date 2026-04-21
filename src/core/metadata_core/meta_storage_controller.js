import { Op } from "sequelize";

const getFullWarehouse = (db) => async (req, res) => {
  try {
    const { company_id } = req.user;

    const data = await db.Warehouse.findAll({
      where: { author: company_id },
      include: [
        {
          model: db.Warehouse_Zones,
          as: "zones",
          include: [
            {
              model: db.Warehouse_Racks,
              as: "Racks",
              include: [
                {
                  model: db.Warehouse_Slots,
                  as: "slots",
                  include: [
                    {
                      model: db.Stock_Inventory,
                      as: "inventory",
                      include: [
                        {
                          model: db.Product,
                          as: "product_info",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              model: db.Warehouse_Slots,
              as: "Slots",
              where: {
                rack_id: { [Op.is]: null },
              },
              required: false,
              include: [
                {
                  model: db.Stock_Inventory,
                  as: "inventory",
                  include: [{ model: db.Product, as: "product_info" }],
                },
              ],
            },
          ],
        },
      ],
    });

    return res.status(200).json({ RC: 200, RD: data });
  } catch (error) {
    return res.status(500).json({ RC: 500, RM: error.message });
  }
};

const addZone = (db) => async (req, res) => {
  try {
    let { warehouse_id, zone_name, is_expirable, storage_method, index } =
      req?.body?.zoneData;

    const warehouse = await db.Warehouse.findOne({
      where: { id: warehouse_id },
      include: [
        {
          model: db.Warehouse_Zones,
          as: "zones",
        },
      ],

      order: [[{ model: db.Warehouse_Zones, as: "zones" }, "index", "ASC"]],
    });

    if (!warehouse) {
      return res.status(404).json({ RC: 404, RM: "Không tìm thấy kho hàng!" });
    }

    const zones = warehouse.zones || [];
    if (zones.length === 0) {
      index = 1;
    } else {
      const lastZoneIndex = zones[zones.length - 1].index;

      if (!index || index <= lastZoneIndex) {
        index = lastZoneIndex + 1;
      }
    }

    const newZone = await db.Warehouse_Zones.create({
      warehouse_id,
      zone_name,
      index,
      is_expirable,
      storage_method,
      status: "active",
    });

    return res.status(201).json({
      RC: 200,
      RM: "Khởi tạo Khu vực thành công!",
      RD: newZone,
    });
  } catch (error) {
    console.error(">>> [ERROR] addZone:", error);
    return res.status(500).json({
      RC: 500,
      RM: "Lỗi hệ thống khi thêm Zone!",
      RE: error.message,
    });
  }
};

const addRack = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const {
      zone_id,
      rack_code,
      rack_type,
      num_levels,
      num_slots_per_level,
      max_weight,
    } = req.body?.rackData;

    let maximum_weight = max_weight * num_levels;
    const rack = await db.Warehouse_Racks.create(
      {
        zone_id,
        rack_code,
        rack_type,
        num_levels,
        num_slots_per_level,
        maximum_weight,
      },
      { transaction: t },
    );

    const slots = [];
    for (let l = 1; l <= num_levels; l++) {
      for (let s = 1; s <= num_slots_per_level; s++) {
        slots.push({
          max_weight: max_weight,
          rack_id: rack.id,
          zone_id: zone_id,
          slot_code: `${rack_code}-L${l}-S${s}`,
          status: "EMPTY",
        });
      }
    }
    await db.Warehouse_Slots.bulkCreate(slots, { transaction: t });

    await t.commit();
    return res
      .status(201)
      .json({ RC: 200, RM: "Thêm dãy kệ và khởi tạo ô kệ thành công!" });
  } catch (error) {
    await t.rollback();
    console.error(error);
    return res.status(500).json({ RC: 500, RM: error.message });
  }
};

const deleteRack = (db) => async (req, res) => {
  try {
    const { rack_id } = req.params;

    // Kiểm tra xem trong kệ này có hàng không
    const hasStock = await db.Stock_Inventory.findOne({
      include: [
        {
          model: db.Warehouse_Slots,
          as: "location",
          where: { rack_id },
        },
      ],
    });

    if (hasStock) {
      return res
        .status(400)
        .json({ RC: 400, RM: "Không thể xóa kệ đang chứa hàng!" });
    }

    // Xóa Slots trước, xóa Rack sau
    await db.Warehouse_Slots.destroy({ where: { rack_id } });
    await db.Warehouse_Racks.destroy({ where: { id: rack_id } });

    return res.status(200).json({ RC: 200, RM: "Đã xóa dãy kệ thành công!" });
  } catch (error) {
    return res.status(500).json({ RC: 500, RM: error.message });
  }
};

const deleteZone = (db) => async (req, res) => {
  try {
    const { zone_id } = req.params;

    // Kiểm tra hàng hóa trong toàn bộ Zone
    const hasStock = await db.Stock_Inventory.findOne({
      include: [
        {
          model: db.Warehouse_Slots,
          as: "location",
          where: { zone_id },
        },
      ],
    });

    if (hasStock)
      return res
        .status(400)
        .json({ RC: 400, RM: "Khu vực vẫn còn hàng, không thể xóa!" });

    // Xóa dây chuyền: Slots -> Racks -> Zone
    await db.Warehouse_Slots.destroy({ where: { zone_id } });
    await db.Warehouse_Racks.destroy({ where: { zone_id } });
    await db.Warehouse_Zones.destroy({ where: { id: zone_id } });

    return res.status(200).json({ RC: 200, RM: "Xóa khu vực thành công!" });
  } catch (error) {
    return res.status(500).json({ RC: 500, RM: error.message });
  }
};

const addSlotsToRack = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { rack_id, num_slots_to_add, level } = req.body;

    const rack = await db.Warehouse_Racks.findByPk(rack_id);
    if (!rack) {
      return res
        .status(404)
        .json({ RC: 404, RM: "Không tìm thấy dãy kệ này!" });
    }

    const existingSlots = await db.Warehouse_Slots.findAll({
      where: { rack_id },
      attributes: ["slot_code"],
    });
    const existingCodes = existingSlots.map((s) => s.slot_code);

    const newSlots = [];
    let addedCount = 0;
    let slotIndex = 1;

    while (addedCount < num_slots_to_add) {
      const newCode = `${rack.rack_code}-L${level || rack.num_levels}-S${slotIndex}`;

      if (!existingCodes.includes(newCode)) {
        newSlots.push({
          rack_id: rack.id,
          zone_id: rack.zone_id,
          slot_code: newCode,
          status: "EMPTY",
          max_weight: 0,
          current_weight: 0,
        });
        addedCount++;
      }
      slotIndex++;
    }

    const createdSlots = await db.Warehouse_Slots.bulkCreate(newSlots, {
      transaction: t,
    });

    if (slotIndex - 1 > rack.num_slots_per_level) {
      await rack.update(
        { num_slots_per_level: slotIndex - 1 },
        { transaction: t },
      );
    }

    await t.commit();
    return res.status(201).json({
      RC: 200,
      RM: `Đã thêm thành công ${num_slots_to_add} ô kệ vào dãy ${rack.rack_code}`,
      RD: createdSlots,
    });
  } catch (error) {
    await t.rollback();
    console.error(">>> [ERROR] addSlotsToRack:", error);
    return res.status(500).json({ RC: 500, RM: error.message });
  }
};

const createWarehouse = (db) => async (req, res) => {
  try {
    const { warehouse_name, warehouse_type, type, location } =
      req.body.formdata;

    const author = req.user?.company_id;

    if (!warehouse_name || !warehouse_type || !author) {
      return res.status(400).json({
        RC: 400,
        RM: "Thiếu thông tin bắt buộc: Tên kho, loại hình hoặc người sở hữu!",
      });
    }

    const newWarehouse = await db.Warehouse.create({
      warehouse_name,
      warehouse_type,
      type: type || "dry",
      location: location || null,
      author: author,
      status: "active",
    });

    return res.status(200).json({
      RC: 200,
      RM: "Khởi tạo Nút Kho Hàng thành công!",
      RD: newWarehouse,
    });
  } catch (error) {
    console.error(">>> [BACKEND ERROR] createWarehouse:", error);

    return res.status(500).json({
      RC: 500,
      RM: "Lỗi hệ thống khi khởi tạo kho hàng!",
      RE: error.message,
    });
  }
};

export default {
  createWarehouse,
  getFullWarehouse,
  addZone,
  addRack,
  deleteRack,
  deleteZone,
  addSlotsToRack,
};
