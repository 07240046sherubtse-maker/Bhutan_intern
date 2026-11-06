const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const multer = require("multer");

const uploadDirectory = path.resolve(process.env.PRIVATE_UPLOAD_DIR || path.join(__dirname, "..", "private_uploads"));
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, _file, callback) => callback(null, `${crypto.randomUUID()}.upload`),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 8, fields: 24, fieldSize: 20 * 1024, parts: 32 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const allowed = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];
    if (!allowed.includes(extension)) {
      const error = new Error("Only PDF, DOC, DOCX, JPG and PNG files are allowed.");
      error.status = 400;
      return callback(error);
    }
    callback(null, true);
  },
});

async function hasAllowedSignature(filePath, extension) {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(8);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead);
    if (extension === ".pdf") return header.subarray(0, 5).toString() === "%PDF-";
    if (extension === ".png") return header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (extension === ".jpg" || extension === ".jpeg") return header[0] === 255 && header[1] === 216 && header[2] === 255;
    if (extension === ".doc") return header.subarray(0, 8).equals(Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]));
    if (extension === ".docx") return header[0] === 0x50 && header[1] === 0x4b;
    return false;
  } finally {
    await handle.close();
  }
}

module.exports = { upload, uploadDirectory, hasAllowedSignature };
