#!/usr/bin/env bash
# =====================================================================
# tests/attendance-tasks-documents.curl.sh
# Phase 4 Part 2: Attendance, Tasks, Documents, Dashboard
#
# Run from the backend folder in Git Bash, with the server running:
#   bash tests/attendance-tasks-documents.curl.sh                 # localhost:5000
#   bash tests/attendance-tasks-documents.curl.sh http://localhost:5055/api
#
# Uses temporary accounts (@wms-test.local) only. Real employees' rows are
# never changed. Everything the test creates - including uploaded files -
# is removed at the end.
# =====================================================================

. "$(dirname "$0")/lib.sh"
require_server
API="$BASE"
ATT_DIR="uploads/attendance"; DOC_DIR="uploads/documents"
ATT_BEFORE=$(count_files "$ATT_DIR"); DOC_BEFORE=$(count_files "$DOC_DIR")

# --- test files --------------------------------------------------------
node -e '
const fs = require("fs"), dir = process.argv[1];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
fs.writeFileSync(dir + "/photo.png", png);
fs.writeFileSync(dir + "/fake.png", "not really an image");
fs.writeFileSync(dir + "/scan.jpg", Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]), Buffer.alloc(200, 1)]));
fs.writeFileSync(dir + "/resume.pdf", "%PDF-1.4 test resume");
fs.writeFileSync(dir + "/fake.pdf", "<html>not a pdf</html>");
fs.writeFileSync(dir + "/big.pdf", Buffer.concat([Buffer.from("%PDF-1.4 "), Buffer.alloc(6 * 1024 * 1024)]));
fs.writeFileSync(dir + "/tool.exe", "MZ fake");
' "$TMP"

# --- accounts ----------------------------------------------------------
ADMIN=admin@wms-test.local; ADMIN_PW='AdminPass123'
npm run -s create-admin -- --email "$ADMIN" --password "$ADMIN_PW" >/dev/null
DEPT_ID=$(sql "SELECT MIN(department_id) FROM departments")
register() {
  curl -s -o /dev/null -X POST "$API/auth/register" -H "$JSON" \
    -d "{\"first_name\":\"$1\",\"last_name\":\"Test\",\"email\":\"$2\",\"password\":\"$3\",\"department_id\":$DEPT_ID}"
}
register Alice alice@wms-test.local AlicePass123
register Bob bob@wms-test.local BobPass12345
register Dave dave@wms-test.local DavePass1234
login() { curl -s -o /dev/null -c "$TMP/$1" -X POST "$API/auth/login" -H "$JSON" -d "{\"email\":\"$2\",\"password\":\"$3\"}"; }
login admin "$ADMIN" "$ADMIN_PW"
login alice alice@wms-test.local AlicePass123
login bob bob@wms-test.local BobPass12345
emp_id() { sql "SELECT e.employee_id FROM employees e JOIN users u USING(user_id) WHERE u.email='$1'"; }
ALICE_ID=$(emp_id alice@wms-test.local); BOB_ID=$(emp_id bob@wms-test.local); DAVE_ID=$(emp_id dave@wms-test.local)
ADMIN_USER_ID=$(sql "SELECT user_id FROM users WHERE email='$ADMIN'")
sql "UPDATE employees SET employment_status='Inactive' WHERE employee_id=$DAVE_ID"   # an inactive employee
TODAY=$(sql "SELECT CURDATE()")
YESTERDAY=$(sql "SELECT CURDATE() - INTERVAL 1 DAY")
NEXT_WEEK=$(sql "SELECT CURDATE() + INTERVAL 7 DAY")
PNG="attendance_photo=@$TMP/photo.png;type=image/png"

# =====================================================================
section "Attendance - employee"
t "A01 mark without a session -> 401"                        401 'not logged in' \
  -X POST "$API/attendance/mark" -F "$PNG"
t "A02 admin cannot mark attendance -> 403"                  403 'requires the employee role' \
  -b "$TMP/admin" -X POST "$API/attendance/mark" -F "$PNG"
