import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POLICY_DIR = path.join(__dirname, "../../Access/Policies");


if (!fs.existsSync(POLICY_DIR)) {
  fs.mkdirSync(POLICY_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {

    if (file.fieldname === "pdf_file") {
      cb(null, POLICY_DIR);
    } else {
      cb(new Error(`Field không hợp lệ: ${file.fieldname}`));
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const newName = `POLICY-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, newName);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();


  const allowedExt = [".jpg", ".png", ".webp", ".pdf"];
  const allowedMime = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ];

  if (allowedExt.includes(ext) || allowedMime.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Chỉ cho phép định dạng ảnh hoặc file PDF!"), false);
  }
};

const policy_fileupload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
});

export default policy_fileupload;
