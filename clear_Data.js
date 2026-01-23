import fs from "fs";
import path from "path";
import { Sequelize } from "sequelize";

const CONFIG_DIR = path.join(process.cwd(), "src", "configs");

const EXCLUDE_TABLES = new Set(["SequelizeMeta"]);

const configFiles = fs
  .readdirSync(CONFIG_DIR)
  .filter((f) => f.startsWith("validate_node_") && f.endsWith(".json"));

async function clearNode(nodeFile) {
  const nodeConfig = JSON.parse(
    fs.readFileSync(path.join(CONFIG_DIR, nodeFile), "utf-8"),
  );

  const sequelize = new Sequelize(
    nodeConfig.db.name,
    nodeConfig.db.user,
    nodeConfig.db.pass,
    {
      host: nodeConfig.db.host,
      port: nodeConfig.db.port,
      dialect: "mysql",
      logging: false,
    },
  );

  try {
    await sequelize.authenticate();
    console.log(`\nKết nối tới DB ${nodeConfig.db.name} thành công`);

    const [tables] = await sequelize.query("SHOW TABLES;");
    const tableNames = tables.map((t) => Object.values(t)[0]);

    await sequelize.query("SET FOREIGN_KEY_CHECKS = 0");

    for (const table of tableNames) {
      if (EXCLUDE_TABLES.has(table)) {
        console.log(`Bỏ qua bảng: ${table}`);
        continue;
      }
      try {
        console.log(`TRUNCATE: ${table}`);
        await sequelize.query(`TRUNCATE TABLE \`${table}\``);

        await sequelize.query(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`);
      } catch (e) {
        console.error(`Lỗi khi truncate ${table}:`, e.message);
      }
    }
    console.log(`Đã clear dữ liệu cho ${nodeConfig.id}`);
  } catch (err) {
    console.error(`Lỗi khi xoá dữ liệu ${nodeConfig.id}:`, err.message);
  } finally {
    try {
      await sequelize.query("SET FOREIGN_KEY_CHECKS = 1");
    } catch {}
    await sequelize.close();
  }
}

(async () => {
  for (const file of configFiles) {
    await clearNode(file);
  }
  console.log("\nHoàn tất xoá dữ liệu tất cả các node validator!");
})();
