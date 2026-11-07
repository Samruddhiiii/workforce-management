// controllers/documentController.js
// Employee documents (resume, ID proof, certificates...).
//
//   Employee: upload, list own, replace a Pending/Rejected document,
//             delete a document that is not Approved yet
//   Admin:    list/filter all, approve or reject (with remarks), delete
//
// Files are saved in uploads/documents/ by the upload middleware (PDF, JPEG
// or PNG, max 5 MB, content checked). The table stores the path
// 'uploads/documents/<file>' and the API adds file_url ('/api/files/...'),
// which checks ownership before sending the file.
//
// Approved documents are locked: the employee can no longer replace or
// delete them (the Admin still can delete).

const pool = require('../config/db');
const { toFileUrl, toStoredPath, removeUploadedFile } = require('../utils/files');
const { cleanString, toPositiveInt, checkStringFields, escapeLike } = require('../utils/validators');

// Fixed list, so the Admin can filter reliably. Matches the existing rows.
const DOCUMENT_TYPES = ['Resume', 'Identity Proof', 'Address Proof', 'Certificate', 'Offer Letter', 'Other'];
const VERIFICATION_STATUSES = ['Pending', 'Approved', 'Rejected'];
const MAX_NAME_LENGTH = 150;    // employee_documents.document_name VARCHAR(150)
const MAX_REMARKS_LENGTH = 255; // employee_documents.admin_remarks VARCHAR(255)

const DOCUMENT_SELECT = `
  SELECT doc.document_id, doc.employee_id, e.first_name, e.last_name, u.email, d.department_name,
         doc.document_name, doc.document_type, doc.file_path,
         doc.verification_status, doc.admin_remarks, doc.uploaded_at
    FROM employee_documents doc
    JOIN employees e ON e.employee_id = doc.employee_id
    JOIN users u ON u.user_id = e.user_id
    LEFT JOIN departments d ON d.department_id = e.department_id`;

const DOCUMENT_ORDER = 'ORDER BY doc.uploaded_at DESC, doc.document_id DESC';

function formatDocument(row) {
  return {
    document_id: row.document_id,
    employee_id: row.employee_id,
    employee_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
    email: row.email,
    department_name: row.department_name,
    document_name: row.document_name,
    document_type: row.document_type,
    verification_status: row.verification_status,
    admin_remarks: row.admin_remarks,
    uploaded_at: row.uploaded_at,
    file_path: row.file_path,
    file_url: toFileUrl(row.file_path),
  };
}

async function findDocumentById(documentId) {
  const [rows] = await pool.query(`${DOCUMENT_SELECT} WHERE doc.document_id = ?`, [documentId]);
  return rows[0] ? formatDocument(rows[0]) : null;
}

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}
function documentNotFound(res) {
  return res.status(404).json({ success: false, message: 'Document not found' });
}

// Validates document_name / document_type from a form. `required` = both must be sent.
function readDocumentFields(body, { required }) {
  const fields = {};
  const errors = checkStringFields(body, ['document_name', 'document_type']);
  if (errors.length > 0) return { fields, errors };

  if (body.document_name !== undefined || required) {
    const name = cleanString(body.document_name);
    if (!name) errors.push('document_name is required, e.g. "PAN Card"');
    else if (name.length > MAX_NAME_LENGTH) errors.push(`document_name must be at most ${MAX_NAME_LENGTH} characters`);
    else fields.document_name = name;
  }

  if (body.document_type !== undefined || required) {
    const type = cleanString(body.document_type);
    if (!DOCUMENT_TYPES.includes(type)) errors.push(`document_type must be one of: ${DOCUMENT_TYPES.join(', ')}`);
    else fields.document_type = type;
  }
  return { fields, errors };
}

// =====================================================================
// EMPLOYEE ENDPOINTS
// =====================================================================

// ---------------------------------------------------------------------
// GET /api/documents/types   (any logged-in user) - for the upload dropdown
// ---------------------------------------------------------------------
function getDocumentTypes(req, res) {
  res.json({ success: true, message: 'Document types', data: DOCUMENT_TYPES });
}

