// utils/files.js
// One place for everything about where uploaded files live and how their
// paths are stored in MySQL.
//
// Stored path format (same as the existing rows in your database):
//     uploads/<folder>/<filename>      e.g. uploads/profiles/1730881234-a8f3c1.jpg
// URL the frontend uses to show/download it (served by GET /api/files/...):
//     /api/files/<folder>/<filename>
//
// Files are NEVER served with express.static: the /api/files route checks
// who is asking before sending anything (see controllers/fileController.js).

const fs = require('fs');
const path = require('path');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const UPLOAD_FOLDERS = ['profiles', 'attendance', 'documents'];

// Only names we generate ourselves: letters, digits, dot, dash, underscore.
// This rejects "../", slashes, spaces and other path tricks.
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/;

function isAllowedFolder(folder) {
  return UPLOAD_FOLDERS.includes(folder);
}

function isSafeFilename(filename) {
  return typeof filename === 'string' && SAFE_FILENAME.test(filename) && !filename.includes('..');
}

// 'profiles', 'abc.jpg' -> 'uploads/profiles/abc.jpg'  (what we save in MySQL)
function toStoredPath(folder, filename) {
  return `uploads/${folder}/${filename}`;
}

// 'uploads/profiles/abc.jpg' -> { folder: 'profiles', filename: 'abc.jpg' }, or null
function parseStoredPath(storedPath) {
  if (typeof storedPath !== 'string') return null;
  const match = storedPath.match(/^uploads\/([a-z]+)\/([^/]+)$/);
  if (!match || !isAllowedFolder(match[1]) || !isSafeFilename(match[2])) return null;
  return { folder: match[1], filename: match[2] };
}

// 'uploads/profiles/abc.jpg' -> '/api/files/profiles/abc.jpg', or null
// Controllers add this as *_url so React never has to build paths itself.
function toFileUrl(storedPath) {
  const parsed = parseStoredPath(storedPath);
  return parsed ? `/api/files/${parsed.folder}/${parsed.filename}` : null;
}

// Absolute path on disk, guaranteed to be inside uploads/<folder>/.
// Returns null for anything suspicious.
function resolveUploadPath(folder, filename) {
  if (!isAllowedFolder(folder) || !isSafeFilename(filename)) return null;
  const folderPath = path.join(UPLOAD_ROOT, folder);
  const fullPath = path.resolve(folderPath, filename);
  // Defence in depth: even if the checks above had a bug, never leave the folder
  return fullPath.startsWith(folderPath + path.sep) ? fullPath : null;
}

// Deletes an uploaded file. Accepts a stored path ('uploads/...') or a
// Multer file object (req.file). Never throws: a missing file is fine.
async function removeUploadedFile(fileOrStoredPath) {
  if (!fileOrStoredPath) return;
  let fullPath = null;

  if (typeof fileOrStoredPath === 'object' && fileOrStoredPath.path) {
    fullPath = fileOrStoredPath.path; // Multer already gives the absolute path
  } else {
    const parsed = parseStoredPath(fileOrStoredPath);
    if (parsed) fullPath = resolveUploadPath(parsed.folder, parsed.filename);
  }
  if (!fullPath) return;

  try {
    await fs.promises.unlink(fullPath);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('⚠️  Could not delete file:', fullPath, error.message);
  }
}

// Creates uploads/profiles, uploads/attendance, uploads/documents if missing.
function ensureUploadFolders() {
  UPLOAD_FOLDERS.forEach((folder) => fs.mkdirSync(path.join(UPLOAD_ROOT, folder), { recursive: true }));
}

module.exports = {
  UPLOAD_ROOT,
  UPLOAD_FOLDERS,
  isAllowedFolder,
  isSafeFilename,
  toStoredPath,
  parseStoredPath,
  toFileUrl,
  resolveUploadPath,
  removeUploadedFile,
  ensureUploadFolders,
};
