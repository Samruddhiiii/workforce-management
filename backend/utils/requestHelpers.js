// utils/requestHelpers.js
// Helpers that turn confusing request mistakes into clear error messages.

// When req.body is empty, explain the most likely reason based on the
// Content-Type header the client sent. Returns '' if the body is fine.
function bodyFormatHint(req) {
  const hasFields = req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0;
  if (hasFields) return '';

  const type = (req.headers['content-type'] || '').toLowerCase();

  if (type.startsWith('multipart/form-data')) {
    return 'The body was sent as form-data. Send JSON instead (Postman: Body -> raw -> JSON).';
  }
  if (type.startsWith('text/plain')) {
    return 'The body was sent as Text. Change the type to JSON (Postman: Body -> raw -> select "JSON" in the dropdown).';
  }
  if (!type) {
    return 'The request has no body or no Content-Type header. Send JSON (Postman: Body -> raw -> JSON).';
  }
  return 'The request body is empty.';
}

module.exports = { bodyFormatHint };
