import meta_ws_controller from "./src/core/metadata_core/meta_ws_controller.js";
import cron from "node-cron";
import { Op } from "sequelize";

let running_ATOAPP = false;
let running_ATOAPU = false;
let running_ATOGGN = false;
let running_ATOAPC = false;
let running_ATORMP = false;
let running_ATOACT = false;
let running_ATOAPB = false;
let running_ATOASO = false;
let running_ATOSPS = false;

async function loop_ATOAPS(db, nodes) {
  if (running_ATOSPS) return;
  running_ATOSPS = true;

  try {
    const settings = await db.System_Settings.findOne({
      where: { key: "ATOAPS" },
    });

    if (!settings || settings.enabled !== true) {
      return;
    }

    await meta_ws_controller.Auto_pair_payment(db, nodes);

    const delay = Number(settings.value) || 15000;
    setTimeout(() => loop_ATOAPS(db, nodes), delay);
  } catch (err) {
    console.error("[running_ATOSPS]", err);
    setTimeout(() => loop_ATOAPS(db, nodes), 5000);
  } finally {
    running_ATOSPS = false;
  }
}

async function loop_ATOASO(db, nodes) {
  if (running_ATOASO) return;
  running_ATOASO = true;

  try {
    const settings = await db.System_Settings.findOne({
      where: { key: "ATOASO" },
    });

    if (!settings || settings.enabled !== true) {
      return;
    }

    await meta_ws_controller.Auto_pair_shipingorder(db, nodes);

    const delay = Number(settings.value) || 15000;
    setTimeout(() => loop_ATOASO(db, nodes), delay);
  } catch (err) {
    console.error("[running_ATOASO]", err);
    setTimeout(() => loop_ATOASO(db, nodes), 5000);
  } finally {
    running_ATOASO = false;
  }
}

async function loop_ATOAPB(db, nodes) {
  if (running_ATOAPB) return;
  running_ATOAPB = true;

  try {
    const settings = await db.System_Settings.findOne({
      where: { key: "ATOAPB" },
    });

    if (!settings || settings.enabled !== true) {
      return;
    }

    await meta_ws_controller.Auto_pair_batched(db, nodes);

    const delay = Number(settings.value) || 15000;
    setTimeout(() => loop_ATOAPB(db, nodes), delay);
  } catch (err) {
    console.error("[loop_ATOAPB]", err);
    setTimeout(() => loop_ATOAPB(db, nodes), 5000);
  } finally {
    running_ATOAPB = false;
  }
}

async function loop_ATOACT(db, nodes) {
  if (running_ATOACT) return;
  running_ATOACT = true;

  try {
    const settings = await db.System_Settings.findOne({
      where: { key: "ATOACT" },
    });

    if (!settings || settings.enabled !== true) {
      return;
    }

    await meta_ws_controller.auto_pair_contract(db, nodes);

    const delay = Number(settings.value) || 15000;
    setTimeout(() => loop_ATOACT(db, nodes), delay);
  } catch (err) {
    console.error("[ATOAPP]", err);
    setTimeout(() => loop_ATOACT(db, nodes), 5000);
  } finally {
    running_ATOACT = false;
  }
}

async function loop_ATOAPP(db, nodes) {
  if (running_ATOAPP) return;
  running_ATOAPP = true;

  try {
    const settings = await db.System_Settings.findOne({
      where: { key: "ATOAPP" },
    });

    if (!settings || settings.enabled !== true) {
      return;
    }

    await meta_ws_controller.auto_pair_product(db, nodes);

    const delay = Number(settings.value) || 15000;
    setTimeout(() => loop_ATOAPP(db, nodes), delay);
  } catch (err) {
    console.error("[ATOAPP]", err);
    setTimeout(() => loop_ATOAPP(db, nodes), 5000);
  } finally {
    running_ATOAPP = false;
  }
}

async function loop_ATOAPC(db, nodes) {
  if (running_ATOAPC) return;
  running_ATOAPC = true;

  try {
    const settings = await db.System_Settings.findOne({
      where: { key: "ATOAPC" },
    });

    if (!settings || settings.enabled !== true) {
      return;
    }

    await meta_ws_controller.auto_pair_company(db, nodes);

    const delay = Number(settings.value) || 15000;
    setTimeout(() => loop_ATOAPC(db, nodes), delay);
  } catch (err) {
    console.error("[ATOAPC]", err);
    setTimeout(() => loop_ATOAPC(db, nodes), 5000);
  } finally {
    running_ATOAPC = false;
  }
}

async function loop_ATOAPU(db, nodes) {
  if (running_ATOAPU) return;
  running_ATOAPU = true;

  try {
    const settings = await db.System_Settings.findOne({
      where: { key: "ATOAPU" },
    });

    if (!settings || settings.enabled !== true) {
      return;
    }

    await meta_ws_controller.auto_pair_user(db, nodes);

    const delay = Number(settings.value) || 15000;
    setTimeout(() => loop_ATOAPU(db, nodes), delay);
  } catch (err) {
    console.error("[ATOAPU]", err);
    setTimeout(() => loop_ATOAPU(db, nodes), 5000);
  } finally {
    running_ATOAPU = false;
  }
}

async function loop_ATOGGN(db, nodes) {
  if (running_ATOGGN) return;
  running_ATOGGN = true;

  try {
    const settings = await db.System_Settings.findOne({
      where: { key: "ATOGGN" },
    });

    if (!settings || settings.enabled !== true) {
      return;
    }

    const res = await meta_ws_controller.get_global_node(db, nodes);

    if (res.RC !== 200) {
      console.error(res.RM);
    }

    const delay = Number(settings.value) || 20000;
    setTimeout(() => loop_ATOGGN(db, nodes), delay);
  } catch (err) {
    console.error("[ATOGGN]", err);
    setTimeout(() => loop_ATOGGN(db, nodes), 5000);
  } finally {
    running_ATOGGN = false;
  }
}

async function loop_ATORMP(db, nodes) {
  if (running_ATORMP) {
    return;
  }

  running_ATORMP = true;
  try {
    const settings = await db.System_Settings.findOne({
      where: { key: "ATORMP" },
    });

    if (!settings || settings.enabled !== true) {
      running_ATORMP = false;
      return;
    }

    await meta_ws_controller.Drop_block(db, nodes);

    const delay = Number(settings.value) || 20000;

    setTimeout(() => {
      running_ATORMP = false;
      loop_ATORMP(db, nodes);
    }, delay);
  } catch (err) {
    console.error("[ATORMP] ERROR", err);
    setTimeout(() => {
      console.log("[ATORMP] RETRY round");
      running_ATORMP = false;
      loop_ATORMP(db, nodes);
    }, 5000);
  }
}

const initCronJobs = (db) => {
  cron.schedule("0 0 * * *", async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [updatedCount] = await db.product_batch.update(
        { status: "in_progress" },
        {
          where: {
            status: "pending",
            manufacture_date: {
              [Op.lte]: today,
            },
          },
        },
      );
    } catch (error) {
      console.error("Lỗi khi chạy Cron Job cập nhật Batch:", error);
    }
  });
};

export default {
  loop_ATOAPS,
  loop_ATOAPP,
  loop_ATOAPB,
  loop_ATOAPU,
  loop_ATOGGN,
  loop_ATOAPC,
  loop_ATORMP,
  loop_ATOACT,
  loop_ATOASO,
  initCronJobs,
};
