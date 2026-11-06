// controllers/fileController.js
// GET /api/files/:folder/:filename   (any logged-in user, with ownership check)
//
// Why not express.static('uploads')?  Static serving would let ANYONE who
// guesses a URL download every employee's ID proof. Here, every request is
// checked:
//   - folder must be one of: profiles, attendance, documents
//   - filename must be a simple safe name (no "../", no slashes)
//   - Admin: may open any file
//   - Employee: may open a file only if a database row links it to THEIR
//     employee_id (their profile photo, attendance photo or document)
// For anything else we answer 404, so nobody can probe which files exist.
//
// Add ?download=1 to the URL to download instead of viewing in the browser.

const fs = require('fs');
const pool = require('../config/db');
const { resolveUploadPath, toStoredPath } = require('../utils/files');

// Which table/column records ownership for each folder.
// (Fixed strings written here - never built from user input.)
const OWNERSHIP_QUERIES = {
  profiles: 'SELECT 1 FROM employees WHERE employee_id = ? AND profile_photo = ? LIMIT 1',
  attendance: 'SELECT 1 FROM attendance WHERE employee_id = ? AND attendance_photo = ? LIMIT 1',
  documents: 'SELECT 1 FROM employee_documents WHERE employee_id = ? AND file_path = ? LIMIT 1',
};

function fileNotFound(res) {
  return res.status(404).json({ success: false, message: 'File not found' });
}

async function serveFile(req, res, next) {
  try {
    const { folder, filename } = req.params;

    const fullPath = resolveUploadPath(folder, filename);
    if (!fullPath) {
      return res.status(400).json({ success: false, message: 'Invalid file path' });
    }

    if (req.user.role !== 'admin') {
      const [rows] = await pool.query(OWNERSHIP_QUERIES[folder], [
        req.user.employee_id,
        toStoredPath(folder, filename),
      ]);
      if (rows.length === 0) return fileNotFound(res);
    }

    // The row may point to a file that is missing on disk (e.g. old sample data)
    try {
      await fs.promises.access(fullPath, fs.constants.R_OK);
    } catch {
      return fileNotFound(res);
    }

    // Security headers for user-uploaded content:
    //  nosniff  -> the browser must trust our Content-Type, not guess it
    //  no-store -> private files are not kept in shared caches
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'private, no-store');

    const onSent = (err) => {
      if (err && !res.headersSent) next(err);
    };
    if (req.query.download === '1' || req.query.download === 'true') {
      res.download(fullPath, filename, onSent);
    } else {
      res.sendFile(fullPath, onSent);
    }
  } catch (error) {
    next(error);
  }
}

module.exports = { serveFile };
