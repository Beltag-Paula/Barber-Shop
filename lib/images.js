const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

let sharp = null;
try { sharp = require('sharp'); } catch { /* optional: without it images are stored as uploaded */ }

const dir = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(dir, { recursive: true });

// Memory storage: the file is checked and resized before anything touches the disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

// Trust the file's own bytes, not the name or MIME type the browser sent.
function sniff(b) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// Returns a URL path like /uploads/<id>.webp. Resizes and re-encodes when sharp is installed.
// thumb: also write a small copy (id-t.webp) of that width, used by grids so phones do not download full-size photos.
async function saveImage(file, { maxWidth = 1600, thumb = 0 } = {}) {
  if (!file) throw Object.assign(new Error('Choose an image to upload.'), { status: 400 });
  const ext = sniff(file.buffer);
  if (!ext) throw Object.assign(new Error('Upload a JPEG, PNG or WebP image.'), { status: 400 });
  const id = crypto.randomUUID();
  if (sharp) {
    const name = `${id}.webp`;
    await sharp(file.buffer).rotate().resize({ width: maxWidth, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(dir, name));
    if (thumb) await sharp(file.buffer).rotate().resize({ width: thumb, withoutEnlargement: true }).webp({ quality: 76 }).toFile(path.join(dir, `${id}-t.webp`));
    return `/uploads/${name}`;
  }
  const name = `${id}.${ext}`;
  fs.writeFileSync(path.join(dir, name), file.buffer);
  return `/uploads/${name}`;
}

// Only ever deletes files inside public/uploads, never the bundled /img defaults.
function removeUpload(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return;
  fs.unlink(path.join(dir, path.basename(url)), () => {});
  fs.unlink(path.join(dir, path.basename(url).replace(/\.\w+$/, '-t.webp')), () => {});
}

// The small copy of an upload if one exists, otherwise the upload itself.
function thumbUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return url;
  const small = url.replace(/\.\w+$/, '-t.webp');
  return fs.existsSync(path.join(dir, path.basename(small))) ? small : url;
}

module.exports = { upload, saveImage, removeUpload, thumbUrl, sniff, hasSharp: !!sharp };
