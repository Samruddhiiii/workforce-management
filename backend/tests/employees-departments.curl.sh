#!/usr/bin/env bash
# =====================================================================
# tests/employees-departments.curl.sh
# Phase 4 Part 1: Departments, Employees, profile-photo uploads, /api/files
#
# Run from the backend folder in Git Bash, with the server running:
#   bash tests/employees-departments.curl.sh                 # localhost:5000
#   bash tests/employees-departments.curl.sh http://localhost:5055/api
#
# Creates temporary accounts (@wms-test.local) and departments ("ZZ Test ..."),
# and removes them - including uploaded test photos - at the end.
# =====================================================================

. "$(dirname "$0")/lib.sh"
require_server
API="$BASE"
PROFILE_DIR="uploads/profiles"
FILES_BEFORE=$(ls "$PROFILE_DIR" | grep -v '^.gitkeep$' | wc -l)

# --- test files --------------------------------------------------------
node -e '
const fs = require("fs"), dir = process.argv[1];
// smallest valid PNG (1x1 pixel)
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
fs.writeFileSync(dir + "/photo.png", png);
fs.writeFileSync(dir + "/photo2.jpg", Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]), Buffer.alloc(200, 1)]));
fs.writeFileSync(dir + "/fake.png", "<script>alert(1)</script> this is not an image");
fs.writeFileSync(dir + "/virus.exe", Buffer.from("MZ fake executable"));
fs.writeFileSync(dir + "/big.png", Buffer.concat([png.subarray(0, 8), Buffer.alloc(3 * 1024 * 1024)]));
fs.writeFileSync(dir + "/doc.pdf", "%PDF-1.4 tiny");
' "$TMP"

# --- accounts ----------------------------------------------------------
ADMIN=admin@wms-test.local; ADMIN_PW='AdminPass123'
npm run -s create-admin -- --email "$ADMIN" --password "$ADMIN_PW" >/dev/null
DEPT_ID=$(sql "SELECT MIN(department_id) FROM departments")

curl -s -o /dev/null -X POST "$API/auth/register" -H "$JSON" \
  -d "{\"first_name\":\"Alice\",\"last_name\":\"Test\",\"email\":\"alice@wms-test.local\",\"password\":\"AlicePass123\",\"department_id\":$DEPT_ID}"
curl -s -o /dev/null -X POST "$API/auth/register" -H "$JSON" \
  -d "{\"first_name\":\"Bob\",\"last_name\":\"Test\",\"email\":\"bob@wms-test.local\",\"password\":\"BobPass12345\",\"department_id\":$DEPT_ID}"
login() { curl -s -o /dev/null -c "$TMP/$1" -X POST "$API/auth/login" -H "$JSON" -d "{\"email\":\"$2\",\"password\":\"$3\"}"; }
login admin "$ADMIN" "$ADMIN_PW"
login alice alice@wms-test.local AlicePass123
login bob bob@wms-test.local BobPass12345
ALICE_ID=$(sql "SELECT e.employee_id FROM employees e JOIN users u USING(user_id) WHERE u.email='alice@wms-test.local'")
BOB_ID=$(sql "SELECT e.employee_id FROM employees e JOIN users u USING(user_id) WHERE u.email='bob@wms-test.local'")

# =====================================================================
section "Departments"
t "D01 GET list is public (needed by the sign-up form)"      200 '"department_name"' "$API/departments"
t "D02 admin creates a department"                           201 '"ZZ Test Research"' \
  -b "$TMP/admin" -X POST "$API/departments" -H "$JSON" -d '{"department_name":"ZZ Test Research","description":"R&D"}'
NEW_DEPT=$(json_field department_id)
t "D03 duplicate name, different case -> 409"                409 'already exists' \
  -b "$TMP/admin" -X POST "$API/departments" -H "$JSON" -d '{"department_name":"zz test research"}'
t "D04 missing department_name -> 400"                       400 'department_name is required' \
  -b "$TMP/admin" -X POST "$API/departments" -H "$JSON" -d '{"description":"no name"}'
t "D05 employee cannot create -> 403"                        403 'requires the admin role' \
  -b "$TMP/alice" -X POST "$API/departments" -H "$JSON" -d '{"department_name":"ZZ Test Hack"}'
