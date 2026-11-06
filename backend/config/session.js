// config/session.js
// Configures express-session and stores sessions in MySQL
// (table "sessions", created automatically by express-mysql-session).
//
// Why MySQL and not the default memory store?
//  - nodemon restarts the server every time you save a file; with memory
//    storage every user would be logged out on each restart.
//  - The memory store leaks memory and is not meant for production.

const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const pool = require('./db');

const isProduction = process.env.NODE_ENV === 'production';
const ONE_DAY_MS = 1000 * 60 * 60 * 24;

// Exported so logout can clear the cookie with exactly the same settings
// (a browser only deletes a cookie if name/path/options match).
const SESSION_COOKIE_NAME = 'wms.sid';
const cookieOptions = {
  httpOnly: true,                 // JavaScript in the browser cannot read the cookie
  sameSite: 'lax',                // basic CSRF protection; works for localhost:5173 -> :5000
  secure: isProduction,           // HTTPS-only cookie in production
  path: '/',
};

// Re-use our existing pool instead of opening a second set of connections.
const sessionStore = new MySQLStore(
  {
    createDatabaseTable: true,               // creates "sessions" if missing
    clearExpired: true,                      // deletes expired sessions...
    checkExpirationInterval: 1000 * 60 * 15, // ...every 15 minutes
    expiration: ONE_DAY_MS,                  // session rows live 1 day
  },
  pool
);

const sessionMiddleware = session({
  name: SESSION_COOKIE_NAME,        // cookie name (hides that we use express-session)
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,                    // don't re-save unchanged sessions
  saveUninitialized: false,         // don't create sessions for visitors who never log in
  rolling: true,                    // each request resets the 1-day countdown
  cookie: { ...cookieOptions, maxAge: ONE_DAY_MS },
});

module.exports = { sessionMiddleware, sessionStore, SESSION_COOKIE_NAME, cookieOptions };
