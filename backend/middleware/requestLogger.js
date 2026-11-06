// middleware/requestLogger.js
// DEVELOPMENT-ONLY request logger. For every request it prints one line:
//
//   POST /api/auth/login -> 400 (3 ms) | type: text/plain | body: {}
//   POST /api/auth/login -> 200 (85 ms) | type: application/json | body: { email: "admin@cdac.in", password: "***" }
//
// This makes the most common Postman mistakes visible in your terminal:
// wrong method, wrong URL, wrong body type (form-data / Text), empty body,
// misspelled field names. Passwords are always masked.

const SENSITIVE_FIELDS = ['password', 'password_hash', 'new_password', 'current_password'];

function summarizeBody(body) {
  if (!body || typeof body !== 'object' || Object.keys(body).length === 0) return '{}';
  const parts = Object.entries(body).map(([key, value]) => {
    if (SENSITIVE_FIELDS.includes(key)) return `${key}: "***"`;
    const text = typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
    return `${key}: ${text && text.length > 40 ? text.slice(0, 40) + '…' : text}`;
  });
  return `{ ${parts.join(', ')} }`;
}

function requestLogger(req, res, next) {
  const startedAt = Date.now();

  // 'finish' fires after the response has been sent, so we know the status
  // code and req.body has already been parsed by express.json().
  res.on('finish', () => {
    const ms = Date.now() - startedAt;
    const type = (req.headers['content-type'] || 'none').split(';')[0];
    const icon = res.statusCode >= 500 ? '❌' : res.statusCode >= 400 ? '⚠️ ' : '✅';
    let line = `${icon} ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms} ms)`;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      line += ` | type: ${type} | body: ${summarizeBody(req.body)}`;
    }
    console.log(line);
  });

  next();
}

module.exports = { requestLogger };
