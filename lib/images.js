const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

let sharp = null;
try { sharp = require('sharp'); } catch { /* optional: without it images are stored as uploaded */ }

const dir = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(dir, { recursive: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

// Trust the file's own bytes, not the name or MIME type the browser sent.
function sniff(b) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}
async function saveImage(file, { maxWidth = 1600 } = {}) {
  if (!file) throw Object.assign(new Error('Choose an image to upload.'), { status: 400 });
  const ext = sniff(file.buffer);
  if (!ext) throw Object.assign(new Error('Upload a JPEG, PNG or WebP image.'), { status: 400 });
  const id = crypto.randomUUID();
  if (sharp) {
    const name = `${id}.webp`;
    await sharp(file.buffer).rotate().resize({ width: maxWidth, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(dir, name));
    return `/uploads/${name}`;
  }
  const name = `${id}.${ext}`;
  fs.writeFileSync(path.join(dir, name), file.buffer);
  return `/uploads/${name}`;
}

function removeUpload(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return;
  fs.unlink(path.join(dir, path.basename(url)), () => {});
}

module.exports = { upload, saveImage, removeUpload, sniff, hasSharp: !!sharp };
