// middleware/authMiddleware.js
// requireAuth: lets the request continue only if the user is logged in.
//
// Why we re-check the database on every request:
// The session is created at login and lives for a day. If, in the meantime,
// the Admin deactivates that employee (or the account is deleted), the old
// session must stop working immediately - not tomorrow. One small indexed
// query per request is a cheap price for that guarantee.

const pool = require('../config/db');
const { toAppRole } = require('../utils/roles');

// Builds the safe user object stored in the session and sent to React.
// It NEVER includes the password hash. Also used by authController.
function buildSessionUser(row) {
  const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ');
  return {
    user_id: row.user_id,
    email: row.email,
    role: toAppRole(row.role),          // 'admin' or 'employee'
    employee_id: row.employee_id || null, // null for admins
    first_name: row.first_name || null,
    last_name: row.last_name || null,
    full_name: fullName || null,
  };
}

async function requireAuth(req, res, next) {
  try {
    const sessionUser = req.session && req.session.user;
    if (!sessionUser) {
      return res.status(401).json({ success: false, message: 'Please log in to continue' });
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

    const isEmployee = user && toAppRole(user.role) === 'employee';
    const isInactiveEmployee = isEmployee && user.employment_status !== 'Active';
    if (!user || isInactiveEmployee) {
      // Account removed or deactivated -> kill the session
      return req.session.destroy(() => {
        res.status(401).json({ success: false, message: 'Your session is no longer valid. Please log in again.' });
      });
    }

    // Always use the role from the DATABASE, never from the client.
    // Controllers read the current user from req.user.
    req.user = buildSessionUser(user);
    req.session.user = req.user; // keep the session in sync with the DB

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { requireAuth, buildSessionUser };
