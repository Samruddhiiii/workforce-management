// routes/authRoutes.js
// URL -> middleware -> controller, for everything under /api/auth

const express = require('express');
const { register, login, logout, getMe, createAdmin } = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { methodNotAllowed } = require('../middleware/errorMiddleware');

const router = express.Router();

// Public
router.post('/register', register);
router.post('/login', login);

// Any logged-in user
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, getMe);

// Admin only: create another admin account
router.post('/admins', requireAuth, requireRole('admin'), createAdmin);

// Right URL, wrong method (e.g. opening /api/auth/login in a browser = GET)
// -> clear 405 message instead of a confusing 404.
router.all('/register', methodNotAllowed('POST'));
router.all('/login', methodNotAllowed('POST'));
router.all('/logout', methodNotAllowed('POST'));
router.all('/me', methodNotAllowed('GET'));
router.all('/admins', methodNotAllowed('POST'));

module.exports = router;
