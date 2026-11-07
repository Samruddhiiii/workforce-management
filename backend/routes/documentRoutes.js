// routes/documentRoutes.js
// | Method | URL                         | Access              | Body / query                                  |
// |--------|-----------------------------|---------------------|-----------------------------------------------|
// | GET    | /api/documents/types        | Logged in           | - (list for the document_type dropdown)       |
// | POST   | /api/documents/upload       | Employee            | form-data: document (PDF/JPEG/PNG, 5 MB),     |
// |        |                             |                     |            document_name, document_type       |
// | GET    | /api/documents/my           | Employee            | query: ?status=                               |
// | PUT    | /api/documents/:id          | Employee (owner)    | form-data: document, document_name?,          |
// |        |                             |                     |            document_type?  (replace a file)   |
// | GET    | /api/documents              | Admin               | query: ?employee_id= &status= &document_type= |
// |        |                             |                     |        &search=                               |
// | PUT    | /api/documents/:id/verify   | Admin               | JSON: { status: Approved|Rejected,            |
// |        |                             |                     |         admin_remarks }                       |
// | DELETE | /api/documents/:id          | Admin, or the owner | -                                             |
//
// To view/download a file use its file_url: GET /api/files/documents/<file>

const express = require('express');
const {
  getDocumentTypes,
  uploadDocument,
  getMyDocuments,
  loadReplaceableDocument,
  replaceDocument,
  listDocuments,
  verifyDocument,
  deleteDocument,
} = require('../controllers/documentController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { requireJsonBody, requireMultipartBody } = require('../middleware/requireJsonBody');
const { uploadDocument: uploadDocumentFile } = require('../middleware/uploadMiddleware');
const { methodNotAllowed } = require('../middleware/errorMiddleware');

const router = express.Router();
const adminOnly = [requireAuth, requireRole('admin')];
const employeeOnly = [requireAuth, requireRole('employee')];
const anyRole = [requireAuth, requireRole('admin', 'employee')];
const fileForm = requireMultipartBody('document');

// Fixed paths first, then /:id
router.get('/types', requireAuth, getDocumentTypes);
router.post('/upload', ...employeeOnly, fileForm, uploadDocumentFile, uploadDocument);
router.get('/my', ...employeeOnly, getMyDocuments);
router.get('/', ...adminOnly, listDocuments);

router.put('/:id/verify', ...adminOnly, requireJsonBody, verifyDocument);
router.put('/:id', ...employeeOnly, fileForm, loadReplaceableDocument, uploadDocumentFile, replaceDocument);
router.delete('/:id', ...anyRole, deleteDocument);

router.all('/types', methodNotAllowed('GET'));
router.all('/upload', methodNotAllowed('POST'));
router.all('/my', methodNotAllowed('GET'));
router.all('/', methodNotAllowed('GET'));
router.all('/:id/verify', methodNotAllowed('PUT'));
router.all('/:id', methodNotAllowed('PUT', 'DELETE'));

module.exports = router;
