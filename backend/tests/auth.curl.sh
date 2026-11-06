#!/usr/bin/env bash
# =====================================================================
# tests/auth.curl.sh - end-to-end tests for /api/auth using curl
#
# Run from the backend folder in Git Bash (VS Code terminal -> "Git Bash"),
# with the server already running (npm run dev):
#
#   bash tests/auth.curl.sh                       # uses http://localhost:5000/api
#   bash tests/auth.curl.sh http://localhost:5055/api
#
# What it does:
#   1. Creates temporary test accounts (emails ending in @wms-test.local):
#      an admin, a Manager (to check Manager -> employee mapping) and
#      employees registered through the API.
#   2. Sends real HTTP requests with curl and checks the status code AND
#      the response body of each one.
#   3. Deletes every test account and test session at the end, even if a
#      test fails. Your real data is never touched.
#
# Needs: curl, mysql (MySQL client on PATH), node. Reads DB settings from .env.
# =====================================================================

set -u
cd "$(dirname "$0")/.." || exit 1          # run from backend/

BASE="${1:-http://localhost:5000/api}"
AUTH="$BASE/auth"
JSON='Content-Type: application/json'
TMP="$(mktemp -d)"
PASS=0; FAIL=0

# --- database helper (credentials from .env, password via env var) ----
set -a; . ./.env; set +a
export MYSQL_PWD="$DB_PASSWORD"
sql() { mysql -u"$DB_USER" -h"$DB_HOST" -P"${DB_PORT:-3306}" "$DB_NAME" -N -e "$1"; }

cleanup() {
  sql "DELETE FROM sessions WHERE data LIKE '%@wms-test.local%';
       DELETE e FROM employees e JOIN users u USING(user_id) WHERE u.email LIKE '%@wms-test.local';
       DELETE FROM users WHERE email LIKE '%@wms-test.local';" 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT

# --- test helper ------------------------------------------------------
# t "name" EXPECTED_STATUS "text the body must contain" [curl args...]
# Also checks: response is JSON with a boolean "success" that matches the
# status (2xx -> true, otherwise false), and that no password hash leaks.
t() {
  local name="$1" expected="$2" mustContain="$3"; shift 3
  local status body problems=""
  status=$(curl -s -o "$TMP/body" -w '%{http_code}' "$@")
  body=$(cat "$TMP/body")

  [ "$status" = "$expected" ] || problems+=" status=$status (expected $expected);"
  [ -z "$mustContain" ] || [[ "$body" == *"$mustContain"* ]] || problems+=" body missing \"$mustContain\";"
  if [[ "$expected" == 2* ]]; then
    [[ "$body" == *'"success":true'* ]] || problems+=' "success" should be true;'
  else
    [[ "$body" == *'"success":false'* ]] || problems+=' "success" should be false;'
  fi
  [[ "$body" != *password_hash* && "$body" != *'$2b$'* ]] || problems+=' PASSWORD HASH LEAKED;'

  if [ -z "$problems" ]; then
    PASS=$((PASS + 1)); printf '  \e[32mPASS\e[0m %-62s %s\n' "$name" "$status"
  else
    FAIL=$((FAIL + 1)); printf '  \e[31mFAIL\e[0m %-62s %s\n' "$name" "$status"
    echo "         problems:$problems"
    echo "         body: ${body:0:300}"
  fi
}

section() { echo; echo "== $1"; }

# --- preconditions ----------------------------------------------------
echo "Testing $AUTH"
if ! curl -s -o /dev/null "$BASE/health"; then
  echo "Cannot reach $BASE - start the server first (npm run dev)."; exit 1
fi
cleanup; TMP="$(mktemp -d)"   # remove leftovers from an interrupted earlier run

# --- test accounts ----------------------------------------------------
ADMIN_EMAIL=admin@wms-test.local;   ADMIN_PW='AdminPass123'
EMP_EMAIL=emp@wms-test.local;       EMP_PW='EmpPass12345'
MGR_EMAIL=manager@wms-test.local;   MGR_PW='MgrPass12345'
npm run -s create-admin -- --email "$ADMIN_EMAIL" --password "$ADMIN_PW" >/dev/null
MGR_HASH=$(node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 10))" "$MGR_PW")
DEPT_ID=$(sql "SELECT MIN(department_id) FROM departments")
sql "INSERT INTO users (email, password_hash, role) VALUES ('$MGR_EMAIL', '$MGR_HASH', 'Manager');
     INSERT INTO employees (user_id, department_id, first_name, employment_status)
     SELECT user_id, $DEPT_ID, 'Test Manager', 'Active' FROM users WHERE email = '$MGR_EMAIL';"

