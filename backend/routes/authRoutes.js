// routes/authRoutes.js
// URL -> middleware -> controller, for everything under /api/auth
//
// | Method | URL                | Access      | Body (JSON)                                   |
// |--------|--------------------|-------------|-----------------------------------------------|
// | POST   | /api/auth/register | Public      | first_name/last_name or full_name, email,     |
// |        |                    |             | password, department_id, phone?               |
// | POST   | /api/auth/login    | Public      | email, password                               |
// | POST   | /api/auth/logout   | Public      | none (ends the session if there is one)       |
// | GET    | /api/auth/me       | Logged in   | none                                          |
// | POST   | /api/auth/admins   | Admin only  | email, password                               |

const express = require('express');
const { register, login, logout, getMe, createAdmin } = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { requireJsonBody } = require('../middleware/requireJsonBody');
const { methodNotAllowed } = require('../middleware/errorMiddleware');

const router = express.Router();

// Public
router.post('/register', requireJsonBody, register);
router.post('/login', requireJsonBody, login);
router.post('/logout', logout);

// Any logged-in user
router.get('/me', requireAuth, getMe);

// Admin only: create another admin account.
// Auth/role are checked BEFORE the body, so a non-admin always gets 401/403.
router.post('/admins', requireAuth, requireRole('admin'), requireJsonBody, createAdmin);

// Right URL, wrong method (e.g. opening /api/auth/login in a browser = GET)
// -> clear 405 message instead of a confusing 404.
router.all('/register', methodNotAllowed('POST'));
router.all('/login', methodNotAllowed('POST'));
router.all('/logout', methodNotAllowed('POST'));
router.all('/me', methodNotAllowed('GET'));
router.all('/admins', methodNotAllowed('POST'));

module.exports = router;