t "D06 no session cannot create -> 401"                      401 'not logged in' \
  -X POST "$API/departments" -H "$JSON" -d '{"department_name":"ZZ Test Hack"}'
t "D07 admin renames it"                                     200 '"ZZ Test R&D"' \
  -b "$TMP/admin" -X PUT "$API/departments/$NEW_DEPT" -H "$JSON" -d '{"department_name":"ZZ Test R&D","description":"Research"}'
t "D08 rename a department that doesn't exist -> 404"        404 'Department not found' \
  -b "$TMP/admin" -X PUT "$API/departments/999999" -H "$JSON" -d '{"department_name":"ZZ Test Ghost"}'
t "D09 non-numeric id -> 400"                                400 'Invalid department id' \
  -b "$TMP/admin" -X PUT "$API/departments/abc" -H "$JSON" -d '{"department_name":"ZZ Test X"}'
t "D10 PATCH is not supported -> 405"                        405 'Use PUT or DELETE' \
  -b "$TMP/admin" -X PATCH "$API/departments/$NEW_DEPT"

# =====================================================================
section "Employees - admin"
t "E01 admin creates an employee in the new department"      201 '"department_name":"ZZ Test R&D"' \
  -b "$TMP/admin" -X POST "$API/employees" -H "$JSON" \
  -d "{\"full_name\":\"Carol Test Kumar\",\"email\":\"carol@wms-test.local\",\"password\":\"CarolPass123\",\"department_id\":$NEW_DEPT,\"designation\":\"Analyst\",\"phone\":\"98765 43210\",\"date_of_joining\":\"2026-01-15\"}"
CAROL_ID=$(json_field employee_id)
CAROL_ROW=$(sql "SELECT CONCAT(u.role,'|',e.first_name,'|',e.last_name,'|',e.phone,'|',e.date_of_joining,'|',e.employment_status) FROM employees e JOIN users u USING(user_id) WHERE e.employee_id=$CAROL_ID")
check "E02 stored as Employee, name split, phone normalised ($CAROL_ROW)" \
  test "$CAROL_ROW" = "Employee|Carol|Test Kumar|9876543210|2026-01-15|Active"
t "E03 new employee can log in"                              200 '"role":"employee"' \
  -c "$TMP/carol" -X POST "$API/auth/login" -H "$JSON" -d '{"email":"carol@wms-test.local","password":"CarolPass123"}'
t "D11 delete a department that has an employee -> 409"      409 'still assigned' \
  -b "$TMP/admin" -X DELETE "$API/departments/$NEW_DEPT"
t "E04 duplicate email -> 409"                               409 'already exists' \
  -b "$TMP/admin" -X POST "$API/employees" -H "$JSON" \
  -d "{\"first_name\":\"Dup\",\"email\":\"carol@wms-test.local\",\"password\":\"Password123\",\"department_id\":$DEPT_ID}"
t "E05 missing required fields -> 400 lists them"            400 'Email is required' \
  -b "$TMP/admin" -X POST "$API/employees" -H "$JSON" -d '{"designation":"Nobody"}'
t "E06 impossible date 2026-02-30 -> 400"                    400 'valid date' \
  -b "$TMP/admin" -X POST "$API/employees" -H "$JSON" \
  -d "{\"first_name\":\"Dan\",\"email\":\"dan@wms-test.local\",\"password\":\"Password123\",\"department_id\":$DEPT_ID,\"date_of_joining\":\"2026-02-30\"}"
t "E07 list all employees"                                   200 'carol@wms-test.local' -b "$TMP/admin" "$API/employees"
t "E08 search by name (case-insensitive)"                    200 '"1 employee(s) found"' \
  -b "$TMP/admin" "$API/employees?search=carol%20test"
t "E09 search with % is literal, not a wildcard"             200 '"0 employee(s) found"' \
  -b "$TMP/admin" "$API/employees?search=%25"
t "E10 filter by department"                                 200 '"1 employee(s) found"' \
  -b "$TMP/admin" "$API/employees?department_id=$NEW_DEPT"
t "E11 invalid status filter -> 400"                         400 'status must be' \
  -b "$TMP/admin" "$API/employees?status=Gone"
