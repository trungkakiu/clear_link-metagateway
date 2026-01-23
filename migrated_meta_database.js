import { Sequelize } from "sequelize";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const configPath = path.resolve("src/configs/meta_database.json");
const migrationDir = path.resolve("src/migrations/metadatabase");

export async function migrateDatabase({ configPath, migrationDir }) {
  const nodeConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  console.log(`\nĐang migrate DB: ${nodeConfig.db.name}`);

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
      .readdirSync(migrationDir)
      .filter((f) => f.endsWith(".js") || f.endsWith(".cjs"));

    for (const file of migrationFiles) {
      const migrationPath = pathToFileURL(path.join(migrationDir, file)).href;
      const migrationModule = await import(migrationPath);
      const migrationFn = migrationModule.default?.up || migrationModule.up;

      if (typeof migrationFn === "function") {
        console.log(`Đang chạy migration: ${file}`);
        await migrationFn(sequelize.getQueryInterface(), Sequelize);
      }
    }

    console.log(`Migrate hoàn tất cho DB: ${nodeConfig.db.name}`);
  } catch (err) {
    console.error(`Lỗi migrate:`, err.message);
  } finally {
    await sequelize.close();
  }
}

await migrateDatabase({ configPath, migrationDir });
