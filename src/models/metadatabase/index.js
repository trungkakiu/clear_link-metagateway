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
    logging: false,
    dialectOptions: { multipleStatements: true },
  }
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
  const filePath = path.join(__dirname, file);
  const fileUrl = pathToFileURL(filePath).href;
  const modelModule = await import(fileUrl);
  const model = modelModule.default(sequelize, DataTypes);
  db[model.name] = model;
}

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) db[modelName].associate(db);
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

export default db;
