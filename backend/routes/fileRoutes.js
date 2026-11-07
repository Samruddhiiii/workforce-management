// routes/fileRoutes.js
// | Method | URL                              | Access                       |
// |--------|----------------------------------|------------------------------|
// | GET    | /api/files/:folder/:filename     | Admin, or the owner employee |
// Optional query: ?download=1 to download instead of view.

const express = require('express');
const { serveFile } = require('../controllers/fileController');
const { requireAuth } = require('../middleware/authMiddleware');
const { methodNotAllowed } = require('../middleware/errorMiddleware');

const router = express.Router();

router.get('/:folder/:filename', requireAuth, serveFile);
router.all('/:folder/:filename', methodNotAllowed('GET'));

module.exports = router;
