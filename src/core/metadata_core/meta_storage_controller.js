import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";

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

const confirmPutaway = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { ship_id } = req.params;
    const { confirmed_tasks } = req.body;
    const actor_id = req.user.id;

    const company_id = req.user.company_id;
    if (!company_id) {
      throw new Error(
        "Hệ thống không xác định được tài khoản Doanh nghiệp của bạn!",
      );
    }

    const order = await db.shipping_order.findByPk(ship_id, { transaction: t });
    if (!order || order.status === "completed") {
      throw new Error("Đơn hàng không hợp lệ hoặc đã được nhập kho trước đó!");
    }

    const catalogUpdates = {};

    for (const task of confirmed_tasks) {
      const originalTask = await db.Putaway_Tasks.findByPk(task.task_id, {
        transaction: t,
        lock: true,
      });
      if (!originalTask) continue;

      const oldSlotId = originalTask.suggested_slot_id;
      const newSlotId = task.suggested_slot_id;
      const taskVolume = parseFloat(task.suggested_volume) || 0;

      const oldSlot = await db.Warehouse_Slots.findByPk(oldSlotId, {
        transaction: t,
        lock: true,
      });
      if (oldSlot) {
        oldSlot.reserved_volume = Math.max(
          0,
          parseFloat(oldSlot.reserved_volume) - taskVolume,
        );
        await oldSlot.save({ transaction: t });
      }

      const newSlot =
        oldSlotId === newSlotId
          ? oldSlot
          : await db.Warehouse_Slots.findByPk(newSlotId, {
              transaction: t,
              lock: true,
            });

      if (newSlot) {
        newSlot.current_volume =
          parseFloat(newSlot.current_volume) + taskVolume;
        if (newSlot.status === "EMPTY") newSlot.status = "PARTIAL";
        await newSlot.save({ transaction: t });
      }

      await db.Stock_Inventory.create(
        {
          slot_id: newSlotId,
          product_id: task.product_id,
          batch_id: task.batch_id,
          quantity: task.suggested_quantity,
        },
        { transaction: t },
      );

      originalTask.status = "COMPLETED";
      originalTask.suggested_slot_id = newSlotId;
      await originalTask.save({ transaction: t });

      const logData = {
        action_type: "INBOUND",
        product_id: task.product_id,
        batch_id: task.batch_id,
        to_slot: newSlotId,
        quantity: task.suggested_quantity,
        actor_id: actor_id,
      };
      await db.Warehouse_Logs.create(logData, { transaction: t });

      const batch = await db.product_batch.findByPk(task.batch_id, {
        transaction: t,
      });
      if (batch && batch.product_metadata_id) {
        const metaId = batch.product_metadata_id;
        const qty = parseInt(task.suggested_quantity) || 0;

        if (catalogUpdates[metaId]) {
          catalogUpdates[metaId] += qty;
        } else {
          catalogUpdates[metaId] = qty;
        }
      }
    }

    for (const [metaId, qty] of Object.entries(catalogUpdates)) {
      const [catalogItem, created] =
        await db.Company_Price_Catalog.findOrCreate({
          where: {
            company_id: company_id,
            product_metadata_id: metaId,
          },
          defaults: {
            quantity: qty,
            sale_price: 0,
            status: "active",
          },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

      if (!created) {
        catalogItem.quantity = parseInt(catalogItem.quantity || 0) + qty;
        await catalogItem.save({ transaction: t });
      }
    }

    order.status = "completed";
    await order.save({ transaction: t });

    await t.commit();
    return res.status(200).json({
      RC: 200,
      RM: "Nhập kho, cập nhật sơ đồ và lưu danh mục bán hàng thành công!",
    });
  } catch (error) {
    await t.rollback();
    console.error(">>> confirmPutaway Error:", error);
    return res.status(500).json({
      RC: 500,
      RM: error.message || "Lỗi hệ thống khi hoàn tất nhập kho!",
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
      max_height,
      max_length,
      max_width,
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

    const slotVolume =
      (parseFloat(max_length) *
        parseFloat(max_width) *
        parseFloat(max_height)) /
      1000000;

    const slots = [];
    for (let l = 1; l <= num_levels; l++) {
      for (let s = 1; s <= num_slots_per_level; s++) {
        slots.push({
          max_weight: max_weight,
          length: max_length,
          width: max_width,
          height: max_height,
          max_volume: slotVolume, // <--- BỔ SUNG TRƯỜNG NÀY ĐỂ THUẬT TOÁN ĐỌC ĐƯỢC
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

const putawaytask = (db) => async (req, res) => {
  const { company_id } = req?.user || {};
  const { ship_id } = req?.params;

  if (!ship_id || !company_id) {
    return res.status(400).json({ RM: "Thiếu thông tin!", RC: -203 });
  }

  const t = await db.sequelize.transaction();

  try {
    const order = await db.shipping_order.findByPk(ship_id, {
      include: [
        {
          model: db.product_batch,
          as: "batches",
          include: [
            { model: db.Product, as: "product" },

            { model: db.Product_Packaging, as: "boxed" },
          ],
        },
      ],
      transaction: t,
    });

    if (!order) throw new Error("Không tìm thấy thông tin đơn hàng.");
    if (!order.batches || order.batches.length === 0) {
      throw new Error("Lô hàng không có sản phẩm (Batch) nào.");
    }

    const putawayTasks = [];
    const responseUI = [];

    for (const batch of order.batches) {
      let remainingBoxes = parseInt(batch.total_box) || 0;
      if (remainingBoxes <= 0) continue;

      let boxVolume = 0.05;
      if (batch.boxed) {
        boxVolume =
          parseFloat(batch.boxed.volume) ||
          (parseFloat(batch.boxed.length) *
            parseFloat(batch.boxed.width) *
            parseFloat(batch.boxed.height)) /
            1000000;
      }
      if (boxVolume <= 0) boxVolume = 0.05;

      const rawSlots = await db.Warehouse_Slots.findAll({
        where: {
          status: { [db.Sequelize.Op.in]: ["EMPTY", "PARTIAL"] },
        },
        include: [
          {
            model: db.Warehouse_Zones,
            as: "zone",
            include: [
              {
                model: db.Warehouse,
                as: "Warehouse_storage",
                where: { author: company_id },
              },
            ],
          },
          {
            model: db.Warehouse_Racks,
            as: "rack",
            attributes: ["id", "rack_code"],
          },
        ],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      const validSlots = [];
      const levelCapacity = {};

      for (const slot of rawSlots) {
        if (slot.status === "PARTIAL") {
          const inv = await db.Stock_Inventory.findOne({
            where: { slot_id: slot.id },
            transaction: t,
          });
          if (inv && inv.product_id !== batch.product_id) continue;
        }

        const maxVol = parseFloat(slot.max_volume) || 0;
        const currVol = parseFloat(slot.current_volume) || 0;
        const resVol = parseFloat(slot.reserved_volume) || 0;

        const availableSpace = maxVol - (currVol + resVol);

        if (availableSpace >= boxVolume) {
          slot.calcAvailableSpace = availableSpace;
          const levelMatch = slot.slot_code.match(/-L(\d+)/i);
          slot.rackLevelKey = `${slot.rack_id}-${levelMatch ? levelMatch[1] : 1}`;

          validSlots.push(slot);

          if (!levelCapacity[slot.rackLevelKey])
            levelCapacity[slot.rackLevelKey] = 0;
          levelCapacity[slot.rackLevelKey] += availableSpace;
        }
      }

      const totalVolumeNeeded = remainingBoxes * boxVolume;
      validSlots.sort((a, b) => {
        const capA = levelCapacity[a.rackLevelKey];
        const capB = levelCapacity[b.rackLevelKey];

        const canFitA = capA >= totalVolumeNeeded ? 1 : 0;
        const canFitB = capB >= totalVolumeNeeded ? 1 : 0;
        if (canFitA !== canFitB) return canFitB - canFitA;
        if (capA !== capB) return capB - capA;
        if (a.rackLevelKey !== b.rackLevelKey)
          return a.rackLevelKey.localeCompare(b.rackLevelKey);

        const numA = parseInt(a.slot_code.match(/-S(\d+)/i)?.[1] || 0);
        const numB = parseInt(b.slot_code.match(/-S(\d+)/i)?.[1] || 0);
        if (numA !== numB) return numA - numB;
        return a.slot_code.localeCompare(b.slot_code);
      });

      for (const slot of validSlots) {
        if (remainingBoxes <= 0) break;

        const maxBoxesFit = Math.floor(slot.calcAvailableSpace / boxVolume);

        const allocateBoxes = Math.min(maxBoxesFit, remainingBoxes);
        const allocateVolume = allocateBoxes * boxVolume;

        if (allocateBoxes <= 0) continue;

        const taskRealId = uuidv4();

        const taskDB = {
          id: taskRealId,
          shipping_order_id: ship_id,
          batch_id: batch.id,
          product_id: batch.product_id,
          suggested_slot_id: slot.id,
          suggested_quantity: allocateBoxes,
          status: "PENDING",
        };
        putawayTasks.push(taskDB);

        const levelMatch = slot.slot_code.match(/-L(\d+)/i);
        const slotMatch = slot.slot_code.match(/-S(\d+)/i);

        responseUI.push({
          ...taskDB,
          box_volume: boxVolume,
          suggested_volume: allocateVolume,
          location_details: {
            zone_name: slot.zone?.zone_name || "Chưa xác định",
            rack_code: slot.rack?.rack_code || "Chưa xác định",
            slot_code: slot.slot_code,
            level: levelMatch ? parseInt(levelMatch[1]) : 1,
            slot_index: slotMatch ? parseInt(slotMatch[1]) : 1,
          },
        });

        slot.reserved_volume =
          (parseFloat(slot.reserved_volume) || 0) + allocateVolume;
        await slot.save({ transaction: t });

        remainingBoxes -= allocateBoxes;
      }

      if (remainingBoxes > 0) {
        throw new Error(
          JSON.stringify({
            RM: `Kho không đủ chỗ! Lô ${batch.batch_name || batch.id} còn dư ${remainingBoxes} hộp chưa thể cất.`,
            RC: 400,
          }),
        );
      }
    }

    await db.Putaway_Tasks.bulkCreate(putawayTasks, { transaction: t });

    order.status = "pending_putaway";
    await order.save({ transaction: t });

    const finalAvailableSlots = await db.Warehouse_Slots.findAll({
      where: { status: { [db.Sequelize.Op.in]: ["EMPTY", "PARTIAL"] } },
      include: [
        { model: db.Warehouse_Zones, as: "zone", attributes: ["zone_name"] },
        { model: db.Warehouse_Racks, as: "rack", attributes: ["rack_code"] },
      ],
      order: [["slot_code", "ASC"]],
      transaction: t,
    });

    const uiAvailableSlots = finalAvailableSlots.map((slot) => {
      const maxVol = parseFloat(slot.max_volume) || 0;
      const currVol = parseFloat(slot.current_volume) || 0;
      const resVol = parseFloat(slot.reserved_volume) || 0;
      const availableSpace = maxVol - (currVol + resVol);

      const levelMatch = slot.slot_code.match(/-L(\d+)/i);
      const slotMatch = slot.slot_code.match(/-S(\d+)/i);

      return {
        slot_id: slot.id,
        slot_code: slot.slot_code,
        zone_name: slot.zone?.zone_name || "Chưa xác định",
        rack_code: slot.rack?.rack_code || "Chưa xác định",
        level: levelMatch ? parseInt(levelMatch[1]) : 1,
        slot_index: slotMatch ? parseInt(slotMatch[1]) : 1,
        max_capacity: maxVol,
        available_capacity: availableSpace,
      };
    });

    await t.commit();

    return res.status(200).json({
      RM: "Tạo kế hoạch phân bổ theo Thể tích Hộp thành công",
      RC: 200,
      RD: {
        suggested_plan: responseUI,
        available_slots: uiAvailableSlots,
      },
    });
  } catch (error) {
    await t.rollback();
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError.RC === 400) return res.status(400).json(parsedError);
    } catch (e) {
      return res
        .status(500)
        .json({ RM: error.message || "Lỗi thuật toán phân bổ kho", RC: 500 });
    }
  }
};

const getPutawayPlan = (db) => async (req, res) => {
  const { ship_id } = req.params;
  try {
    const rawTasks = await db.Putaway_Tasks.findAll({
      where: { shipping_order_id: ship_id },
      include: [
        {
          model: db.Warehouse_Slots,
          as: "slot",
          include: [
            {
              model: db.Warehouse_Zones,
              as: "zone",
              attributes: ["zone_name"],
            },
            {
              model: db.Warehouse_Racks,
              as: "rack",
              attributes: ["rack_code"],
            },
          ],
        },
        {
          model: db.product_batch,
          as: "batch",
          attributes: ["id", "batch_name", "product_id"],
          include: [
            {
              model: db.Product_Packaging,
              as: "boxed",
              attributes: ["volume", "length", "width", "height"],
            },
          ],
        },
      ],
      order: [["createdAt", "ASC"]],
    });

    const responseUI = rawTasks.map((task) => {
      const slotCode = task.slot?.slot_code || "";
      const levelMatch = slotCode.match(/-L(\d+)/i);
      const slotMatch = slotCode.match(/-S(\d+)/i);

      const boxVol = parseFloat(task.batch?.boxed?.volume) || 0;
      const totalSuggestedVol = task.suggested_quantity * boxVol;

      return {
        id: task.id,
        task_id: task.id,
        shipping_order_id: task.shipping_order_id,
        batch_id: task.batch_id,
        product_id: task.product_id,
        suggested_slot_id: task.suggested_slot_id,
        suggested_quantity: task.suggested_quantity,
        suggested_volume: totalSuggestedVol,
        box_volume: boxVol,
        status: task.status,
        location_details: {
          zone_name: task.slot?.zone?.zone_name || "N/A",
          rack_code: task.slot?.rack?.rack_code || "N/A",
          slot_code: slotCode,
          level: levelMatch ? parseInt(levelMatch[1]) : 1,
          slot_index: slotMatch ? parseInt(slotMatch[1]) : 1,
        },
      };
    });

    const finalAvailableSlots = await db.Warehouse_Slots.findAll({
      where: {
        status: { [db.Sequelize.Op.in]: ["EMPTY", "PARTIAL"] },
      },
      include: [
        { model: db.Warehouse_Zones, as: "zone", attributes: ["zone_name"] },
        { model: db.Warehouse_Racks, as: "rack", attributes: ["rack_code"] },
      ],
      order: [["slot_code", "ASC"]],
    });

    const uiAvailableSlots = finalAvailableSlots.map((slot) => {
      const maxVol = parseFloat(slot.max_volume) || 0;
      const currVol = parseFloat(slot.current_volume) || 0;
      const resVol = parseFloat(slot.reserved_volume) || 0;

      const availableSpace = maxVol - (currVol + resVol);
      const levelMatch = slot.slot_code.match(/-L(\d+)/i);
      const slotMatch = slot.slot_code.match(/-S(\d+)/i);

      return {
        slot_id: slot.id,
        slot_code: slot.slot_code,
        zone_name: slot.zone?.zone_name || "Chưa xác định",
        rack_code: slot.rack?.rack_code || "Chưa xác định",
        level: levelMatch ? parseInt(levelMatch[1]) : 1,
        slot_index: slotMatch ? parseInt(slotMatch[1]) : 1,
        max_capacity: maxVol,
        available_capacity: availableSpace,
      };
    });

    return res.status(200).json({
      RC: 200,
      RM: "Lấy kế hoạch phân bổ thành công",
      RD: {
        suggested_plan: responseUI,
        available_slots: uiAvailableSlots,
      },
    });
  } catch (error) {
    console.error("Lỗi getPutawayPlan:", error);
    return res
      .status(500)
      .json({ RC: -500, RM: "Lỗi máy chủ: " + error.message });
  }
};

const getPhysicalInventory = (db) => async (req, res) => {
  try {
    const { company_id } = req.user;

    const catalog = await db.Company_Price_Catalog.findAll({
      where: {
        company_id: company_id,
      },

      include: [
        {
          model: db.Product_Metadata,
          as: "product_info",
          include: [
            {
              model: db.Product,
              as: "master",
            },
          ],
        },
      ],
      order: [["updatedAt", "DESC"]],
    });

    return res.status(200).json({
      RC: 200,
      RM: "Lấy danh mục sản phẩm bán hàng thành công!",
      RD: catalog,
    });
  } catch (error) {
    console.error("Lỗi lấy danh mục hàng:", error);
    return res
      .status(500)
      .json({ RC: 500, RM: "Lỗi hệ thống: " + error.message });
  }
};

const updatePriceCatalog = (db) => async (req, res) => {
  try {
    const { company_id } = req.user;
    const { item_id, productId, new_price } = req.body;

    console.log(">>> updatePriceCatalog called with:", {
      company_id,
      item_id,
      new_price,
    });
    if (!item_id || !productId || new_price === undefined) {
      return res
        .status(400)
        .json({ RC: 400, RM: "Thiếu thông tin sản phẩm hoặc giá mới!" });
    }

    if (isNaN(new_price) || parseFloat(new_price) < 0) {
      return res.status(400).json({ RC: 400, RM: "Giá mới không hợp lệ!" });
    }

    const catalogItem = await db.Company_Price_Catalog.findOne({
      where: { company_id, product_metadata_id: productId, id: item_id },
    });

    if (!catalogItem) {
      return res
        .status(404)
        .json({ RC: 404, RM: "Không tìm thấy mục trong danh mục giá!" });
    }

    await catalogItem.update({ sale_price: new_price });
    req.ai_mapped_payload = catalogItem.toJSON();
    return res.status(200).json({
      RC: 200,
      RM: "Cập nhật giá sản phẩm thành công!",
      RD: catalogItem,
    });
  } catch (error) {
    console.error("Lỗi cập nhật danh mục giá:", error);
    return res
      .status(500)
      .json({ RC: 500, RM: "Lỗi hệ thống: " + error.message });
  }
};

const updateStatusCatalog = (db) => async (req, res) => {
  try {
    const { company_id } = req.user;
    const { item_id, productId, new_status } = req.body;

    if (!item_id || !productId || new_status === undefined) {
      return res
        .status(400)
        .json({ RC: 400, RM: "Thiếu thông tin sản phẩm hoặc trạng thái mới!" });
    }

    const catalogItem = await db.Company_Price_Catalog.findOne({
      where: { company_id, product_metadata_id: productId, id: item_id },
    });

    if (new_status !== "active" && new_status !== "inactive") {
      return res
        .status(400)
        .json({ RC: 400, RM: "Trạng thái mới không hợp lệ!" });
    }

    if (!catalogItem) {
      return res
        .status(404)
        .json({ RC: 404, RM: "Không tìm thấy mục trong danh mục giá!" });
    }

    await catalogItem.update({ status: new_status });
    req.ai_mapped_payload = catalogItem.toJSON();
    return res.status(200).json({
      RC: 200,
      RM: "Cập nhật trạng thái sản phẩm thành công!",
      RD: catalogItem,
    });
  } catch (error) {
    console.error("Lỗi cập nhật danh mục giá:", error);
    return res
      .status(500)
      .json({ RC: 500, RM: "Lỗi hệ thống: " + error.message });
  }
};

export default {
  createWarehouse,
  getFullWarehouse,
  addZone,
  addRack,
  deleteRack,
  deleteZone,
  getPhysicalInventory,
  addSlotsToRack,
  putawaytask,
  confirmPutaway,
  getPutawayPlan,
  updatePriceCatalog,
  updateStatusCatalog,
};
