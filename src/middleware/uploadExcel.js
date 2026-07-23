// middleware/uploadExcel.js
const multer = require("multer");
const { createError } = require("./errorHandler");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(createError("Only .xlsx files are accepted.", 422));
};

const uploadExcel = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("file");

module.exports = { uploadExcel };