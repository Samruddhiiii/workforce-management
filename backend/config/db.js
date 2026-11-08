// config/db.js
// Creates ONE shared MySQL connection pool for the whole app.
// A pool keeps a few connections open and reuses them, which is much faster
// than opening a new connection for every request.

const mysql = require('mysql2/promise'); // promise API -> we can use async/await
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true }); // works from any folder

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true, // if all connections are busy, wait instead of failing
  connectionLimit: 10,      // max connections open at the same time
  queueLimit: 0,            // 0 = no limit on waiting requests

  // Return DATE / DATETIME columns as plain strings like "2026-11-06".
  // Without this, mysql2 converts them to JavaScript Date objects in UTC,
  // which can shift a date by one day (e.g. in India, UTC+5:30).
  dateStrings: true,
});

// Optional: run MySQL's clock (NOW(), CURDATE(), CURTIME()) in a fixed time
// zone, e.g. DB_TIMEZONE=+05:30 on Railway, whose MySQL server uses UTC.
// Not set (local development) -> the MySQL server's own time zone.
if (process.env.DB_TIMEZONE) {
  pool.pool.on('connection', (connection) => {
    connection.query('SET time_zone = ?', [process.env.DB_TIMEZONE], (error) => {
      if (error) console.error('⚠️  Could not set DB_TIMEZONE:', error.message);
    });
  });
}

// Runs a tiny query to prove the credentials and database are correct.
// server.js calls this at startup so a bad .env fails loudly and early.
async function testConnection() {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      'SELECT DATABASE() AS db, VERSION() AS version, NOW() AS server_time'
    );
    return rows[0];
  } finally {
    connection.release(); // always give the connection back to the pool
  }
}

module.exports = pool;
module.exports.testConnection = testConnection;
