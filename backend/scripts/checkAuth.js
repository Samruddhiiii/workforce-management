// scripts/checkAuth.js
// Automated checks for the /api/auth endpoints against the RUNNING server.
// It sends real HTTP requests (like Postman would) and verifies the status
// code and the JSON response shape of each one.
//
// Usage (start the server first with "npm run dev" in another terminal):
//   npm run check-auth
//   npm run check-auth -- --email admin@cdac.in --password "Admin@12345"
//
// Without --email/--password only the error cases are checked.
// With them, the full flow is checked: login -> /me -> logout -> /me.
// Nothing is written to the database.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true }); // works from any folder
const parseArgs = require('./parseArgs');

const args = parseArgs(process.argv.slice(2));
const BASE_URL = args.url || `http://localhost:${process.env.PORT || 5000}/api`;

let passed = 0;
let failed = 0;
let cookie = ''; // we keep the session cookie ourselves, like a browser does

// Sends one request and returns { status, body, headers }.
async function send(method, path, { json, rawBody, contentType } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;

  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (rawBody !== undefined) {
    if (contentType) headers['Content-Type'] = contentType;
    body = rawBody;
  }

  const response = await fetch(BASE_URL + path, { method, headers, body });

  // Remember the session cookie if the server sent one
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text; // not JSON - the check below will report it
  }
  return { status: response.status, body: parsed, headers: response.headers };
}

// Prints PASS/FAIL for one check.
function check(name, result, expectedStatus, extraCheck) {
  const problems = [];
  if (result.status !== expectedStatus) problems.push(`expected HTTP ${expectedStatus}, got ${result.status}`);
  if (typeof result.body !== 'object' || result.body === null) {
    problems.push('response is not JSON');
  } else {
    if (typeof result.body.success !== 'boolean') problems.push('missing "success" field');
    if (typeof result.body.message !== 'string') problems.push('missing "message" field');
    if (extraCheck) {
      const extraProblem = extraCheck(result.body, result);
      if (extraProblem) problems.push(extraProblem);
    }
  }

  if (problems.length === 0) {
    passed++;
    console.log(`  ✅ PASS  ${name}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL  ${name}`);
    problems.forEach((p) => console.log(`          - ${p}`));
    console.log(`          response: ${JSON.stringify(result.body)}`);
  }
}

(async () => {
  console.log(`Checking auth endpoints at ${BASE_URL}\n`);

  // 0. Is the server even running?
  try {
    const health = await send('GET', '/health');
    check('Server is running and DB is connected (GET /health)', health, 200);
  } catch (error) {
    console.log(`  ❌ Cannot reach ${BASE_URL} - is the server running? (npm run dev)`);
    console.log(`     ${error.cause ? error.cause.code : error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log('\nRequest-format mistakes:');
  check('GET /auth/login (wrong method) -> 405', await send('GET', '/auth/login'), 405);
  check('POST /login (wrong URL) -> 404', await send('POST', '/login', { json: {} }), 404);
  check('Empty body -> 400', await send('POST', '/auth/login', { rawBody: '' }), 400);
  check(
    'Body sent as Text, not JSON -> 415 with hint',
    await send('POST', '/auth/login', { rawBody: '{"email":"a@b.com","password":"x"}', contentType: 'text/plain' }),
    415,
    (b) => (b.message.includes('Text') ? null : 'message should mention the Text body type')
  );
  check(
    'Broken JSON -> 400',
    await send('POST', '/auth/login', { rawBody: '{"email":"a@b.com",}', contentType: 'application/json' }),
    400
  );
  check(
    'Missing password -> 400 naming the field',
    await send('POST', '/auth/login', { json: { email: 'a@b.com' } }),
    400,
    (b) => (b.message.includes('password') ? null : 'message should name the missing field')
  );

  console.log('\nCredential checks:');
  check(
    'Unknown email -> 401 generic message',
    await send('POST', '/auth/login', { json: { email: 'nobody@wms-check.local', password: 'Whatever123' } }),
    401,
    (b) => (b.message === 'Invalid email or password' ? null : 'message should be generic')
  );
  check('GET /auth/me without login -> 401', await send('GET', '/auth/me'), 401);

  if (args.email && args.password) {
    console.log(`\nFull login flow for ${args.email}:`);
    check(
      'Wrong password -> 401',
      await send('POST', '/auth/login', { json: { email: args.email, password: args.password + 'x' } }),
      401
    );

    const login = await send('POST', '/auth/login', { json: { email: args.email, password: args.password } });
    check('Correct login -> 200 with user data and cookie', login, 200, (b, r) => {
      if (!b.data || !b.data.user_id || !b.data.role) return 'data must contain user_id and role';
      if ('password_hash' in b.data || 'password' in b.data) return 'response must NOT contain the password hash';
      if (!r.headers.get('set-cookie')) return 'no session cookie was set';
      return null;
    });

    check('GET /auth/me after login -> 200, same user', await send('GET', '/auth/me'), 200, (b) =>
      b.data && login.body.data && b.data.user_id === login.body.data.user_id ? null : 'user_id does not match login'
    );
    check('POST /auth/logout -> 200', await send('POST', '/auth/logout'), 200);
    check('GET /auth/me after logout -> 401', await send('GET', '/auth/me'), 401);
  } else {
    console.log('\n(Skipping the full login flow - pass --email and --password to include it.)');
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
})();
