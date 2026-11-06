// routes/departmentRoutes.js
// | Method | URL                      | Access | Body (JSON)                       |
// |--------|--------------------------|--------|-----------------------------------|
// | GET    | /api/departments         | Public | -                                 |
// | POST   | /api/departments         | Admin  | department_name, description?     |
// | PUT    | /api/departments/:id     | Admin  | department_name, description?     |
// | DELETE | /api/departments/:id     | Admin  | - (409 if employees are assigned) |

const express = require('express');
const {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} = require('../controllers/departmentController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { requireJsonBody } = require('../middleware/requireJsonBody');
const { methodNotAllowed } = require('../middleware/errorMiddleware');

const router = express.Router();
const adminOnly = [requireAuth, requireRole('admin')];

router.get('/', getDepartments);
router.post('/', ...adminOnly, requireJsonBody, createDepartment);
router.put('/:id', ...adminOnly, requireJsonBody, updateDepartment);
router.delete('/:id', ...adminOnly, deleteDepartment);

router.all('/', methodNotAllowed('GET', 'POST'));
router.all('/:id', methodNotAllowed('PUT', 'DELETE'));

module.exports = router;
