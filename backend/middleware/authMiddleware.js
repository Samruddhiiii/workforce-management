// middleware/authMiddleware.js
// requireAuth: lets the request continue only if the user is logged in.
//
// HOW LOGIN STATE WORKS IN THIS APP
// This API uses SESSION COOKIES, not tokens. After POST /api/auth/login the
// server sends a "wms.sid" cookie; the browser (or Postman) sends it back
// automatically on every request. There is no "Authorization: Bearer ..."
// header - if a client sends one, we tell it so in the error message.
//
// Why we re-check the database on every request:
// The session is created at login and lives for a day. If, in the meantime,
// the Admin deactivates that employee (or the account is deleted), the old
// session must stop working immediately - not tomorrow. One small indexed
// query per request is a cheap price for that guarantee.

const pool = require('../config/db');
const { SESSION_COOKIE_NAME, cookieOptions } = require('../config/session');
const { toAppRole } = require('../utils/roles');

// Builds the safe user object stored in the session and sent to React.
// It NEVER includes the password hash. Also used by authController.
function buildSessionUser(row) {
  const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ');
  return {
    user_id: row.user_id,
    email: row.email,
    role: toAppRole(row.role),            // 'admin' or 'employee'
    employee_id: row.employee_id || null, // null for admins
    first_name: row.first_name || null,
    last_name: row.last_name || null,
    full_name: fullName || null,
  };
}

// Did the client send our session cookie at all?
function hasSessionCookie(req) {
  const cookieHeader = req.headers.cookie || '';
  return cookieHeader.split(';').some((part) => part.trim().startsWith(`${SESSION_COOKIE_NAME}=`));
}

// Sends 401 and tells the browser to delete a cookie that no longer works.
function rejectUnauthenticated(req, res, message) {
  if (hasSessionCookie(req)) res.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
  return res.status(401).json({ success: false, message });
}

// Explains WHY the request is not logged in, so 401s are easy to debug.
function notLoggedInMessage(req) {
  if (req.headers.authorization) {
    return 'This API uses session cookies, not tokens. Log in with POST /api/auth/login; ' +
      'the browser or Postman then sends the session cookie automatically.';
  }
  if (hasSessionCookie(req)) {
    // Cookie was sent but no session matches it: expired, logged out, or tampered with
    return 'Your session has expired or is no longer valid. Please log in again.';
  }
  return 'You are not logged in. Please log in to continue.';
}

async function requireAuth(req, res, next) {
  try {
    const sessionUser = req.session && req.session.user;
    if (!sessionUser) {
      return rejectUnauthenticated(req, res, notLoggedInMessage(req));
    }

    const [rows] = await pool.query(
      `SELECT u.user_id, u.email, u.role,
              e.employee_id, e.first_name, e.last_name, e.employment_status
         FROM users u
         LEFT JOIN employees e ON e.user_id = u.user_id
        WHERE u.user_id = ?`,
      [sessionUser.user_id]
    );
    const user = rows[0];

    // Account deleted, or employee deactivated -> end the session now
    let problem = null;
    if (!user) {
      problem = 'Your account no longer exists. Please contact the administrator.';
    } else if (toAppRole(user.role) === 'employee' && user.employment_status !== 'Active') {
      problem = 'Your account has been deactivated. Please contact the administrator.';
    }
    if (problem) {
      return req.session.destroy(() => rejectUnauthenticated(req, res, problem));
    }

    // Always use the role from the DATABASE, never from the client.
    // Controllers read the current user from req.user.
    req.user = buildSessionUser(user);

    // Keep the session in sync with the DB, but only write when something
    // changed (e.g. the Admin edited the name) to avoid a DB write per request.
    if (JSON.stringify(sessionUser) !== JSON.stringify(req.user)) {
      req.session.user = req.user;
    }

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { requireAuth, buildSessionUser };
