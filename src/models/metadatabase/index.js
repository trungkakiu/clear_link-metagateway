import fs from "fs";
import path from "path";
import { Sequelize, DataTypes } from "sequelize";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = {};

const sequelize = new Sequelize(
  process.env.META_DB_NAME || "supply_chain_metadatabase",
  process.env.META_DB_USER || "root",
  process.env.META_DB_PASS || "123456",
  {
    host: process.env.META_DB_HOST || "localhost",
    port: process.env.META_DB_PORT || 3399,
    dialect: "mysql",
    dialect: "mysql", // hoặc postgres
    timezone: "+07:00", // Ép về múi giờ Việt Nam
    dialectOptions: {
      useUTC: false, // Không dùng UTC
      dateStrings: true,
      typeCast: true,
    },
    logging: false,
    dialectOptions: {
      multipleStatements: true,
      connectTimeout: 30000,
    },

    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 2000,
      evict: 1000,
    },

    retry: {
      match: [
        /Deadlock/i,
        /SequelizeConnectionError/,
        /SequelizeConnectionRefusedError/,
        /SequelizeHostNotFoundError/,
        /SequelizeHostNotReachableError/,
        /SequelizeInvalidConnectionError/,
        /SequelizeConnectionTimedOutError/,
      ],
      max: 3,
    },
  },
);

const files = fs.readdirSync(__dirname).filter((file) => {
  return (
    file.indexOf(".") !== 0 &&
    file !== path.basename(__filename) &&
    file.endsWith(".js") &&
    !file.endsWith(".test.js")
  );
});

for (const file of files) {
  try {
    const filePath = path.join(__dirname, file);
    const fileUrl = pathToFileURL(filePath).href;
    const modelModule = await import(fileUrl);

    if (modelModule && typeof modelModule.default === "function") {
      const model = modelModule.default(sequelize, DataTypes);
      db[model.name] = model;
    } else {
      console.warn(
        `>>> [SKIP] File ${file} không export default đúng cấu trúc model!`,
      );
    }
  } catch (error) {
    console.error(`>>> [CRITICAL ERROR] Lỗi tại file model: ${file}`);
    console.error(error.message);
  }
}

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    try {
      db[modelName].associate(db);
    } catch (assocError) {
      console.error(
        `>>> [ASSOC ERROR] Lỗi liên kết tại model: ${modelName}`,
        assocError,
      );
    }
  }
});

// await sequelize.sync({ alter: true });

db.sequelize = sequelize;
db.Sequelize = Sequelize;

export default db;
