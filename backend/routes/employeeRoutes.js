// routes/employeeRoutes.js
// | Method | URL                  | Access   | Body                                                  |
// |--------|----------------------|----------|-------------------------------------------------------|
// | GET    | /api/employees/me    | Employee | -                                                     |
// | PUT    | /api/employees/me    | Employee | JSON or form-data: first_name, last_name/full_name,   |
// |        |                      |          | phone, address, file "profile_photo" (JPEG/PNG/WebP,  |
// |        |                      |          | max 2 MB)                                             |
// | GET    | /api/employees       | Admin    | query: ?search= &department_id= &status=Active|Inactive|
// | GET    | /api/employees/:id   | Admin    | -                                                     |
// | POST   | /api/employees       | Admin    | JSON (see employeeController.createEmployee)          |
// | PUT    | /api/employees/:id   | Admin    | JSON, partial update                                  |
// | DELETE | /api/employees/:id   | Admin    | - (sets employment_status = Inactive)                 |
//
// IMPORTANT: the /me routes are registered BEFORE /:id. Express checks
// routes in order; otherwise GET /me would match /:id with id = "me".

const express = require('express');
const {
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
  getMyProfile,
  updateMyProfile,
} = require('../controllers/employeeController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { requireJsonBody, requireJsonOrMultipartBody } = require('../middleware/requireJsonBody');
const { uploadProfilePhoto } = require('../middleware/uploadMiddleware');
const { methodNotAllowed } = require('../middleware/errorMiddleware');

const router = express.Router();
const adminOnly = [requireAuth, requireRole('admin')];
const employeeOnly = [requireAuth, requireRole('employee')];

// --- Employee: own profile (auth runs BEFORE the upload, so anonymous
//     users can never write files to the server) ---
router.get('/me', ...employeeOnly, getMyProfile);
router.put('/me', ...employeeOnly, requireJsonOrMultipartBody, uploadProfilePhoto, updateMyProfile);
router.all('/me', methodNotAllowed('GET', 'PUT'));

// --- Admin ---
router.get('/', ...adminOnly, listEmployees);
router.post('/', ...adminOnly, requireJsonBody, createEmployee);
router.get('/:id', ...adminOnly, getEmployeeById);
router.put('/:id', ...adminOnly, requireJsonBody, updateEmployee);
router.delete('/:id', ...adminOnly, deactivateEmployee);

router.all('/', methodNotAllowed('GET', 'POST'));
router.all('/:id', methodNotAllowed('GET', 'PUT', 'DELETE'));

module.exports = router;
