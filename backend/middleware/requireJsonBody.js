// middleware/requireJsonBody.js
// For endpoints that expect a JSON body (login, register, ...).
//
// Why this exists:
//  - express.json() only parses requests whose Content-Type is
//    application/json. Anything else (Postman "Text", "form-data",
//    "x-www-form-urlencoded") silently leaves req.body = {} and the
//    controller would report confusing "missing field" errors.
//  - This API is JSON-only on purpose. HTML forms on other websites can
//    only send form-data / urlencoded / text, never JSON, so refusing them
//    also blocks "login CSRF" (a malicious page logging you in as someone else).
//
// Responses:
//   415 Unsupported Media Type -> wrong Content-Type (with a hint how to fix it)
//   400 Bad Request            -> the JSON is an array / not an object

function contentTypeHint(type) {
  if (type.startsWith('multipart/form-data')) {
    return 'The body was sent as form-data. This API expects JSON (Postman: Body -> raw -> JSON).';
  }
  if (type.startsWith('application/x-www-form-urlencoded')) {
    return 'The body was sent as x-www-form-urlencoded. This API expects JSON (Postman: Body -> raw -> JSON).';
  }
  if (type.startsWith('text/plain')) {
    return 'The body was sent as Text. In Postman, change the dropdown next to "raw" from Text to JSON.';
  }
  if (!type) {
    return 'The Content-Type header is missing. Send the header "Content-Type: application/json" with a JSON body.';
  }
  return `Content-Type "${type}" is not supported. Send JSON with the header "Content-Type: application/json".`;
}

// True if the request actually carries a body (has a length or is chunked).
function hasBody(req) {
  const length = req.headers['content-length'];
  return req.headers['transfer-encoding'] !== undefined || (length !== undefined && length !== '0');
}

function requireJsonBody(req, res, next) {
  const type = (req.headers['content-type'] || '').toLowerCase().split(';')[0].trim();

  // A body is there, but it is not JSON
  if (hasBody(req) && type !== 'application/json') {
    return res.status(415).json({ success: false, message: contentTypeHint(type) });
  }

  // JSON arrays are valid JSON, but our endpoints need an object
  if (Array.isArray(req.body)) {
    return res.status(400).json({
      success: false,
      message: 'The request body must be a JSON object like {"field": "value"}, not an array.',
    });
  }

  // No body at all (or an empty one): give the controller an empty object so
  // it can list exactly which fields are missing.
  if (!req.body || typeof req.body !== 'object') req.body = {};

  next();
}

// For endpoints that accept EITHER JSON OR a file upload (multipart/form-data),
// e.g. PUT /api/employees/me (text fields, optionally with a profile photo).
// Put it BEFORE the upload middleware; Multer then parses the multipart body.
function requireJsonOrMultipartBody(req, res, next) {
  const type = (req.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
  if (type === 'multipart/form-data') return next();

  if (hasBody(req) && type !== 'application/json') {
    const hint = type.startsWith('application/x-www-form-urlencoded')
      ? 'The body was sent as x-www-form-urlencoded. Use JSON, or form-data when uploading a file.'
      : contentTypeHint(type).replace('This API expects JSON', 'Use JSON, or form-data when uploading a file');
    return res.status(415).json({ success: false, message: hint });
  }
  return requireJsonBody(req, res, next);
}

module.exports = { requireJsonBody, requireJsonOrMultipartBody };