t "A03 JSON body instead of a file -> 415"                   415 'file in the field \"attendance_photo\"' \
  -b "$TMP/alice" -X POST "$API/attendance/mark" -H "$JSON" -d '{}'
t "A04 form-data without the photo -> 400"                   400 'attendance photo is required' \
  -b "$TMP/alice" -X POST "$API/attendance/mark" -F "note=hello"
t "A05 check out before checking in -> 404"                  404 'not marked attendance today' \
  -b "$TMP/alice" -X POST "$API/attendance/check-out"
t "A06 text file disguised as PNG -> 400"                    400 'not a valid PNG' \
  -b "$TMP/alice" -X POST "$API/attendance/mark" -F "attendance_photo=@$TMP/fake.png;type=image/png"
t "A07 alice marks attendance with a photo -> 201 Pending"   201 '"verification_status":"Pending"' \
  -b "$TMP/alice" -X POST "$API/attendance/mark" -F "$PNG"
ATT_ID=$(json_field attendance_id); ATT_URL=$(json_field attendance_photo_url)
ROW=$(sql "SELECT CONCAT(attendance_date,'|',check_in IS NOT NULL,'|',check_out IS NULL,'|',verification_status,'|',attendance_status) FROM attendance WHERE attendance_id=${ATT_ID:-0}")
check "A08 stored: today, check-in set, no check-out, Pending, Present ($ROW)" \
  test "$ROW" = "$TODAY|1|1|Pending|Present"
FILES_NOW=$(count_files "$ATT_DIR")
t "A09 mark again the same day -> 409"                       409 'already marked attendance today' \
  -b "$TMP/alice" -X POST "$API/attendance/mark" -F "$PNG"
check "A10 the refused second photo was never written to disk" test "$(count_files "$ATT_DIR")" -eq "$FILES_NOW"
t "A11 check out -> 200 with total_hours"                    200 '"total_hours":0' \
  -b "$TMP/alice" -X POST "$API/attendance/check-out"
t "A12 check out twice -> 409"                               409 'already checked out' \
  -b "$TMP/alice" -X POST "$API/attendance/check-out"
t "A13 own history includes today's record"                  200 "\"attendance_id\":$ATT_ID" \
  -b "$TMP/alice" "$API/attendance/my"
check "A14 response has data.today set" test "$(json_field today.attendance_id)" = "$ATT_ID"
t "A15 invalid ?from date -> 400"                            400 'from must be a valid date' \
  -b "$TMP/alice" "$API/attendance/my?from=2026-13-01"
t "A16 bob's history does not contain alice's record"        200 '"records":[' \
  -b "$TMP/bob" "$API/attendance/my"
check "A17 (alice's attendance_id absent from bob's list)" body_lacks "\"attendance_id\":$ATT_ID,"
t "A18 alice can view her attendance photo"                  200 '' -b "$TMP/alice" "$API${ATT_URL#/api}"
t "A19 bob cannot view alice's attendance photo -> 404"      404 'File not found' -b "$TMP/bob" "$API${ATT_URL#/api}"
t "A20 GET on /mark -> 405"                                  405 'Use POST' -b "$TMP/alice" "$API/attendance/mark"

# =====================================================================
section "Attendance - admin"
t "A21 employee cannot list all attendance -> 403"           403 'requires the admin role' -b "$TMP/alice" "$API/attendance"
t "A22 admin filters by date + employee"                     200 "\"attendance_id\":$ATT_ID" \
  -b "$TMP/admin" "$API/attendance?date=$TODAY&employee_id=$ALICE_ID"
check "A23 exactly one record for that filter" test "$(json_field length)" = "1"
t "A24 invalid status filter -> 400"                         400 'status must be one of' -b "$TMP/admin" "$API/attendance?status=Bogus"
t "A25 from after to -> 400"                                 400 'must be on or before' \
  -b "$TMP/admin" "$API/attendance?from=$TODAY&to=$YESTERDAY"
