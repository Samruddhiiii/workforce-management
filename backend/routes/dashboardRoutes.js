// routes/dashboardRoutes.js
// | Method | URL                       | Access   |
// |--------|---------------------------|----------|
// | GET    | /api/dashboard/admin      | Admin    |
// | GET    | /api/dashboard/employee   | Employee |

const express = require('express');
const { getAdminDashboard, getEmployeeDashboard } = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { methodNotAllowed } = require('../middleware/errorMiddleware');

const router = express.Router();

router.get('/admin', requireAuth, requireRole('admin'), getAdminDashboard);
router.get('/employee', requireAuth, requireRole('employee'), getEmployeeDashboard);

router.all('/admin', methodNotAllowed('GET'));
router.all('/employee', methodNotAllowed('GET'));

module.exports = router;
