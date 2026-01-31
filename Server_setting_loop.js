import meta_ws_controller from "./src/core/metadata_core/meta_ws_controller.js";

let running_ATOAPP = false;
let running_ATOAPU = false;
let running_ATOGGN = false;
let running_ATORMP = false;
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
    if (res.RC !== "200") {
      console.log(res.RM);
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
    console.warn("[ATORMP] SKIP – already running");
    return;
  }

  running_ATORMP = true;
  console.log("[ATORMP] START round");

  try {
    const settings = await db.System_Settings.findOne({
      where: { key: "ATORMP" },
    });

    if (!settings || settings.enabled !== true) {
      console.warn("[ATORMP] disabled or missing settings");
      running_ATORMP = false;
      return;
    }

    console.log("[ATORMP] CALL Drop_block");

    await meta_ws_controller.Drop_block(db, nodes);

    const delay = Number(settings.value) || 20000;

    console.log("[ATORMP] SCHEDULE next round", delay);

    setTimeout(() => {
      console.log("[ATORMP] NEXT round start");
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

export default {
  loop_ATOAPP,
  loop_ATOAPU,
  loop_ATOGGN,
  loop_ATORMP,
};