t "A26 admin can view the photo"                             200 '' -b "$TMP/admin" "$API${ATT_URL#/api}"
t "A27 reject without remarks -> 400"                        400 'admin_remarks is required' \
  -b "$TMP/admin" -X PUT "$API/attendance/$ATT_ID/verify" -H "$JSON" -d '{"status":"Rejected"}'
t "A28 unknown decision -> 400"                              400 'status must be \"Verified\" or \"Rejected\"' \
  -b "$TMP/admin" -X PUT "$API/attendance/$ATT_ID/verify" -H "$JSON" -d '{"status":"Approved"}'
t "A29 reject with remarks -> 200, Absent"                   200 '"attendance_status":"Absent"' \
  -b "$TMP/admin" -X PUT "$API/attendance/$ATT_ID/verify" -H "$JSON" -d '{"status":"Rejected","admin_remarks":"Photo is blurred"}'
t "A30 employee sees the remark in their history"            200 'Photo is blurred' -b "$TMP/alice" "$API/attendance/my"
t "A31 admin changes it to Verified -> Present, remark cleared" 200 '"admin_remarks":null' \
  -b "$TMP/admin" -X PUT "$API/attendance/$ATT_ID/verify" -H "$JSON" -d '{"status":"Verified"}'
t "A32 verify a record that doesn't exist -> 404"            404 'Attendance record not found' \
  -b "$TMP/admin" -X PUT "$API/attendance/999999/verify" -H "$JSON" -d '{"status":"Verified"}'
t "A33 employee cannot verify -> 403"                        403 'requires the admin role' \
  -b "$TMP/alice" -X PUT "$API/attendance/$ATT_ID/verify" -H "$JSON" -d '{"status":"Verified"}'
t "A34 bob marks attendance (stays Pending)"                 201 '"verification_status":"Pending"' \
  -b "$TMP/bob" -X POST "$API/attendance/mark" -F "$PNG"
t "A35 stats for today"                                      200 "\"date\":\"$TODAY\"" -b "$TMP/admin" "$API/attendance/stats"
EXPECTED=$(sql "SELECT CONCAT(COUNT(*),'|',SUM(COALESCE(verification_status,'Pending')='Pending')) FROM attendance WHERE attendance_date=CURDATE()")
check "A36 stats marked|pending match MySQL ($EXPECTED)" test "$(json_field marked)|$(json_field pending)" = "$EXPECTED"
check "A37 last_7_days has 7 entries" test "$(json_field last_7_days.length)" = "7"
t "A38 stats with an invalid date -> 400"                    400 'date must be a valid date' -b "$TMP/admin" "$API/attendance/stats?date=yesterday"

# =====================================================================
section "Tasks"
t "T01 admin creates a task for alice"                       201 '"status":"Pending"' \
  -b "$TMP/admin" -X POST "$API/tasks" -H "$JSON" \
  -d "{\"task_title\":\"ZZ Write report\",\"description\":\"Quarterly\",\"assigned_to\":$ALICE_ID,\"due_date\":\"$NEXT_WEEK\",\"priority\":\"High\",\"assigned_by\":1}"
TASK1=$(json_field task_id)
check "T02 assigned_by comes from the session, not the body" \
  test "$(sql "SELECT assigned_by FROM tasks WHERE task_id=${TASK1:-0}")" = "$ADMIN_USER_ID"
t "T03 \"title\" works as an alias, priority defaults to Medium" 201 '"priority":"Medium"' \
  -b "$TMP/admin" -X POST "$API/tasks" -H "$JSON" -d "{\"title\":\"ZZ Fix bug 50%\",\"assigned_to\":$ALICE_ID}"
TASK2=$(json_field task_id)
t "T04 task for bob"                                         201 '"assigned_to_name":"Bob Test"' \
  -b "$TMP/admin" -X POST "$API/tasks" -H "$JSON" -d "{\"task_title\":\"ZZ Bob task\",\"assigned_to\":$BOB_ID}"
TASK_BOB=$(json_field task_id)
t "T05 missing title and assignee -> 400 lists both"         400 'assigned_to (employee_id) is required' \
  -b "$TMP/admin" -X POST "$API/tasks" -H "$JSON" -d '{"description":"x"}'