// ---------------------------------------------------------------------
// POST /api/documents/upload   (Employee)
// form-data: document (file: PDF/JPEG/PNG, max 5 MB), document_name, document_type
// ---------------------------------------------------------------------
async function uploadDocument(req, res, next) {
  const file = req.file;
  try {
    const { fields, errors } = readDocumentFields(req.body, { required: true });
    if (!file) errors.unshift('A file is required in the form-data field "document"');
    if (errors.length > 0) {
      await removeUploadedFile(file); // don't keep a file for a rejected request
      return badRequest(res, errors.join('. '));
    }

    const [result] = await pool.query(
      `INSERT INTO employee_documents (employee_id, document_name, document_type, file_path, verification_status)
       VALUES (?, ?, ?, ?, 'Pending')`,
      [req.user.employee_id, fields.document_name, fields.document_type, toStoredPath('documents', file.filename)]
    );
    const document = await findDocumentById(result.insertId);
    res.status(201).json({ success: true, message: 'Document uploaded. It is waiting for Admin verification.', data: document });
  } catch (error) {
    await removeUploadedFile(file);
    next(error);
  }
}

// ---------------------------------------------------------------------
// GET /api/documents/my?status=   (Employee)
// ---------------------------------------------------------------------
async function getMyDocuments(req, res, next) {
  const { status } = req.query;
  if (status !== undefined && status !== '' && !VERIFICATION_STATUSES.includes(status)) {
    return badRequest(res, `status must be one of: ${VERIFICATION_STATUSES.join(', ')}`);
  }
  try {
    const conditions = ['doc.employee_id = ?'];
    const values = [req.user.employee_id];
    if (status) { conditions.push('doc.verification_status = ?'); values.push(status); }
    const [rows] = await pool.query(`${DOCUMENT_SELECT} WHERE ${conditions.join(' AND ')} ${DOCUMENT_ORDER}`, values);
    res.json({ success: true, message: `${rows.length} document(s) found`, data: rows.map(formatDocument) });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// Runs BEFORE the upload on PUT /:id: the document must exist, belong to
// this employee and not be Approved. Checked first so no file is written
// for a request that will be refused anyway.
// ---------------------------------------------------------------------
async function loadReplaceableDocument(req, res, next) {
  const documentId = toPositiveInt(req.params.id);
  if (!documentId) return badRequest(res, 'Invalid document id');
  try {
    const document = await findDocumentById(documentId);
    if (!document || document.employee_id !== req.user.employee_id) return documentNotFound(res);
    if (document.verification_status === 'Approved') {
      return res.status(409).json({
        success: false,
        message: 'This document is already approved and cannot be replaced. Upload a new document instead.',
      });
    }
    req.document = document;
    next();
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// PUT /api/documents/:id   (Employee) - replace the file of a Pending or
// Rejected document. form-data: document (file), document_name?, document_type?
// The document goes back to Pending and the old remarks are cleared.
// ---------------------------------------------------------------------
async function replaceDocument(req, res, next) {
  const file = req.file;
  const current = req.document; // set by loadReplaceableDocument
  try {
    const { fields, errors } = readDocumentFields(req.body, { required: false });
    if (!file) errors.unshift('A replacement file is required in the form-data field "document"');
    if (errors.length > 0) {
      await removeUploadedFile(file);
      return badRequest(res, errors.join('. '));
    }

    const updates = {
      ...fields,
      file_path: toStoredPath('documents', file.filename),
      verification_status: 'Pending',
      admin_remarks: null,
    };
    const columns = Object.keys(updates);
    // The WHERE repeats the owner + "not approved" checks, in case the Admin
    // approved it in the meantime.
    const [result] = await pool.query(
      `UPDATE employee_documents
          SET ${columns.map((column) => `${column} = ?`).join(', ')}, uploaded_at = CURRENT_TIMESTAMP
        WHERE document_id = ? AND employee_id = ? AND verification_status <> 'Approved'`,
      [...columns.map((column) => updates[column]), current.document_id, req.user.employee_id]
    );
    if (result.affectedRows === 0) {
      await removeUploadedFile(file);
      return res.status(409).json({ success: false, message: 'This document was approved in the meantime and cannot be replaced.' });
    }

    await removeUploadedFile(current.file_path); // the old file is no longer referenced
    const document = await findDocumentById(current.document_id);
    res.json({ success: true, message: 'Document replaced. It is waiting for Admin verification again.', data: document });
  } catch (error) {
    await removeUploadedFile(file);
    next(error);
  }
}

// =====================================================================
// ADMIN ENDPOINTS
// =====================================================================

// ---------------------------------------------------------------------
// GET /api/documents?employee_id=&status=&document_type=&search=   (Admin)
// ---------------------------------------------------------------------
async function listDocuments(req, res, next) {
  const { employee_id, status, document_type, search } = req.query;
  const conditions = [];
  const values = [];

  if (employee_id !== undefined && employee_id !== '') {
    const employeeId = toPositiveInt(employee_id);
    if (!employeeId) return badRequest(res, 'employee_id must be a number');
    conditions.push('doc.employee_id = ?');
    values.push(employeeId);
  }
  if (status !== undefined && status !== '') {
    if (!VERIFICATION_STATUSES.includes(status)) {
      return badRequest(res, `status must be one of: ${VERIFICATION_STATUSES.join(', ')}`);
    }
    conditions.push('doc.verification_status = ?');
    values.push(status);
  }
  if (document_type !== undefined && document_type !== '') {
    if (!DOCUMENT_TYPES.includes(document_type)) {
      return badRequest(res, `document_type must be one of: ${DOCUMENT_TYPES.join(', ')}`);
    }
    conditions.push('doc.document_type = ?');
    values.push(document_type);
  }
  if (search !== undefined) {
    if (typeof search !== 'string') return badRequest(res, 'search must be a single text value');
    const term = search.trim();
    if (term.length > 100) return badRequest(res, 'search must be at most 100 characters');
    if (term) {
      const like = `%${escapeLike(term)}%`;
      conditions.push("(doc.document_name LIKE ? OR CONCAT_WS(' ', e.first_name, e.last_name) LIKE ?)");
      values.push(like, like);
    }
  }

  try {
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(`${DOCUMENT_SELECT} ${where} ${DOCUMENT_ORDER}`, values);
    res.json({ success: true, message: `${rows.length} document(s) found`, data: rows.map(formatDocument) });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// PUT /api/documents/:id/verify   (Admin)
// Body: { "status": "Approved" | "Rejected", "admin_remarks": "..." }
// admin_remarks is required when rejecting (it tells the employee what to fix).
// ---------------------------------------------------------------------
async function verifyDocument(req, res, next) {
  const documentId = toPositiveInt(req.params.id);
  if (!documentId) return badRequest(res, 'Invalid document id');

  const typeErrors = checkStringFields(req.body, ['status', 'admin_remarks']);
  if (typeErrors.length > 0) return badRequest(res, typeErrors.join('. '));

  const status = cleanString(req.body.status);
  const remarks = cleanString(req.body.admin_remarks) || null;
  if (status !== 'Approved' && status !== 'Rejected') return badRequest(res, 'status must be "Approved" or "Rejected"');
  if (status === 'Rejected' && !remarks) {
    return badRequest(res, 'admin_remarks is required when rejecting, so the employee knows what to fix');
  }
  if (remarks && remarks.length > MAX_REMARKS_LENGTH) {
    return badRequest(res, `admin_remarks must be at most ${MAX_REMARKS_LENGTH} characters`);
  }

  try {
    const [result] = await pool.query(
      'UPDATE employee_documents SET verification_status = ?, admin_remarks = ? WHERE document_id = ?',
      [status, remarks, documentId]
    );
    if (result.affectedRows === 0) return documentNotFound(res);
    const document = await findDocumentById(documentId);
    res.json({ success: true, message: `Document ${status.toLowerCase()}`, data: document });
  } catch (error) {
    next(error);
  }
}

// =====================================================================
// BOTH ROLES
// =====================================================================

// ---------------------------------------------------------------------
// DELETE /api/documents/:id
// Admin: any document. Employee: own document that is not Approved.
// Removes the database row and the file on disk.
// ---------------------------------------------------------------------
async function deleteDocument(req, res, next) {
  const documentId = toPositiveInt(req.params.id);
  if (!documentId) return badRequest(res, 'Invalid document id');

  try {
    const document = await findDocumentById(documentId);
    const isEmployee = req.user.role === 'employee';
    if (!document || (isEmployee && document.employee_id !== req.user.employee_id)) return documentNotFound(res);
    if (isEmployee && document.verification_status === 'Approved') {
      return res.status(409).json({
        success: false,
        message: 'Approved documents cannot be deleted. Ask the Admin if it must be removed.',
      });
    }

    const conditions = ['document_id = ?'];
    const values = [documentId];
    if (isEmployee) {
      // Repeat the checks in the DELETE itself, in case the Admin approved it in the meantime
      conditions.push("employee_id = ? AND verification_status <> 'Approved'");
      values.push(req.user.employee_id);
    }
    const [result] = await pool.query(`DELETE FROM employee_documents WHERE ${conditions.join(' AND ')}`, values);
    if (result.affectedRows === 0) {
      return res.status(409).json({ success: false, message: 'The document changed in the meantime. Reload and try again.' });
    }

    await removeUploadedFile(document.file_path);
    res.json({ success: true, message: 'Document deleted', data: document });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  DOCUMENT_TYPES,
  getDocumentTypes,
  uploadDocument,
  getMyDocuments,
  loadReplaceableDocument,
  replaceDocument,
  listDocuments,
  verifyDocument,
  deleteDocument,
};
