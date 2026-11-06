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
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

// Checks the shared rules for passwords. Returns an error message or null.
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
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

// Name / phone rules for an employee profile (employees table limits).
function validateEmployeeFields({ first_name, last_name, phone }) {
  const errors = [];
  if (!first_name) errors.push('First name is required');
  else if (first_name.length > 50) errors.push('First name must be at most 50 characters');

  if (last_name && last_name.length > 50) errors.push('Last name must be at most 50 characters');

  if (phone && !/^[0-9+\-\s]{7,15}$/.test(phone)) {
    errors.push('Phone must be 7-15 characters: digits, spaces, + or -');
  }
  return errors;
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  cleanString,
  normalizeEmail,
  isValidEmail,
  toPositiveInt,
  validatePassword,
  validateCredentials,
  validateEmployeeFields,
};
