// routes/taskRoutes.js
// | Method | URL                    | Access              | Body / query                                   |
// |--------|------------------------|---------------------|------------------------------------------------|
// | POST   | /api/tasks             | Admin               | JSON: task_title, assigned_to, description?,   |
// |        |                        |                     |       due_date?, priority?, status?            |
// | GET    | /api/tasks             | Admin               | query: ?employee_id= &status= &priority=       |
// |        |                        |                     |        &search= &overdue=true                  |
// | GET    | /api/tasks/my          | Employee            | query: ?status= &priority= &overdue=true       |
// | GET    | /api/tasks/:id         | Admin, or the owner | -                                              |
// | PUT    | /api/tasks/:id         | Admin               | JSON, partial update                           |
// | PATCH  | /api/tasks/:id/status  | Admin, or the owner | JSON: { status }                               |
// | DELETE | /api/tasks/:id         | Admin               | -                                              |
//
// /my is registered BEFORE /:id, otherwise "my" would be read as an id.

const express = require('express');
const {
  createTask,
  listTasks,
  updateTask,
  deleteTask,
  getTaskById,
  updateTaskStatus,
  getMyTasks,
} = require('../controllers/taskController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { requireJsonBody } = require('../middleware/requireJsonBody');
const { methodNotAllowed } = require('../middleware/errorMiddleware');

const router = express.Router();
const adminOnly = [requireAuth, requireRole('admin')];
const employeeOnly = [requireAuth, requireRole('employee')];
// Both roles; the controller limits employees to their own tasks
const anyRole = [requireAuth, requireRole('admin', 'employee')];

router.get('/my', ...employeeOnly, getMyTasks);
router.all('/my', methodNotAllowed('GET'));

router.post('/', ...adminOnly, requireJsonBody, createTask);
router.get('/', ...adminOnly, listTasks);
router.get('/:id', ...anyRole, getTaskById);
router.put('/:id', ...adminOnly, requireJsonBody, updateTask);
router.delete('/:id', ...adminOnly, deleteTask);
router.patch('/:id/status', ...anyRole, requireJsonBody, updateTaskStatus);

router.all('/', methodNotAllowed('GET', 'POST'));
router.all('/:id', methodNotAllowed('GET', 'PUT', 'DELETE'));
router.all('/:id/status', methodNotAllowed('PATCH'));

module.exports = router;
