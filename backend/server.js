// server.js
// Entry point of the backend. It:
//   1. loads environment variables
//   2. configures Express (CORS, JSON parsing, sessions)
//   3. mounts the API routes
//   4. adds 404 + error handlers
//   5. tests the database, then starts listening

require('dotenv').config({ quiet: true });

const express = require('express');
const cors = require('cors');

const { testConnection } = require('./config/db');
const { sessionMiddleware } = require('./config/session');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { requestLogger } = require('./middleware/requestLogger');
const { ensureUploadFolders } = require('./utils/files');

// ---------------------------------------------------------------------
// 1. Check required environment variables (fail fast with a clear message)
// ---------------------------------------------------------------------
const REQUIRED_ENV = ['DB_HOST', 'DB_USER', 'DB_NAME', 'SESSION_SECRET', 'CLIENT_URL'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`❌ Missing environment variables: ${missingEnv.join(', ')}`);
  console.error('   Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------
// 2. Make sure the upload folders exist (Git does not store empty folders)
// ---------------------------------------------------------------------
ensureUploadFolders();

// ---------------------------------------------------------------------
// 3. Create and configure the Express app
// ---------------------------------------------------------------------
const app = express();

// Behind a hosting proxy (Render, Railway, Nginx...) the app sees HTTP even
// when the user uses HTTPS. This tells Express to trust the proxy so that
// "secure" cookies still work in production.
if (isProduction) {
  app.set('trust proxy', 1);
}

// Don't advertise "X-Powered-By: Express" in every response
app.disable('x-powered-by');

// In development, print one line per request (method, URL, status, body
// fields with passwords masked) so request mistakes are easy to spot.
if (!isProduction) {
  app.use(requestLogger);
}

// CORS: only our React app may call the API, and it may send cookies.
// CLIENT_URL may hold several origins separated by commas, e.g.
//   CLIENT_URL=http://localhost:5173,https://my-app.example.com
// A trailing "/" is removed because browsers send the origin without it
// ("http://localhost:5173/" would never match and every request would fail).
const allowedOrigins = process.env.CLIENT_URL.split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Parse JSON bodies (Content-Type: application/json).
// The size limit stops someone from sending a giant body to crash the server.
// This API is JSON-only: there is deliberately NO urlencoded (HTML form)
// parser. File uploads (multipart/form-data) are handled by Multer.
app.use(express.json({ limit: '1mb' }));

// Sessions (stored in MySQL). Must come BEFORE the routes that use req.session.
app.use(sessionMiddleware);

// ---------------------------------------------------------------------
// 4. Routes
// ---------------------------------------------------------------------

// Health check: quick way to see if the API and the database are up.
app.get('/api/health', async (req, res) => {
  try {
    const info = await testConnection();
    res.json({
      success: true,
      message: 'API is running',
      data: { database: 'connected', db_name: info.db, server_time: info.server_time },
    });
  } catch (error) {
    res.status(503).json({ success: false, message: 'Database is not reachable' });
  }
});

// Module routes (each file handles one feature)
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/departments', require('./routes/departmentRoutes'));
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));
app.use('/api/documents', require('./routes/documentRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/files', require('./routes/fileRoutes'));

// ---------------------------------------------------------------------
// 5. 404 + error handlers (must be LAST)
// ---------------------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

// ---------------------------------------------------------------------
// 6. Test the database, then start the server
// ---------------------------------------------------------------------
async function startServer() {
  try {
    const info = await testConnection();
    console.log(`✅ MySQL connected (database: ${info.db}, version: ${info.version})`);

    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`);
      console.log(`   Accepting requests from ${allowedOrigins.join(', ')}`);
    });
  } catch (error) {
    console.error('❌ Could not connect to MySQL:', error.code || '', error.message);
    console.error('   Check DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME in .env');
    process.exit(1);
  }
}

startServer();