# =====================================================================
section "Registration"
t "R01 register with first_name/last_name"            201 '"role":"employee"' \
  -X POST "$AUTH/register" -H "$JSON" \
  -d "{\"first_name\":\"Emp\",\"last_name\":\"Tester\",\"email\":\"$EMP_EMAIL\",\"password\":\"$EMP_PW\",\"department_id\":$DEPT_ID}"
t "R02 register with full_name + phone (+91) style"    201 '"full_name":"Asha Rao Kulkarni"' \
  -X POST "$AUTH/register" -H "$JSON" \
  -d "{\"full_name\":\"Asha Rao Kulkarni\",\"email\":\"asha@wms-test.local\",\"password\":\"AshaPass123\",\"department_id\":\"$DEPT_ID\",\"phone\":\"(+91) 98765-43210\"}"
STORED=$(sql "SELECT CONCAT(e.first_name,'|',e.last_name,'|',e.phone) FROM employees e JOIN users u USING(user_id) WHERE u.email='asha@wms-test.local'")
t "R03 injected role:Admin is ignored"                 201 '"role":"employee"' \
  -X POST "$AUTH/register" -H "$JSON" \
  -d "{\"first_name\":\"Sneaky\",\"email\":\"sneaky@wms-test.local\",\"password\":\"Sneaky12345\",\"department_id\":$DEPT_ID,\"role\":\"Admin\"}"
SNEAKY_ROLE=$(sql "SELECT role FROM users WHERE email='sneaky@wms-test.local'")
t "R04 duplicate email (different case) -> 409"       409 'already exists' \
  -X POST "$AUTH/register" -H "$JSON" \
  -d "{\"first_name\":\"Dup\",\"email\":\"EMP@WMS-TEST.local\",\"password\":\"$EMP_PW\",\"department_id\":$DEPT_ID}"
t "R05 missing department_id -> 400"                   400 'department_id is required' \
  -X POST "$AUTH/register" -H "$JSON" \
  -d '{"first_name":"NoDept","email":"nodept@wms-test.local","password":"Password123"}'
t "R06 department that does not exist -> 400"          400 'does not exist' \
  -X POST "$AUTH/register" -H "$JSON" \
  -d '{"first_name":"X","email":"x@wms-test.local","password":"Password123","department_id":99999}'
t "R07 password shorter than 8 characters -> 400"      400 'at least 8' \
  -X POST "$AUTH/register" -H "$JSON" \
  -d "{\"first_name\":\"X\",\"email\":\"x@wms-test.local\",\"password\":\"short\",\"department_id\":$DEPT_ID}"
t "R08 password of only spaces -> 400"                 400 'only spaces' \
  -X POST "$AUTH/register" -H "$JSON" \
  -d "{\"first_name\":\"X\",\"email\":\"x@wms-test.local\",\"password\":\"          \",\"department_id\":$DEPT_ID}"
t "R09 invalid email + bad phone -> 400 lists both"    400 'valid email address' \
  -X POST "$AUTH/register" -H "$JSON" \
  -d "{\"first_name\":\"X\",\"email\":\"not-an-email\",\"password\":\"Password123\",\"department_id\":$DEPT_ID,\"phone\":\"call me\"}"
t "R10 email sent as a number -> 400 type error"       400 '\"email\" must be text' \
  -X POST "$AUTH/register" -H "$JSON" \
  -d "{\"first_name\":\"X\",\"email\":123,\"password\":\"Password123\",\"department_id\":$DEPT_ID}"
t "R11 form-urlencoded body -> 415 (JSON only)"        415 'x-www-form-urlencoded' \
  -X POST "$AUTH/register" -d "first_name=F&email=f@wms-test.local&password=Password123&department_id=$DEPT_ID"
t "R12 JSON array body -> 400"                         400 'not an array' \
  -X POST "$AUTH/register" -H "$JSON" -d '[]'

# =====================================================================
section "Login - credentials and request format"
t "L01 valid employee login -> 200 + cookie"           200 '"role":"employee"' \
  -c "$TMP/emp" -X POST "$AUTH/login" -H "$JSON" -d "{\"email\":\"$EMP_EMAIL\",\"password\":\"$EMP_PW\"}"
t "L02 valid admin login -> 200"                       200 '"role":"admin"' \
  -c "$TMP/admin" -X POST "$AUTH/login" -H "$JSON" -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PW\"}"
t "L03 Manager account logs in as employee"            200 '"role":"employee"' \
  -c "$TMP/mgr" -X POST "$AUTH/login" -H "$JSON" -d "{\"email\":\"$MGR_EMAIL\",\"password\":\"$MGR_PW\"}"
