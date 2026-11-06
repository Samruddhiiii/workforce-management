// controllers/authController.js
// Registration, login, logout, "who am I", and admin creation.
// Works with the existing tables: users.password_hash, users.role
// ('Admin' / 'Manager' / 'Employee'), employees.first_name / last_name.
//
// All routes that read a body go through requireJsonBody first, so here
// req.body is always a plain object.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { SESSION_COOKIE_NAME, cookieOptions } = require('../config/session');
const { buildSessionUser } = require('../middleware/authMiddleware');
const { DB_ROLE_ADMIN, DB_ROLE_EMPLOYEE, toAppRole } = require('../utils/roles');
const {
  cleanString,
  normalizeEmail,
  toPositiveInt,
  checkStringFields,
  normalizePhone,
  splitFullName,
  validateCredentials,
  validateEmployeeName,
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

// Sends a 400 with all validation messages joined into one sentence.
function badRequest(res, errors) {
  return res.status(400).json({ success: false, message: errors.join('. ') });
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
//
// Body (JSON):
//   first_name + last_name   OR   full_name     (one of the two is required)
//   email, password, department_id             (required)
//   phone                                      (optional)
// employees.department_id is NOT NULL in your table, so a department must
// be chosen at sign-up. "role" and "username" are ignored if sent.
// ---------------------------------------------------------------------
async function register(req, res, next) {
  const body = req.body;

  const typeErrors = checkStringFields(body, ['first_name', 'last_name', 'full_name', 'email', 'password']);
  if (typeErrors.length > 0) return badRequest(res, typeErrors);

  // Accept either first_name/last_name (matches the table) or full_name
  let first_name = cleanString(body.first_name);
  let last_name = cleanString(body.last_name) || null;
  if (!first_name && body.full_name) {
    ({ first_name, last_name } = splitFullName(body.full_name));
  }

  const email = normalizeEmail(body.email);
  const password = body.password;
  const department_id = toPositiveInt(body.department_id);
  const { phone, error: phoneError } = normalizePhone(body.phone);
  // NOTE: body.role is deliberately ignored. Public sign-up = employee.

  const errors = [
    ...validateEmployeeName({ first_name, last_name }),
    ...validateCredentials({ email, password }),
  ];
  if (phoneError) errors.push(phoneError);
  if (!department_id) errors.push('department_id is required and must be a department number, e.g. "department_id": 1');
  if (errors.length > 0) return badRequest(res, errors);

  let connection;
  try {
    // Friendly checks first (the UNIQUE index / FK are the final safety net)
    const [existing] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }
    const [departments] = await pool.query('SELECT department_id FROM departments WHERE department_id = ?', [department_id]);
    if (departments.length === 0) {
      return badRequest(res, [`Department ${department_id} does not exist`]);
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
// Body (JSON): { "email": "...", "password": "..." }
// ---------------------------------------------------------------------
async function login(req, res, next) {
  const typeErrors = checkStringFields(req.body, ['email', 'password']);
  if (typeErrors.length > 0) return badRequest(res, typeErrors);

  const email = normalizeEmail(req.body.email);
  const password = req.body.password || '';

  if (!email || !password) {
    const missing = [!email && 'email', !password && 'password'].filter(Boolean).join(' and ');
    return badRequest(res, [`Missing ${missing}. Send JSON like {"email": "...", "password": "..."}`]);
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
    const hasRealHash = user && isBcryptHash(user.password_hash);
    const passwordMatches = await bcrypt.compare(password, hasRealHash ? user.password_hash : DUMMY_HASH);
    if (!hasRealHash || !passwordMatches) {
      return res.status(401).json({ success: false, message: INVALID_LOGIN });
    }

    // Correct password from here on, so it is safe to explain account problems
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
    // It also replaces any previous login in the same browser/Postman.
    await regenerateSession(req);
    req.session.user = buildSessionUser(user);
    await saveSession(req); // make sure it is stored in MySQL before we reply

    res.json({ success: true, message: 'Login successful', data: req.session.user });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// POST /api/auth/logout   (Public, safe to call any time)
// Logout does not require a valid session: if the session already expired,
// the client still needs a 200 and the stale cookie removed. Calling it
// twice is harmless ("idempotent").
// ---------------------------------------------------------------------
function logout(req, res, next) {
  const wasLoggedIn = Boolean(req.session && req.session.user);

  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
    res.json({
      success: true,
      message: wasLoggedIn ? 'Logged out successfully' : 'You were already logged out',
    });
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
// Body (JSON): { "email": "...", "password": "..." }
// ---------------------------------------------------------------------
async function createAdmin(req, res, next) {
  const typeErrors = checkStringFields(req.body, ['email', 'password']);
  if (typeErrors.length > 0) return badRequest(res, typeErrors);

  const email = normalizeEmail(req.body.email);
  const password = req.body.password;

  const errors = validateCredentials({ email, password });
  if (errors.length > 0) return badRequest(res, errors);

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
