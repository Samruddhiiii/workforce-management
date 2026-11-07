// middleware/roleMiddleware.js
// requireRole('admin') or requireRole('employee'):
// allows the request only if the logged-in user has one of the given roles.
//
// ALWAYS use it AFTER requireAuth, because it relies on req.user:
//   router.get('/', requireAuth, requireRole('admin'), controller.getAll);
//
// 401 vs 403:
//   401 Unauthorized = "we don't know who you are"  -> log in
//   403 Forbidden    = "we know who you are, but you are not allowed" -> wrong role

function requireRole(...allowedRoles) {
  // This outer function runs once when the route is defined;
  // it returns the real middleware that runs on every request.
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'You are not logged in. Please log in to continue.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        // Tell the user which account they are using - the most common cause
        // of a 403 is being logged in as the wrong user (e.g. an employee
        // trying an admin endpoint because Postman kept the old cookie).
        message: `This action requires the ${allowedRoles.join(' or ')} role. ` +
          `You are logged in as ${req.user.email} (${req.user.role}).`,
      });
    }

    // Extra safety: every employee-only feature needs an employee profile
    if (req.user.role === 'employee' && !req.user.employee_id) {
      return res.status(403).json({ success: false, message: 'Employee profile not found for this account' });
    }

    next();
  };
}

module.exports = { requireRole };
