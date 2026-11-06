#!/usr/bin/env bash
# tests/lib.sh - shared helpers for the curl test suites.
# Sourced by tests/*.curl.sh; not meant to be run on its own.
#
# Provides:
#   BASE, JSON, TMP, PASS, FAIL
#   sql "<query>"            run a query against the app database (.env settings)
#   t name status text args  run curl, check status + body, print PASS/FAIL
#   check name condition     record a PASS/FAIL for a shell condition
#   section "title"          print a heading
#   finish                   print the totals and exit non-zero on failures
#   cleanup_test_data        remove everything created by the tests

set -u
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1   # always run from backend/

BASE="${1:-http://localhost:5000/api}"
JSON='Content-Type: application/json'
TMP="$(mktemp -d)"
# On Windows (Git Bash), curl.exe is a native Windows program. Git Bash only
# translates arguments that START with "/", so -F "file=@/tmp/x.png" would
# reach curl as an unusable Unix path. A mixed path (C:/Users/...) works for
# bash, curl and node alike.
if command -v cygpath >/dev/null 2>&1; then TMP="$(cygpath -m "$TMP")"; fi
PASS=0; FAIL=0

set -a; . ./.env; set +a
export MYSQL_PWD="$DB_PASSWORD"
sql() { mysql -u"$DB_USER" -h"$DB_HOST" -P"${DB_PORT:-3306}" "$DB_NAME" -N -e "$1"; }

# Test accounts use emails ending in @wms-test.local and departments named
# "ZZ Test ..."; cleanup removes exactly those (plus their uploaded files).
cleanup_test_data() {
  local files
  files=$(sql "SELECT e.profile_photo FROM employees e JOIN users u USING(user_id)
               WHERE u.email LIKE '%@wms-test.local' AND e.profile_photo IS NOT NULL" 2>/dev/null)
  for f in $files; do
    case "$f" in uploads/profiles/*) rm -f "./$f" ;; esac
  done
  sql "DELETE FROM sessions WHERE data LIKE '%@wms-test.local%';
       DELETE t FROM tasks t JOIN employees e ON e.employee_id = t.assigned_to
         JOIN users u ON u.user_id = e.user_id WHERE u.email LIKE '%@wms-test.local';
       DELETE e FROM employees e JOIN users u USING(user_id) WHERE u.email LIKE '%@wms-test.local';
       DELETE FROM users WHERE email LIKE '%@wms-test.local';
       DELETE FROM departments WHERE department_name LIKE 'ZZ Test%';" 2>/dev/null
}
trap 'cleanup_test_data; rm -rf "$TMP"' EXIT

pass_line() { PASS=$((PASS + 1)); printf '  \e[32mPASS\e[0m %-64s %s\n' "$1" "${2:-}"; }
fail_line() { FAIL=$((FAIL + 1)); printf '  \e[31mFAIL\e[0m %-64s %s\n' "$1" "${2:-}"; }

# t "name" EXPECTED_STATUS "text the body must contain" [curl args...]
# Also checks: JSON "success" matches the status (2xx -> true, else false),
# and no password hash ever appears in a response.
# The response body is kept in $TMP/body, headers in $TMP/headers.
t() {
  local name="$1" expected="$2" mustContain="$3"; shift 3
  local status body problems="" curl_exit
  : > "$TMP/body"; : > "$TMP/headers"   # never let a previous response leak into this test
  status=$(curl -s -S -D "$TMP/headers" -o "$TMP/body" -w '%{http_code}' "$@" 2>"$TMP/curl_error")
  curl_exit=$?
  body=$(cat "$TMP/body")

  # curl itself failed (file not found, connection refused...) - not a server answer
  [ "$curl_exit" -eq 0 ] || problems+=" curl error $curl_exit: $(cat "$TMP/curl_error");"
  [ "$status" = "$expected" ] || problems+=" status=$status (expected $expected);"
  [ -z "$mustContain" ] || [[ "$body" == *"$mustContain"* ]] || problems+=" body missing \"$mustContain\";"
  if grep -qi '^content-type: application/json' "$TMP/headers"; then
    if [[ "$expected" == 2* ]]; then
      [[ "$body" == *'"success":true'* ]] || problems+=' "success" should be true;'
    else
      [[ "$body" == *'"success":false'* ]] || problems+=' "success" should be false;'
    fi
  fi
  [[ "$body" != *password_hash* && "$body" != *'$2b$'* ]] || problems+=' PASSWORD HASH LEAKED;'

  if [ -z "$problems" ]; then
    pass_line "$name" "$status"
  else
    fail_line "$name" "$status"
    echo "         problems:$problems"
    echo "         body: ${body:0:300}"
  fi
}

# check "name" <command...>  -> PASS if the command succeeds
check() {
  local name="$1"; shift
  if "$@"; then pass_line "$name"; else fail_line "$name"; fi
}

# Value of a JSON field in the last response body, e.g. json_field employee_id
json_field() {
  node -e "const b=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
           const v=(b.data && b.data[process.argv[2]]); console.log(v === undefined || v === null ? '' : v)" \
    "$TMP/body" "$1"
}

section() { echo; echo "== $1"; }

require_server() {
  echo "Testing $BASE"
  if ! curl -s -o /dev/null "$BASE/health"; then
    echo "Cannot reach $BASE - start the server first (npm run dev)."; exit 1
  fi
  cleanup_test_data   # leftovers from an interrupted earlier run
}

finish() {
  echo
  echo "Result: $PASS passed, $FAIL failed"
  [ "$FAIL" -eq 0 ]
}
