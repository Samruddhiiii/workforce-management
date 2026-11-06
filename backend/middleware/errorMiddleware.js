// middleware/errorMiddleware.js
// Handlers that turn mistakes and failures into clean JSON responses:
//   1. methodNotAllowed -> right URL, wrong HTTP method (e.g. GET on /login) -> 405
//   2. notFound         -> any request that matched no route -> 404
//   3. errorHandler     -> any error thrown/passed with next(err)
// (Phase 4 extends errorHandler with friendly Multer upload errors.)

// Use AFTER the real handlers of a path, e.g.:
//   router.post('/login', login);
//   router.all('/login', methodNotAllowed('POST'));
// Without this, "GET /api/auth/login" would give a confusing 404
// even though the URL is correct.
function methodNotAllowed(...allowedMethods) {
  return (req, res) => {
    res.set('Allow', allowedMethods.join(', '));
    res.status(405).json({
      success: false,
      message: `${req.method} is not allowed on ${req.baseUrl}${req.path}. Use ${allowedMethods.join(' or ')}.`,
    });
  };
}

function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}. Check the URL for typos or extra spaces.`,
  });
}

// Express recognises an error handler because it has FOUR parameters.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Body sent by the client was not valid JSON
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON in request body. Check for missing quotes, missing commas or a trailing comma.',
    });
  }

  // Body larger than the express.json() limit
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body is too large' });
  }

  // Our own code can set err.statusCode (e.g. 400, 403) for expected errors
  const statusCode = err.statusCode || 500;

  // Log unexpected errors on the server so we can debug them
  if (statusCode === 500) {
    console.error('❌ Unexpected error:', err);
  }

  res.status(statusCode).json({
    success: false,
    // In production, hide internal details for 500 errors
    message:
      statusCode === 500 && process.env.NODE_ENV === 'production'
        ? 'Something went wrong. Please try again later.'
        : err.message || 'Internal server error',
  });
}

module.exports = { methodNotAllowed, notFound, errorHandler };