t "E12 view one employee with stats"                         200 '"stats"' -b "$TMP/admin" "$API/employees/$CAROL_ID"
t "E13 view an employee that doesn't exist -> 404"           404 'Employee not found' -b "$TMP/admin" "$API/employees/999999"
t "E14 partial update: designation + department"             200 '"designation":"Senior Analyst"' \
  -b "$TMP/admin" -X PUT "$API/employees/$CAROL_ID" -H "$JSON" -d "{\"designation\":\"Senior Analyst\",\"department_id\":$DEPT_ID}"
t "E15 change email to one already used -> 409"              409 'already uses this email' \
  -b "$TMP/admin" -X PUT "$API/employees/$CAROL_ID" -H "$JSON" -d '{"email":"alice@wms-test.local"}'
t "E16 update with nothing editable -> 400"                  400 'Nothing to update' \
  -b "$TMP/admin" -X PUT "$API/employees/$CAROL_ID" -H "$JSON" -d '{"role":"Admin"}'
t "E17 deactivate (DELETE) -> Inactive"                      200 '"employment_status":"Inactive"' \
  -b "$TMP/admin" -X DELETE "$API/employees/$CAROL_ID"
t "E18 deactivated employee's session stops working"         401 'deactivated' -b "$TMP/carol" "$API/auth/me"
t "E19 deactivate again -> already inactive"                 200 'already inactive' -b "$TMP/admin" -X DELETE "$API/employees/$CAROL_ID"
t "E20 reactivate via PUT employment_status"                 200 '"employment_status":"Active"' \
  -b "$TMP/admin" -X PUT "$API/employees/$CAROL_ID" -H "$JSON" -d '{"employment_status":"Active"}'
t "E21 employee cannot list employees -> 403"                403 'requires the admin role' -b "$TMP/alice" "$API/employees"
t "E22 employee cannot read another profile by id -> 403"    403 'requires the admin role' -b "$TMP/alice" "$API/employees/$BOB_ID"

section "Departments - delete rules"
t "D12 delete the test department once it is empty -> 200"   200 'Department deleted' \
  -b "$TMP/admin" -X DELETE "$API/departments/$NEW_DEPT"
t "D13 delete it again -> 404"                               404 'Department not found' \
  -b "$TMP/admin" -X DELETE "$API/departments/$NEW_DEPT"

# =====================================================================
section "Employees - own profile (/me)"
t "M01 employee reads own profile"                           200 '"email":"alice@wms-test.local"' -b "$TMP/alice" "$API/employees/me"
t "M02 admin has no employee profile -> 403"                 403 'requires the employee role' -b "$TMP/admin" "$API/employees/me"
t "M03 no session -> 401"                                    401 'not logged in' "$API/employees/me"
t "M04 update phone + address (JSON)"                        200 '"address":"12 MG Road, Pune"' \
  -b "$TMP/alice" -X PUT "$API/employees/me" -H "$JSON" -d '{"phone":"+91 98765 11111","address":"12 MG Road, Pune"}'
t "M05 forbidden fields are ignored and reported"            200 'Ignored fields you cannot change yourself: email, role, department_id, employment_status' \
  -b "$TMP/alice" -X PUT "$API/employees/me" -H "$JSON" \
  -d '{"first_name":"Alicia","email":"hacker@wms-test.local","role":"Admin","department_id":999,"employment_status":"Inactive"}'
ALICE_ROW=$(sql "SELECT CONCAT(u.email,'|',u.role,'|',e.department_id,'|',e.employment_status,'|',e.first_name) FROM employees e JOIN users u USING(user_id) WHERE e.employee_id=$ALICE_ID")
check "M06 DB unchanged except first_name ($ALICE_ROW)" test "$ALICE_ROW" = "alice@wms-test.local|Employee|$DEPT_ID|Active|Alicia"
t "M07 nothing editable sent -> 400"                         400 'Nothing to update' \
  -b "$TMP/alice" -X PUT "$API/employees/me" -H "$JSON" -d '{"designation":"CEO"}'
t "M08 Text body -> 415"                                     415 'Text' \
  -b "$TMP/alice" -X PUT "$API/employees/me" -H 'Content-Type: text/plain' -d '{"phone":"123"}'