t "T06 due date in the past -> 400"                          400 'cannot be in the past' \
  -b "$TMP/admin" -X POST "$API/tasks" -H "$JSON" -d "{\"task_title\":\"ZZ Old\",\"assigned_to\":$ALICE_ID,\"due_date\":\"$YESTERDAY\"}"
t "T07 invalid priority -> 400"                              400 'priority must be one of' \
  -b "$TMP/admin" -X POST "$API/tasks" -H "$JSON" -d "{\"task_title\":\"ZZ P\",\"assigned_to\":$ALICE_ID,\"priority\":\"Urgent\"}"
t "T08 unknown employee -> 400"                              400 'Employee 999999 does not exist' \
  -b "$TMP/admin" -X POST "$API/tasks" -H "$JSON" -d '{"task_title":"ZZ Ghost","assigned_to":999999}'
t "T09 inactive employee -> 400"                             400 'is inactive' \
  -b "$TMP/admin" -X POST "$API/tasks" -H "$JSON" -d "{\"task_title\":\"ZZ Gone\",\"assigned_to\":$DAVE_ID}"
t "T10 employee cannot create tasks -> 403"                  403 'requires the admin role' \
  -b "$TMP/alice" -X POST "$API/tasks" -H "$JSON" -d "{\"task_title\":\"ZZ Self\",\"assigned_to\":$ALICE_ID}"
t "T11 admin filters by employee"                            200 "\"task_id\":$TASK1" -b "$TMP/admin" "$API/tasks?employee_id=$ALICE_ID"
check "T12 only alice's 2 tasks" test "$(json_field length)" = "2"
t "T13 search with % is literal"                             200 "\"task_id\":$TASK2" -b "$TMP/admin" "$API/tasks?search=50%25"
check "T14 (search returned 1 task)" test "$(json_field length)" = "1"
t "T15 invalid status filter -> 400"                         400 'status must be one of' -b "$TMP/admin" "$API/tasks?status=Done"
t "T16 alice sees her tasks"                                 200 "\"task_id\":$TASK1" -b "$TMP/alice" "$API/tasks/my"
check "T17 (bob's task is not in alice's list)" body_lacks "\"task_id\":$TASK_BOB,"
t "T18 alice opens her task"                                 200 '"task_title":"ZZ Write report"' -b "$TMP/alice" "$API/tasks/$TASK1"
t "T19 bob cannot open alice's task -> 404"                  404 'Task not found' -b "$TMP/bob" "$API/tasks/$TASK1"
t "T20 alice -> In Progress"                                 200 '"status":"In Progress"' \
  -b "$TMP/alice" -X PATCH "$API/tasks/$TASK1/status" -H "$JSON" -d '{"status":"In Progress"}'
t "T21 alice cannot set Pending -> 400"                      400 'Employees can set the status to' \
  -b "$TMP/alice" -X PATCH "$API/tasks/$TASK1/status" -H "$JSON" -d '{"status":"Pending"}'
t "T22 other fields are ignored and reported"                200 'Ignored fields' \
  -b "$TMP/alice" -X PATCH "$API/tasks/$TASK1/status" -H "$JSON" \
  -d "{\"status\":\"Completed\",\"task_title\":\"hacked\",\"assigned_to\":$BOB_ID,\"priority\":\"Low\"}"
check "T23 DB: Completed, title/assignee/priority unchanged" \
  test "$(sql "SELECT CONCAT(status,'|',task_title,'|',assigned_to,'|',priority) FROM tasks WHERE task_id=$TASK1")" = "Completed|ZZ Write report|$ALICE_ID|High"
t "T24 bob cannot change alice's task -> 404"                404 'Task not found' \
  -b "$TMP/bob" -X PATCH "$API/tasks/$TASK1/status" -H "$JSON" -d '{"status":"In Progress"}'
t "T25 employee cannot edit a task (PUT) -> 403"             403 'requires the admin role' \
  -b "$TMP/alice" -X PUT "$API/tasks/$TASK1" -H "$JSON" -d '{"priority":"Low"}'
