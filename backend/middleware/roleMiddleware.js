// middleware/roleMiddleware.js
// requireRole('admin') or requireRole('employee'):
// allows the request only if the logged-in user has one of the given roles.
//
// ALWAYS use it AFTER requireAuth, because it relies on req.user:
//   router.get('/', requireAuth, requireRole('admin'), controller.getAll);

function requireRole(...allowedRoles) {
  // This outer function runs once when the route is defined;
  // it returns the real middleware that runs on every request.
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Please log in to continue' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action',
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