section "Profile photo upload + secure file serving"
t "M09 upload a PNG profile photo (form-data)"               200 '"profile_photo_url":"/api/files/profiles/' \
  -b "$TMP/alice" -X PUT "$API/employees/me" -F "profile_photo=@$TMP/photo.png;type=image/png" -F "address=Pune"
PHOTO_URL=$(json_field profile_photo_url); PHOTO_PATH=$(json_field profile_photo)
check "M10 file saved on disk with a generated name ($PHOTO_PATH)" test -f "./$PHOTO_PATH"
t "M11 owner can view own photo"                             200 '' -b "$TMP/alice" "${BASE%/api}$PHOTO_URL"
served_safely() { grep -qi '^content-type: image/png' "$TMP/headers" && grep -qi '^x-content-type-options: nosniff' "$TMP/headers"; }
check "M12 served as image/png with nosniff" served_safely
t "M13 another employee gets 404 (not even 403)"             404 'File not found' -b "$TMP/bob" "${BASE%/api}$PHOTO_URL"
t "M14 admin can view any photo"                             200 '' -b "$TMP/admin" "${BASE%/api}$PHOTO_URL"
t "M15 no session -> 401"                                    401 'not logged in' "${BASE%/api}$PHOTO_URL"
t "M16 ?download=1 sends it as an attachment"                200 '' -b "$TMP/alice" "${BASE%/api}$PHOTO_URL?download=1"
check "M17 Content-Disposition: attachment" grep -qi 'content-disposition: attachment' "$TMP/headers"
t "M18 replace photo with a JPEG"                            200 '.jpg"' \
  -b "$TMP/alice" -X PUT "$API/employees/me" -F "profile_photo=@$TMP/photo2.jpg;type=image/jpeg"
check "M19 old photo deleted from disk" test ! -f "./$PHOTO_PATH"
t "M20 text file disguised as PNG -> 400 (magic bytes)"      400 'not a valid PNG' \
  -b "$TMP/alice" -X PUT "$API/employees/me" -F "profile_photo=@$TMP/fake.png;type=image/png"
t "M21 .exe sent as image/png -> 400 (extension)"            400 'Invalid file type' \
  -b "$TMP/alice" -X PUT "$API/employees/me" -F "profile_photo=@$TMP/virus.exe;type=image/png"
t "M22 PDF as profile photo -> 400"                          400 'Invalid file type' \
  -b "$TMP/alice" -X PUT "$API/employees/me" -F "profile_photo=@$TMP/doc.pdf;type=application/pdf"
t "M23 3 MB image -> 413 (limit 2 MB)"                       413 'Maximum size is 2 MB' \
  -b "$TMP/alice" -X PUT "$API/employees/me" -F "profile_photo=@$TMP/big.png;type=image/png"
t "M24 wrong field name -> 400 names the right one"          400 'Send the file in the field \"profile_photo\"' \
  -b "$TMP/alice" -X PUT "$API/employees/me" -F "photo=@$TMP/photo.png;type=image/png"
t "M25 valid photo + invalid phone -> 400, file discarded"   400 'Phone must contain' \
  -b "$TMP/alice" -X PUT "$API/employees/me" -F "profile_photo=@$TMP/photo.png;type=image/png" -F "phone=call me"
t "M26 anonymous upload is rejected before saving -> 401"    401 'not logged in' \
  -X PUT "$API/employees/me" -F "profile_photo=@$TMP/photo.png;type=image/png"
t "M27 path traversal ..%2F..%2F.env -> 400"                 400 'Invalid file path' \
  -b "$TMP/admin" "$API/files/profiles/..%2F..%2F.env"
t "M28 folder not on the allow-list -> 400"                  400 'Invalid file path' \
  -b "$TMP/admin" "$API/files/config/db.js"
t "M29 legacy row whose file is missing on disk -> 404"      404 'File not found' \
  -b "$TMP/admin" "$API/files/profiles/arjun.jpg"
FILES_AFTER=$(ls "$PROFILE_DIR" | grep -v '^.gitkeep$' | wc -l)
check "M30 exactly 1 new file on disk (rejected uploads left nothing behind)" test "$FILES_AFTER" -eq "$((FILES_BEFORE + 1))"

finish
