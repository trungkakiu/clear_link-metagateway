import { Sequelize } from "sequelize";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const CONFIG_DIR = path.join(process.cwd(), "src", "configs");
const MIGRATIONS_PATH = path.join(
  process.cwd(),
  "src",
  "migrations",
  "validator"
);

const configFiles = fs
  .readdirSync(CONFIG_DIR)
  .filter((f) => f.startsWith("validate_node_") && f.endsWith(".json"));

async function migrateForNode(nodeFile) {
  const nodeConfig = JSON.parse(
    fs.readFileSync(path.join(CONFIG_DIR, nodeFile), "utf-8")
  );
  console.log(`\nĐang migrate cho: ${nodeConfig.id} (${nodeConfig.db.name})`);

  const sequelize = new Sequelize(
    nodeConfig.db.name,
    nodeConfig.db.user,
    nodeConfig.db.pass,
    {
      host: nodeConfig.db.host,
      port: nodeConfig.db.port,
      dialect: "mysql",
      logging: false,
    }
  );

  try {
    await sequelize.authenticate();
    console.log(`Kết nối tới DB ${nodeConfig.db.name} thành công`);

    const migrationFiles = fs
      .readdirSync(MIGRATIONS_PATH)
      .filter((f) => f.endsWith(".js") || f.endsWith(".cjs"));

    for (const file of migrationFiles) {
      const migrationPath = pathToFileURL(
        path.join(MIGRATIONS_PATH, file)
      ).href;
      const migrationModule = await import(migrationPath);
      const migrationFn = migrationModule.default?.up || migrationModule.up;

      if (typeof migrationFn === "function") {
        console.log(`Đang chạy migration: ${file}`);
        await migrationFn(sequelize.getQueryInterface(), Sequelize);
      } else {
        console.warn(`Bỏ qua ${file} vì không có hàm up() hợp lệ`);
      }
    }

    console.log(`Migrate cho ${nodeConfig.id} hoàn tất`);
  } catch (err) {
    console.error(`Lỗi migrate cho ${nodeConfig.id}:`, err.message);
  } finally {
    await sequelize.close();
  }
}

(async () => {
  for (const nodeFile of configFiles) {
    await migrateForNode(nodeFile);
  }
  console.log("\nĐã migrate toàn bộ node validator xong!");
})();