t "L04 email with spaces + capitals still works"       200 '"role":"employee"' \
  -X POST "$AUTH/login" -H "$JSON" -d "{\"email\":\"  EMP@WMS-Test.Local \",\"password\":\"$EMP_PW\"}"
t "L05 wrong password -> 401 generic"                  401 'Invalid email or password' \
  -X POST "$AUTH/login" -H "$JSON" -d "{\"email\":\"$EMP_EMAIL\",\"password\":\"WrongPass999\"}"
t "L06 unknown email -> 401 same message"              401 'Invalid email or password' \
  -X POST "$AUTH/login" -H "$JSON" -d '{"email":"ghost@wms-test.local","password":"WrongPass999"}'
t "L07 legacy placeholder password can't log in"       401 'Invalid email or password' \
  -X POST "$AUTH/login" -H "$JSON" -d '{"email":"manager.it@cdac.in","password":"TEMP"}'
t "L08 missing password -> 400 names the field"        400 'Missing password' \
  -X POST "$AUTH/login" -H "$JSON" -d "{\"email\":\"$EMP_EMAIL\"}"
t "L09 empty body -> 400 lists both fields"            400 'Missing email and password' \
  -X POST "$AUTH/login" -H "$JSON"
t "L10 password sent as a number -> 400 type error"    400 '\"password\" must be text' \
  -X POST "$AUTH/login" -H "$JSON" -d "{\"email\":\"$EMP_EMAIL\",\"password\":12345678}"
t "L11 email as an object (injection attempt) -> 400"  400 '\"email\" must be text' \
  -X POST "$AUTH/login" -H "$JSON" -d '{"email":{"$ne":""},"password":"x"}'
t "L12 malformed JSON (trailing comma) -> 400"         400 'Invalid JSON' \
  -X POST "$AUTH/login" -H "$JSON" -d "{\"email\":\"$EMP_EMAIL\",}"
t "L13 Postman 'Text' body -> 415 with hint"           415 'from Text to JSON' \
  -X POST "$AUTH/login" -H 'Content-Type: text/plain' -d "{\"email\":\"$EMP_EMAIL\",\"password\":\"$EMP_PW\"}"
t "L14 form-data body -> 415 with hint"                415 'form-data' \
  -X POST "$AUTH/login" -F "email=$EMP_EMAIL" -F "password=$EMP_PW"
t "L15 GET instead of POST -> 405"                     405 'Use POST' "$AUTH/login"
t "L16 login with a planted cookie gets a NEW session" 200 'Login successful' \
  -D "$TMP/fixation_headers" -H 'Cookie: wms.sid=s%3Aattacker-chosen-id.fake' \
  -X POST "$AUTH/login" -H "$JSON" -d "{\"email\":\"$EMP_EMAIL\",\"password\":\"$EMP_PW\"}"

# =====================================================================
section "Protected endpoints - sessions, headers, roles"
t "P01 /me with employee session -> 200"               200 "\"email\":\"$EMP_EMAIL\"" -b "$TMP/emp" "$AUTH/me"
t "P02 /me with admin session -> 200, no employee_id"  200 '"employee_id":null' -b "$TMP/admin" "$AUTH/me"
t "P03 /me with no cookie -> 401"                      401 'not logged in' "$AUTH/me"
t "P04 /me with Bearer token header -> 401 + hint"     401 'session cookies, not tokens' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.fake.token' "$AUTH/me"
t "P05 /me with Basic auth header -> 401 + hint"       401 'session cookies, not tokens' \
  -u "$EMP_EMAIL:$EMP_PW" "$AUTH/me"
t "P06 /me with tampered cookie -> 401"                401 'expired or is no longer valid' \
  -H 'Cookie: wms.sid=s%3Aforged-session-id.bad-signature' "$AUTH/me"
t "P07 create admin as employee -> 403 names role"     403 'You are logged in as emp@wms-test.local (employee)' \
  -b "$TMP/emp" -X POST "$AUTH/admins" -H "$JSON" -d '{"email":"evil@wms-test.local","password":"Password123"}'
t "P08 create admin as Manager -> 403"                 403 'requires the admin role' \
  -b "$TMP/mgr" -X POST "$AUTH/admins" -H "$JSON" -d '{"email":"evil@wms-test.local","password":"Password123"}'
t "P09 create admin with no session -> 401"            401 'not logged in' \
  -X POST "$AUTH/admins" -H "$JSON" -d '{"email":"evil@wms-test.local","password":"Password123"}'