t "T26 admin partial update"                                 200 '"priority":"Low"' \
  -b "$TMP/admin" -X PUT "$API/tasks/$TASK2" -H "$JSON" -d '{"priority":"Low","description":"Updated"}'
t "T27 admin reassigns to bob"                               200 "\"assigned_to\":$BOB_ID" \
  -b "$TMP/admin" -X PUT "$API/tasks/$TASK2" -H "$JSON" -d "{\"assigned_to\":$BOB_ID}"
t "T28 update with nothing editable -> 400"                  400 'Nothing to update' \
  -b "$TMP/admin" -X PUT "$API/tasks/$TASK2" -H "$JSON" -d '{"assigned_by":5}'
t "T29 admin may set any status (back to Pending)"           200 '"status":"Pending"' \
  -b "$TMP/admin" -X PATCH "$API/tasks/$TASK1/status" -H "$JSON" -d '{"status":"Pending"}'
t "T30 admin deletes a task"                                 200 'Task deleted' -b "$TMP/admin" -X DELETE "$API/tasks/$TASK2"
t "T31 delete again -> 404"                                  404 'Task not found' -b "$TMP/admin" -X DELETE "$API/tasks/$TASK2"
t "T32 admin has no /my tasks -> 403"                        403 'requires the employee role' -b "$TMP/admin" "$API/tasks/my"
t "T33 POST on /:id/status -> 405"                           405 'Use PATCH' -b "$TMP/admin" -X POST "$API/tasks/$TASK1/status"

# =====================================================================
section "Documents"
DOC="document=@$TMP/resume.pdf;type=application/pdf"
t "C01 document types list"                                  200 '"Identity Proof"' -b "$TMP/alice" "$API/documents/types"
t "C02 upload without a session -> 401"                      401 'not logged in' \
  -X POST "$API/documents/upload" -F "$DOC" -F "document_name=CV" -F "document_type=Resume"
t "C03 admin cannot upload -> 403"                           403 'requires the employee role' \
  -b "$TMP/admin" -X POST "$API/documents/upload" -F "$DOC" -F "document_name=CV" -F "document_type=Resume"
t "C04 JSON body -> 415"                                     415 'file in the field \"document\"' \
  -b "$TMP/alice" -X POST "$API/documents/upload" -H "$JSON" -d '{"document_name":"CV"}'
t "C05 missing name and type -> 400"                         400 'document_name is required' \
  -b "$TMP/alice" -X POST "$API/documents/upload" -F "$DOC"
t "C06 unknown document_type -> 400"                         400 'document_type must be one of' \
  -b "$TMP/alice" -X POST "$API/documents/upload" -F "$DOC" -F "document_name=CV" -F "document_type=Selfie"
t "C07 HTML disguised as PDF -> 400"                         400 'not a valid PDF' \
  -b "$TMP/alice" -X POST "$API/documents/upload" -F "document=@$TMP/fake.pdf;type=application/pdf" -F "document_name=CV" -F "document_type=Resume"
t "C08 6 MB file -> 413 (limit 5 MB)"                        413 'Maximum size is 5 MB' \
  -b "$TMP/alice" -X POST "$API/documents/upload" -F "document=@$TMP/big.pdf;type=application/pdf" -F "document_name=CV" -F "document_type=Resume"
t "C09 .exe -> 400"                                          400 'Invalid file type' \
  -b "$TMP/alice" -X POST "$API/documents/upload" -F "document=@$TMP/tool.exe;type=application/pdf" -F "document_name=CV" -F "document_type=Resume"
check "C10 refused uploads left no files behind" test "$(count_files "$DOC_DIR")" -eq "$DOC_BEFORE"
t "C11 alice uploads a PDF -> 201 Pending"                   201 '"verification_status":"Pending"' \
  -b "$TMP/alice" -X POST "$API/documents/upload" -F "$DOC" -F "document_name=ZZ My CV" -F "document_type=Resume"
