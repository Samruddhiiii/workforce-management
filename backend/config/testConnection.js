// config/testConnection.js
// Stand-alone script: checks the MySQL connection and lists the tables.
// Run with:  npm run test-db

const pool = require('./db');
const { testConnection } = require('./db');

const EXPECTED_TABLES = [
  'attendance',
  'departments',
  'employee_documents',
  'employees',
  'tasks',
  'users',
];

(async () => {
  try {
    const info = await testConnection();
    console.log(`✅ Connected to MySQL ${info.version}`);
    console.log(`   Database: ${info.db}`);
    console.log(`   Server time: ${info.server_time}`);

    const [rows] = await pool.query('SHOW TABLES');
    // SHOW TABLES returns objects like { Tables_in_workforce_management: 'users' }
    const tables = rows.map((row) => Object.values(row)[0]);
    console.log(`   Tables: ${tables.join(', ') || '(none)'}`);

    const missing = EXPECTED_TABLES.filter((t) => !tables.includes(t));
    if (missing.length > 0) {
      console.log(`⚠️  Missing tables: ${missing.join(', ')} - run database/schema.sql`);
      process.exitCode = 1;
    } else {
      console.log('✅ All 6 application tables found');
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error.code || '', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end(); // close the pool so the script can exit
  }
})();
