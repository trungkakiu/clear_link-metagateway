import multer from "multer";
import path from "path";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimetype = file.mimetype;

  const allowedImageExt = [".jpg", ".jpeg", ".png", ".webp"];
  const allowedVideoExt = [".mp4", ".mov", ".avi"];

  const isImage =
    allowedImageExt.includes(ext) || mimetype.startsWith("images/");
  const isVideo =
    allowedVideoExt.includes(ext) || mimetype.startsWith("video/");

  if (isImage || isVideo) {
    cb(null, true);
  } else {
    cb(new Error("Định dạng file không hỗ trợ! (Chỉ nhận Ảnh/Video)"), false);
  }
};

const InspectionUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024,
  },
});

export default InspectionUpload;
