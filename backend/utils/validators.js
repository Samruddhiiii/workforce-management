// utils/validators.js
// Small, reusable input-validation helpers used by many controllers.
// Keeping them in one place means every endpoint validates the same way.
// Length limits match the column sizes in your existing tables.

// A practical email check: something@something.something, no spaces.
// (A "perfect" email regex is huge; this is the common, sensible version.)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MIN_PASSWORD_LENGTH = 8;

// Returns a trimmed string, or '' for null/undefined/non-string values.
// Prevents crashes like "Cannot read properties of undefined (reading 'trim')".
function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Emails are case-insensitive, so we always store/compare them in lowercase.
function normalizeEmail(value) {
  return cleanString(value).toLowerCase();
}

function isValidEmail(email) {
  return EMAIL_REGEX.test(email) && email.length <= 100; // users.email is VARCHAR(100)
}

// Turns "5" or 5 into 5; anything that is not a positive whole number -> null.
// Used for IDs coming from URLs, forms and query strings.
function toPositiveInt(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

// Checks that every listed field is either absent or a string.
// Without this, {"password": 12345678} (a number) or {"email": {...}} (an object)
// would be treated as "missing", which gives a confusing error message.
// Returns an array of error messages.
function checkStringFields(body, fieldNames) {
  const errors = [];
  for (const field of fieldNames) {
    const value = body[field];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      errors.push(`"${field}" must be text in double quotes, e.g. "${field}": "value"`);
    }
  }
  return errors;
}

// Phone numbers arrive in many styles: "98765 43210", "(+91) 98765-43210",
// or even as a JSON number. We remove spaces, dashes, dots and brackets and
// store just an optional "+" and digits, e.g. "+919876543210".
// Returns { phone, error } - phone is null when nothing was sent.
function normalizePhone(value) {
  if (value === undefined || value === null || value === '') return { phone: null, error: null };
  if (typeof value !== 'string' && typeof value !== 'number') {
    return { phone: null, error: 'Phone must be text, e.g. "phone": "9876543210"' };
  }
  const phone = String(value).replace(/[\s\-().]/g, '');
  if (phone === '') return { phone: null, error: null };
  // employees.phone is VARCHAR(15): "+" plus up to 14 digits
  if (!/^\+?\d{7,14}$/.test(phone)) {
    return { phone: null, error: 'Phone must contain 7-14 digits (an optional + at the start is allowed)' };
  }
  return { phone, error: null };
}

// "Rahul Kumar Verma" -> { first_name: "Rahul", last_name: "Kumar Verma" }
// Lets clients send a single full_name instead of first_name + last_name.
function splitFullName(fullName) {
  const parts = cleanString(fullName).split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' ') || null,
  };
}

// Checks the shared rules for passwords. Returns an error message or null.
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
  }
  if (password.trim() === '') {
    return 'Password cannot be only spaces';
  }
  // bcrypt only uses the first 72 bytes; longer passwords give a false sense of security
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return 'Password must be at most 72 characters long';
  }
  return null;
}

// Email + password rules shared by every kind of account.
// Returns an array of error messages (empty array = valid).
function validateCredentials({ email, password }) {
  const errors = [];
  if (!email) errors.push('Email is required');
  else if (!isValidEmail(email)) errors.push('Please enter a valid email address');

  const passwordError = validatePassword(password);
  if (passwordError) errors.push(passwordError);
  return errors;
}

// Name rules for an employee profile (employees table limits).
function validateEmployeeName({ first_name, last_name }) {
  const errors = [];
  if (!first_name) errors.push('First name is required (send "first_name", or "full_name")');
  else if (first_name.length > 50) errors.push('First name must be at most 50 characters');

  if (last_name && last_name.length > 50) errors.push('Last name must be at most 50 characters');
  return errors;
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  cleanString,
  normalizeEmail,
  isValidEmail,
  toPositiveInt,
  checkStringFields,
  normalizePhone,
  splitFullName,
  validatePassword,
  validateCredentials,
  validateEmployeeName,
};
