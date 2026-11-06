// controllers/authController.js
// Registration, login, logout, "who am I", and admin creation.
// Works with the existing tables: users.password_hash, users.role
// ('Admin' / 'Manager' / 'Employee'), employees.first_name / last_name.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { SESSION_COOKIE_NAME, cookieOptions } = require('../config/session');
const { buildSessionUser } = require('../middleware/authMiddleware');
const { bodyFormatHint } = require('../utils/requestHelpers');
const { DB_ROLE_ADMIN, DB_ROLE_EMPLOYEE, toAppRole } = require('../utils/roles');
const {
  cleanString,
  normalizeEmail,
  toPositiveInt,
  validateCredentials,
  validateEmployeeFields,
} = require('../utils/validators');

const SALT_ROUNDS = 10;

// A real bcrypt hash of a random string, generated once at startup. When
// someone logs in with an email that does not exist, we still run
// bcrypt.compare against this hash so the response takes the same time.
// Otherwise an attacker could measure response times to discover which
// emails are registered.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), SALT_ROUNDS);

// Old sample rows may contain placeholder text instead of a bcrypt hash.
// bcrypt hashes always start with $2a$, $2b$ or $2y$.
function isBcryptHash(value) {
  return typeof value === 'string' && /^\$2[aby]\$\d{2}\$/.test(value);
}

// express-session's regenerate/save use callbacks; these wrappers let us use await.
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}
function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

// ---------------------------------------------------------------------
// POST /api/auth/register   (Public)
// Always creates an EMPLOYEE: users row + employees row in ONE transaction.
// Body: first_name, last_name?, email, password, department_id, phone?
// (employees.department_id is NOT NULL in your table, so a department
//  must be chosen at sign-up.)
// ---------------------------------------------------------------------
async function register(req, res, next) {
  const first_name = cleanString(req.body.first_name);
  const last_name = cleanString(req.body.last_name) || null;
  const email = normalizeEmail(req.body.email);
  const password = req.body.password;
  const phone = cleanString(req.body.phone) || null;
  const department_id = toPositiveInt(req.body.department_id);
  // NOTE: req.body.role is deliberately ignored. Public sign-up = employee.

  const errors = [
    ...validateEmployeeFields({ first_name, last_name, phone }),
    ...validateCredentials({ email, password }),
  ];
  if (!department_id) errors.push('Please select a department');
  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: bodyFormatHint(req) || errors.join('. ') });
  }

  let connection;
  try {
    // Friendly checks first (the UNIQUE index / FK are the final safety net)
    const [existing] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }
    const [departments] = await pool.query('SELECT department_id FROM departments WHERE department_id = ?', [department_id]);
    if (departments.length === 0) {
      return res.status(400).json({ success: false, message: 'Selected department does not exist' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // A transaction means: either BOTH inserts succeed, or NEITHER is saved.
    // Without it, a failure on the second insert would leave a user with no profile.
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [userResult] = await connection.query(
      'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
      [email, passwordHash, DB_ROLE_EMPLOYEE]
    );

    const [employeeResult] = await connection.query(
      `INSERT INTO employees (user_id, department_id, first_name, last_name, phone, date_of_joining, employment_status)
       VALUES (?, ?, ?, ?, ?, CURDATE(), 'Active')`,
      [userResult.insertId, department_id, first_name, last_name, phone]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Registration successful. You can now log in.',
      data: buildSessionUser({
        user_id: userResult.insertId,
        email,
        role: DB_ROLE_EMPLOYEE,
        employee_id: employeeResult.insertId,
        first_name,
        last_name,
      }),
    });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      // Two sign-ups with the same email at the same moment
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }
    next(error);
  } finally {
    if (connection) connection.release();
  }
}

// ---------------------------------------------------------------------
// POST /api/auth/login   (Public)
// ---------------------------------------------------------------------
async function login(req, res, next) {
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    // Say exactly what is wrong: empty body / wrong body type / which field is missing
    const hint = bodyFormatHint(req);
    const missing = [!email && 'email', !password && 'password'].filter(Boolean).join(' and ');
    return res.status(400).json({
      success: false,
      message: hint || `Missing ${missing}. Send JSON like {"email": "...", "password": "..."}`,
    });
  }

  // Same message for "no such email" and "wrong password", so the response
  // never reveals which emails are registered.
  const INVALID_LOGIN = 'Invalid email or password';

  try {
    const [rows] = await pool.query(
      `SELECT u.user_id, u.email, u.password_hash, u.role,
              e.employee_id, e.first_name, e.last_name, e.employment_status
         FROM users u
         LEFT JOIN employees e ON e.user_id = u.user_id
        WHERE u.email = ?`,
      [email]
    );
    const user = rows[0];

    // Placeholder (non-bcrypt) passwords can never match.
    const storedHash = user && isBcryptHash(user.password_hash) ? user.password_hash : DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(password, storedHash);
    if (!user || storedHash === DUMMY_HASH || !passwordMatches) {
      return res.status(401).json({ success: false, message: INVALID_LOGIN });
    }

    if (toAppRole(user.role) === 'employee') {
      if (!user.employee_id) {
        return res.status(403).json({ success: false, message: 'Employee profile not found. Please contact the administrator.' });
      }
      if (user.employment_status !== 'Active') {
        return res.status(403).json({ success: false, message: 'Your account has been deactivated. Please contact the administrator.' });
      }
    }

    // New session ID on every login. This prevents "session fixation":
    // an attacker can't plant a known session ID before the victim logs in.
    await regenerateSession(req);
    req.session.user = buildSessionUser(user);
    await saveSession(req); // make sure it is stored in MySQL before we reply

    res.json({ success: true, message: 'Login successful', data: req.session.user });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// POST /api/auth/logout   (Auth)
// ---------------------------------------------------------------------
function logout(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
    res.json({ success: true, message: 'Logged out successfully' });
  });
}

// ---------------------------------------------------------------------
// GET /api/auth/me   (Auth)
// React calls this on every page load to restore the logged-in user.
// requireAuth has already loaded fresh data from MySQL into req.user.
// ---------------------------------------------------------------------
function getMe(req, res) {
  res.json({ success: true, message: 'Current user', data: req.user });
}

// ---------------------------------------------------------------------
// POST /api/auth/admins   (Admin only)
// The ONLY way to create another admin through the API.
// Admins have no employees row, so this is a single insert.
// Body: email, password
// ---------------------------------------------------------------------
async function createAdmin(req, res, next) {
  const email = normalizeEmail(req.body.email);
  const password = req.body.password;

  const errors = validateCredentials({ email, password });
  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: errors.join('. ') });
  }

  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const [result] = await pool.query(
      'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
      [email, passwordHash, DB_ROLE_ADMIN]
    );

    res.status(201).json({
      success: true,
      message: 'Admin account created',
      data: { user_id: result.insertId, email, role: 'admin' },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }
    next(error);
  }
}

module.exports = { register, login, logout, getMe, createAdmin };
