// scripts/setPassword.js
// Sets (or resets) the password of an EXISTING account.
//
// Why this exists: the sample users already in your database have
// placeholder text in password_hash (not real bcrypt hashes), so nobody
// can log in with them until a real password is set.
//
// Usage (from the backend folder):
//   npm run set-password -- --email admin@cdac.in --password "Admin@12345"
//
// The password is hashed with bcrypt; the plain text is never stored.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true }); // works from any folder

const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { normalizeEmail, validateCredentials } = require('../utils/validators');
const parseArgs = require('./parseArgs');

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const email = normalizeEmail(args.email);
  const password = args.password;

  try {
    const errors = validateCredentials({ email, password });
    if (errors.length > 0) {
      console.error('❌ Cannot set password:');
      errors.forEach((e) => console.error(`   - ${e}`));
      console.error('\nUsage: npm run set-password -- --email admin@cdac.in --password "Admin@12345"');
      process.exitCode = 1;
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query('UPDATE users SET password_hash = ? WHERE email = ?', [passwordHash, email]);

    if (result.affectedRows === 0) {
      console.error(`❌ No account found with email ${email}`);
      process.exitCode = 1;
      return;
    }
    console.log(`✅ Password updated for ${email}`);
  } catch (error) {
    console.error('❌ Failed to set password:', error.code || '', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