t "P10 create admin as admin -> 201"                   201 '"role":"admin"' \
  -b "$TMP/admin" -X POST "$AUTH/admins" -H "$JSON" -d '{"email":"admin2@wms-test.local","password":"Admin2Pass123"}'
t "P11 create admin as admin, bad body -> 400"         400 'valid email address' \
  -b "$TMP/admin" -X POST "$AUTH/admins" -H "$JSON" -d '{"email":"nope","password":"Password123"}'
t "P12 new admin can log in"                           200 '"role":"admin"' \
  -X POST "$AUTH/login" -H "$JSON" -d '{"email":"admin2@wms-test.local","password":"Admin2Pass123"}'

# =====================================================================
section "Session lifecycle - expiry, deactivation, logout"
sql "UPDATE sessions SET expires = UNIX_TIMESTAMP() - 60 WHERE data LIKE '%\"email\":\"$ADMIN_EMAIL\"%'"
t "S01 expired session -> 401 'expired'"               401 'expired or is no longer valid' -b "$TMP/admin" "$AUTH/me"
sql "UPDATE employees e JOIN users u USING(user_id) SET e.employment_status='Inactive' WHERE u.email='$EMP_EMAIL'"
t "S02 deactivated employee's live session -> 401"     401 'deactivated' -b "$TMP/emp" "$AUTH/me"
t "S03 deactivated employee can't log in -> 403"       403 'deactivated' \
  -X POST "$AUTH/login" -H "$JSON" -d "{\"email\":\"$EMP_EMAIL\",\"password\":\"$EMP_PW\"}"
t "S04 deactivated + wrong password -> 401 (no leak)"  401 'Invalid email or password' \
  -X POST "$AUTH/login" -H "$JSON" -d "{\"email\":\"$EMP_EMAIL\",\"password\":\"WrongPass999\"}"
t "S05 logout with valid session -> 200"               200 'Logged out successfully' -b "$TMP/mgr" -c "$TMP/mgr" -X POST "$AUTH/logout"
t "S06 /me after logout -> 401"                        401 '' -b "$TMP/mgr" "$AUTH/me"
t "S07 logout again (no session) -> 200 idempotent"    200 'already logged out' -X POST "$AUTH/logout"

# =====================================================================
section "Extra checks"
# R02: full_name split and phone normalised in the database
if [ "$STORED" = "Asha|Rao Kulkarni|+919876543210" ]; then PASS=$((PASS+1)); echo "  PASS X01 full_name split + phone normalised in DB ($STORED)";
else FAIL=$((FAIL+1)); echo "  FAIL X01 full_name/phone stored as: $STORED"; fi
# R03: role in the database really is Employee
if [ "$SNEAKY_ROLE" = "Employee" ]; then PASS=$((PASS+1)); echo "  PASS X02 injected role stored as Employee";
else FAIL=$((FAIL+1)); echo "  FAIL X02 injected role stored as: $SNEAKY_ROLE"; fi
# L16: session fixation - the planted id must not be the one the server uses
if grep -qi 'set-cookie: wms.sid=' "$TMP/fixation_headers" && ! grep -qi 'attacker-chosen-id' "$TMP/fixation_headers"; then
  PASS=$((PASS+1)); echo "  PASS X03 login issues a fresh session id (fixation blocked)"
else FAIL=$((FAIL+1)); echo "  FAIL X03 session fixation check"; fi
# Cookie flags
if grep -qi 'httponly' "$TMP/fixation_headers" && grep -qi 'samesite=lax' "$TMP/fixation_headers"; then
  PASS=$((PASS+1)); echo "  PASS X04 cookie is HttpOnly + SameSite=Lax"
else FAIL=$((FAIL+1)); echo "  FAIL X04 cookie flags"; fi
# CORS: allowed origin vs foreign origin
ALLOWED=$(curl -s -i -X OPTIONS -H "Origin: ${CLIENT_URL%%,*}" -H 'Access-Control-Request-Method: POST' "$AUTH/login" | grep -ci 'access-control-allow-credentials: true')
FOREIGN=$(curl -s -i -X OPTIONS -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST' "$AUTH/login" | grep -ci 'access-control-allow-origin: https://evil.example')
if [ "$ALLOWED" = "1" ] && [ "$FOREIGN" = "0" ]; then PASS=$((PASS+1)); echo "  PASS X05 CORS allows CLIENT_URL with credentials, rejects other origins";
else FAIL=$((FAIL+1)); echo "  FAIL X05 CORS (allowed=$ALLOWED foreign=$FOREIGN)"; fi

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