DOC1=$(json_field document_id); DOC1_URL=$(json_field file_url); DOC1_PATH=$(json_field file_path)
t "C12 alice lists her documents"                            200 "\"document_id\":$DOC1" -b "$TMP/alice" "$API/documents/my"
t "C13 bob's list does not include it"                       200 '"success":true' -b "$TMP/bob" "$API/documents/my"
check "C14 (alice's document absent from bob's list)" body_lacks "\"document_id\":$DOC1,"
t "C15 alice opens her file (PDF)"                           200 '%PDF' -b "$TMP/alice" "$API${DOC1_URL#/api}"
check "C16 served as application/pdf" grep -qi '^content-type: application/pdf' "$TMP/headers"
t "C17 bob cannot open it -> 404"                            404 'File not found' -b "$TMP/bob" "$API${DOC1_URL#/api}"
t "C18 admin can download it"                                200 '%PDF' -b "$TMP/admin" "$API${DOC1_URL#/api}?download=1"
t "C19 employee cannot list all documents -> 403"            403 'requires the admin role' -b "$TMP/alice" "$API/documents"
t "C20 admin filters by employee + status"                   200 "\"document_id\":$DOC1" \
  -b "$TMP/admin" "$API/documents?employee_id=$ALICE_ID&status=Pending"
t "C21 invalid status filter -> 400"                         400 'status must be one of' -b "$TMP/admin" "$API/documents?status=Verified"
t "C22 reject without remarks -> 400"                        400 'admin_remarks is required' \
  -b "$TMP/admin" -X PUT "$API/documents/$DOC1/verify" -H "$JSON" -d '{"status":"Rejected"}'
t "C23 reject with remarks"                                  200 '"verification_status":"Rejected"' \
  -b "$TMP/admin" -X PUT "$API/documents/$DOC1/verify" -H "$JSON" -d '{"status":"Rejected","admin_remarks":"Please upload a clearer scan"}'
t "C24 employee cannot verify -> 403"                        403 'requires the admin role' \
  -b "$TMP/alice" -X PUT "$API/documents/$DOC1/verify" -H "$JSON" -d '{"status":"Approved"}'
FILES_NOW=$(count_files "$DOC_DIR")
t "C25 bob cannot replace alice's document -> 404"           404 'Document not found' \
  -b "$TMP/bob" -X PUT "$API/documents/$DOC1" -F "document=@$TMP/scan.jpg;type=image/jpeg"
check "C26 (no file was saved for bob's attempt)" test "$(count_files "$DOC_DIR")" -eq "$FILES_NOW"
t "C27 alice replaces the rejected document with a JPEG"     200 '"admin_remarks":null' \
  -b "$TMP/alice" -X PUT "$API/documents/$DOC1" -F "document=@$TMP/scan.jpg;type=image/jpeg" -F "document_name=ZZ My CV v2"
check "C28 back to Pending, new .jpg path" \
  test "$(sql "SELECT CONCAT(verification_status,'|',document_name,'|',file_path LIKE '%.jpg') FROM employee_documents WHERE document_id=$DOC1")" = "Pending|ZZ My CV v2|1"
check "C29 old PDF deleted from disk" test ! -e "./$DOC1_PATH"
DOC1_PATH=$(sql "SELECT file_path FROM employee_documents WHERE document_id=$DOC1")
t "C30 admin approves"                                       200 '"verification_status":"Approved"' \
  -b "$TMP/admin" -X PUT "$API/documents/$DOC1/verify" -H "$JSON" -d '{"status":"Approved"}'
FILES_NOW=$(count_files "$DOC_DIR")
t "C31 approved document cannot be replaced -> 409"          409 'already approved' \
  -b "$TMP/alice" -X PUT "$API/documents/$DOC1" -F "document=@$TMP/scan.jpg;type=image/jpeg"
check "C32 (no file was saved for the refused replacement)" test "$(count_files "$DOC_DIR")" -eq "$FILES_NOW"
t "C33 approved document cannot be deleted by the employee -> 409" 409 'cannot be deleted' \
  -b "$TMP/alice" -X DELETE "$API/documents/$DOC1"
