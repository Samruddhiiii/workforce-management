// routes/attendanceRoutes.js
// | Method | URL                          | Access   | Body / query                                        |
// |--------|------------------------------|----------|-----------------------------------------------------|
// | POST   | /api/attendance/mark         | Employee | form-data: attendance_photo (JPEG/PNG/WebP, 2 MB)   |
// | POST   | /api/attendance/check-out    | Employee | - (no body)                                         |
// | GET    | /api/attendance/my           | Employee | query: ?from= &to= &status=                         |
// | GET    | /api/attendance              | Admin    | query: ?date= &from= &to= &employee_id=             |
// |        |                              |          |        &department_id= &status=Pending|Verified|Rejected |
// | GET    | /api/attendance/stats        | Admin    | query: ?date= (default today)                       |
// | PUT    | /api/attendance/:id/verify   | Admin    | JSON: { status: Verified|Rejected, admin_remarks }  |
//
// Order of the middleware on /mark matters:
//   requireAuth -> requireRole -> form-data check -> "already marked?" -> upload -> controller
// so anonymous users, admins and employees who already checked in today
// can never write a file to the server.

const express = require('express');
const {
  ensureNotMarkedToday,
  markAttendance,
  checkOut,
  getMyAttendance,
  listAttendance,
  verifyAttendance,
  getAttendanceStats,
} = require('../controllers/attendanceController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { requireJsonBody, requireMultipartBody } = require('../middleware/requireJsonBody');
const { uploadAttendancePhoto } = require('../middleware/uploadMiddleware');
const { methodNotAllowed } = require('../middleware/errorMiddleware');

const router = express.Router();
const adminOnly = [requireAuth, requireRole('admin')];
const employeeOnly = [requireAuth, requireRole('employee')];

// --- Employee ---
router.post('/mark', ...employeeOnly, requireMultipartBody('attendance_photo'),
  ensureNotMarkedToday, uploadAttendancePhoto, markAttendance);
router.post('/check-out', ...employeeOnly, requireJsonBody, checkOut);
router.get('/my', ...employeeOnly, getMyAttendance);

// --- Admin ---
router.get('/stats', ...adminOnly, getAttendanceStats);
router.get('/', ...adminOnly, listAttendance);
router.put('/:id/verify', ...adminOnly, requireJsonBody, verifyAttendance);

router.all('/mark', methodNotAllowed('POST'));
router.all('/check-out', methodNotAllowed('POST'));
router.all('/my', methodNotAllowed('GET'));
router.all('/stats', methodNotAllowed('GET'));
router.all('/', methodNotAllowed('GET'));
router.all('/:id/verify', methodNotAllowed('PUT'));

module.exports = router;
