// scripts/createAdmin.js
// Creates an admin account from the command line
// (public registration can only create employees).
//
// Usage (from the backend folder):
//   npm run create-admin -- --email admin2@cdac.in --password "StrongPass123"
//
// Or put ADMIN_EMAIL and ADMIN_PASSWORD in .env and run:
//   npm run create-admin
//
// The password is hashed with bcrypt before it reaches MySQL.
// If the email already exists, nothing is changed
// (use "npm run set-password" to change an existing account's password).

require('dotenv').config({ quiet: true });

const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { DB_ROLE_ADMIN } = require('../utils/roles');
const { normalizeEmail, validateCredentials } = require('../utils/validators');
const parseArgs = require('./parseArgs');

(async () => {
  const args = parseArgs(process.argv.slice(2));

  // Command-line arguments win; .env is the fallback
  const email = normalizeEmail(args.email || process.env.ADMIN_EMAIL);
  const password = args.password || process.env.ADMIN_PASSWORD;

  try {
    const errors = validateCredentials({ email, password });
    if (errors.length > 0) {
      console.error('❌ Cannot create admin:');
      errors.forEach((e) => console.error(`   - ${e}`));
      console.error('\nUsage: npm run create-admin -- --email admin2@cdac.in --password "StrongPass123"');
      process.exitCode = 1;
      return;
    }

    const [existing] = await pool.query('SELECT user_id, role FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      console.log(`ℹ️  An account with ${email} already exists (role: ${existing[0].role}). Nothing changed.`);
      console.log('   To change its password use: npm run set-password -- --email <email> --password <new password>');
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
      [email, passwordHash, DB_ROLE_ADMIN]
    );

    console.log('✅ Admin account created');
    console.log(`   user_id: ${result.insertId}`);
    console.log(`   email:   ${email}`);
  } catch (error) {
    console.error('❌ Failed to create admin:', error.code || '', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