t "C34 alice uploads a second document"                      201 '"document_type":"Certificate"' \
  -b "$TMP/alice" -X POST "$API/documents/upload" -F "$DOC" -F "document_name=ZZ Cert" -F "document_type=Certificate"
DOC2=$(json_field document_id); DOC2_PATH=$(json_field file_path)
t "C35 bob cannot delete it -> 404"                          404 'Document not found' -b "$TMP/bob" -X DELETE "$API/documents/$DOC2"
t "C36 alice deletes her pending document"                   200 'Document deleted' -b "$TMP/alice" -X DELETE "$API/documents/$DOC2"
check "C37 (its file is gone)" test ! -e "./$DOC2_PATH"
t "C38 admin deletes the approved document"                  200 'Document deleted' -b "$TMP/admin" -X DELETE "$API/documents/$DOC1"
check "C39 (its file is gone)" test ! -e "./$DOC1_PATH"
t "C40 bob uploads a document (kept for the dashboard)"      201 '"document_id"' \
  -b "$TMP/bob" -X POST "$API/documents/upload" -F "$DOC" -F "document_name=ZZ Bob ID" -F "document_type=Identity Proof"

# =====================================================================
section "Dashboard"
t "B01 admin dashboard"                                      200 '"total_departments"' -b "$TMP/admin" "$API/dashboard/admin"
EXPECTED=$(sql "SELECT CONCAT(
  (SELECT COUNT(*) FROM employees WHERE COALESCE(employment_status,'Active')='Active'),'|',
  (SELECT COUNT(*) FROM attendance WHERE attendance_date=CURDATE() AND COALESCE(verification_status,'Pending')<>'Rejected'),'|',
  (SELECT COUNT(*) FROM attendance WHERE COALESCE(verification_status,'Pending')='Pending'),'|',
  (SELECT COUNT(*) FROM tasks WHERE status='Pending'),'|',
  (SELECT COUNT(*) FROM tasks WHERE status='Completed'),'|',
  (SELECT COUNT(*) FROM employee_documents WHERE verification_status='Pending'))")
GOT="$(json_field total_employees)|$(json_field present_today)|$(json_field pending_attendance_verifications)|$(json_field pending_tasks)|$(json_field completed_tasks)|$(json_field pending_documents)"
check "B02 numbers match MySQL ($GOT)" test "$GOT" = "$EXPECTED"
t "B03 employee cannot open the admin dashboard -> 403"      403 'requires the admin role' -b "$TMP/alice" "$API/dashboard/admin"
t "B04 alice's dashboard"                                    200 '"full_name":"Alice Test"' -b "$TMP/alice" "$API/dashboard/employee"
check "B05 today's attendance shows Checked out" test "$(json_field today_attendance.status)" = "Checked out"
check "B06 task counts: 1 pending, 0 completed" test "$(json_field tasks.pending)|$(json_field tasks.completed)" = "1|0"
check "B07 recent activity lists the check-in" grep -q 'Checked in (Verified)' "$TMP/body"
t "B08 bob's dashboard: checked in, 1 pending document"      200 '"status":"Checked in"' -b "$TMP/bob" "$API/dashboard/employee"
check "B09 (documents.pending = 1)" test "$(json_field documents.pending)" = "1"
t "B10 admin has no employee dashboard -> 403"               403 'requires the employee role' -b "$TMP/admin" "$API/dashboard/employee"
t "B11 no session -> 401"                                    401 'not logged in' "$API/dashboard/admin"
t "B12 POST -> 405"                                          405 'Use GET' -b "$TMP/admin" -X POST "$API/dashboard/admin"

# =====================================================================
section "Files on disk"
check "F01 attendance: exactly 2 new photos (alice + bob)" test "$(count_files "$ATT_DIR")" -eq "$((ATT_BEFORE + 2))"
check "F02 documents: exactly 1 new file (bob's)"          test "$(count_files "$DOC_DIR")" -eq "$((DOC_BEFORE + 1))"

finish
