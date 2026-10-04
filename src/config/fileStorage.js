/**
 * File storage adapter.
 * Today: local disk under ./uploads. To move to S3/R2 later, re-implement
 * save / stream / remove with the same signatures — callers only use this file.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads"));

// Resolve a storage key to an absolute path and refuse anything that escapes ROOT.
const resolveKey = (key) => {
  const abs = path.resolve(ROOT, key);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return abs;
};

const save = async (key, buffer) => {
  const abs = resolveKey(key);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, buffer, { flag: "wx" });
  return key;
};

const exists = async (key) => {
  try {
    await fs.promises.access(resolveKey(key));
    return true;
  } catch {
    return false;
  }
};

const stream = (key) => fs.createReadStream(resolveKey(key));

const remove = async (key) => {
  try {
    await fs.promises.unlink(resolveKey(key));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
};

module.exports = { save, exists, stream, remove };