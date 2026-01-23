import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAIN_DIR = path.join(__dirname, "../../Access/Main_avatar");
const SUB_DIR = path.join(__dirname, "../../Access/Sub_productimage");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "main_cardimage") {
      cb(null, MAIN_DIR);
    } else if (file.fieldname === "sub_images") {
      cb(null, SUB_DIR);
    } else {
      cb(new Error(`Field không hợp lệ: ${file.fieldname}`));
    }
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const newName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, newName);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExt = [".jpg", ".png", ".webp", ".gif"];
  const allowedMime = ["image/jpg", "image/png", "image/webp", "image/gif"];

  const isValid =
    allowedExt.includes(ext) || allowedMime.includes(file.mimetype);

  cb(isValid ? null : new Error("Chỉ cho phép ảnh PNG, WEBP, GIF"), isValid);
};

const productUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export default productUpload;
