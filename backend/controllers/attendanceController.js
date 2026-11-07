// controllers/attendanceController.js
// Attendance = one row per employee per day (UNIQUE employee_id + attendance_date).
//
//   Employee: mark attendance with a photo (check-in), check out, view history
//   Admin:    list/filter all records, verify or reject them, see statistics
//
// How the existing columns are used:
//   check_in / check_out   TIME, taken from the MySQL clock (not from the client,
//                          so nobody can send a fake time)
//   attendance_photo       'uploads/attendance/<file>', shown via /api/files/...
//   verification_status    'Pending' -> 'Verified' or 'Rejected' (Admin decision)
//   attendance_status      'Present' when marked / verified, 'Absent' when rejected
//   total_hours            hours between check-in and check-out, set at check-out
//   admin_remarks          Admin's note (required when rejecting)
//
// The photo is a normal photo for the Admin to look at. There is NO face
// recognition or biometric processing.

const pool = require('../config/db');
const { toFileUrl, toStoredPath, removeUploadedFile } = require('../utils/files');
const { cleanString, toPositiveInt, isValidDate, checkStringFields } = require('../utils/validators');

const VERIFICATION_STATUSES = ['Pending', 'Verified', 'Rejected'];
const DECISIONS = { Verified: 'Present', Rejected: 'Absent' }; // decision -> attendance_status
const MAX_REMARKS_LENGTH = 255; // attendance.admin_remarks is VARCHAR(255)

// Old rows may have a NULL verification_status; we treat those as Pending.
const ATTENDANCE_SELECT = `
  SELECT a.attendance_id, a.employee_id, e.first_name, e.last_name, u.email,
         e.department_id, d.department_name,
         a.attendance_date, a.check_in, a.check_out, a.total_hours,
         a.attendance_photo, COALESCE(a.verification_status, 'Pending') AS verification_status,
         a.attendance_status, a.admin_remarks
    FROM attendance a
    JOIN employees e ON e.employee_id = a.employee_id
    JOIN users u ON u.user_id = e.user_id
    LEFT JOIN departments d ON d.department_id = e.department_id`;

const ORDER_NEWEST_FIRST = 'ORDER BY a.attendance_date DESC, a.check_in DESC, a.attendance_id DESC';

function formatAttendance(row) {
  return {
    attendance_id: row.attendance_id,
    employee_id: row.employee_id,
    employee_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
    email: row.email,
    department_id: row.department_id,
    department_name: row.department_name,
    attendance_date: row.attendance_date,
    check_in: row.check_in,
    check_out: row.check_out,
    // DECIMAL columns arrive as strings ("8.75"); the frontend wants numbers
    total_hours: row.total_hours === null ? null : Number(row.total_hours),
    verification_status: row.verification_status,
    attendance_status: row.attendance_status,
    admin_remarks: row.admin_remarks,
    attendance_photo: row.attendance_photo,
    attendance_photo_url: toFileUrl(row.attendance_photo),
  };
}

async function findAttendanceById(attendanceId) {
  const [rows] = await pool.query(`${ATTENDANCE_SELECT} WHERE a.attendance_id = ?`, [attendanceId]);
  return rows[0] ? formatAttendance(rows[0]) : null;
}

async function findTodayRecord(employeeId) {
  const [rows] = await pool.query(
    `${ATTENDANCE_SELECT} WHERE a.employee_id = ? AND a.attendance_date = CURDATE()`,
    [employeeId]
  );
  return rows[0] ? formatAttendance(rows[0]) : null;
}

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

// Reads ?date= / ?from= / ?to= / ?status= from the query string into SQL conditions.
// Returns { conditions, values } or { error }.
function readCommonFilters(query) {
  const conditions = [];
  const values = [];

  for (const key of ['date', 'from', 'to']) {
    const value = query[key];
    if (value === undefined || value === '') continue;
    if (!isValidDate(value)) return { error: `${key} must be a valid date in the format YYYY-MM-DD` };
  }
  if (query.from && query.to && query.from > query.to) {
    return { error: '"from" must be on or before "to"' };
  }
  if (query.date) { conditions.push('a.attendance_date = ?'); values.push(query.date); }
  if (query.from) { conditions.push('a.attendance_date >= ?'); values.push(query.from); }
  if (query.to) { conditions.push('a.attendance_date <= ?'); values.push(query.to); }

  if (query.status !== undefined && query.status !== '') {
    if (!VERIFICATION_STATUSES.includes(query.status)) {
      return { error: `status must be one of: ${VERIFICATION_STATUSES.join(', ')}` };
    }
    conditions.push("COALESCE(a.verification_status, 'Pending') = ?");
    values.push(query.status);
  }
  return { conditions, values };
}

// =====================================================================
// EMPLOYEE ENDPOINTS
// =====================================================================

// ---------------------------------------------------------------------
// Runs BEFORE the photo upload on POST /mark: if today's attendance is
// already there, answer 409 straight away so no file is written to disk.
// ---------------------------------------------------------------------
async function ensureNotMarkedToday(req, res, next) {
  try {
    const today = await findTodayRecord(req.user.employee_id);
    if (today) {
      return res.status(409).json({
        success: false,
        message: `You have already marked attendance today (checked in at ${today.check_in}). ` +
          'Attendance can be marked only once per day.',
        data: today,
      });
    }
    next();
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// POST /api/attendance/mark   (Employee)
// form-data: attendance_photo = image file (JPEG/PNG/WebP, max 2 MB)
// Creates today's record: check_in = now, status Pending (waits for Admin).
// ---------------------------------------------------------------------
async function markAttendance(req, res, next) {
  const photo = req.file;
  if (!photo) {
    return badRequest(res, 'An attendance photo is required. Send it as form-data in the field "attendance_photo".');
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO attendance
         (employee_id, attendance_date, check_in, attendance_photo, verification_status, attendance_status)
       VALUES (?, CURDATE(), CURTIME(), ?, 'Pending', 'Present')`,
      [req.user.employee_id, toStoredPath('attendance', photo.filename)]
    );
    const record = await findAttendanceById(result.insertId);
    res.status(201).json({
      success: true,
      message: `Checked in at ${record.check_in}. Your attendance is waiting for Admin verification.`,
      data: record,
    });
  } catch (error) {
    await removeUploadedFile(photo); // no row was saved, so don't keep the photo
    // Two requests at the same moment: the UNIQUE key stops the second one
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'You have already marked attendance today.' });
    }
    next(error);
  }
}

// ---------------------------------------------------------------------
// POST /api/attendance/check-out   (Employee, no body needed)
// Sets check_out = now and total_hours for TODAY's record.
// ---------------------------------------------------------------------
async function checkOut(req, res, next) {
  const employeeId = req.user.employee_id;
  try {
    // One UPDATE that only matches "today, not yet checked out", so two
    // clicks can never overwrite the first check-out time.
    const [result] = await pool.query(
      `UPDATE attendance
          SET check_out = CURTIME(),
              total_hours = IF(check_in IS NULL, NULL,
                               ROUND(GREATEST(TIME_TO_SEC(TIMEDIFF(CURTIME(), check_in)), 0) / 3600, 2))
        WHERE employee_id = ? AND attendance_date = CURDATE() AND check_out IS NULL`,
      [employeeId]
    );

    const today = await findTodayRecord(employeeId);
    if (result.affectedRows === 0) {
      if (!today) {
        return res.status(404).json({
          success: false,
          message: 'You have not marked attendance today. Mark attendance (check in) first.',
        });
      }
      return res.status(409).json({
        success: false,
        message: `You have already checked out today at ${today.check_out}.`,
        data: today,
      });
    }

    res.json({
      success: true,
      message: `Checked out at ${today.check_out}. Hours worked today: ${today.total_hours}.`,
      data: today,
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// GET /api/attendance/my?from=&to=&status=   (Employee) - own history
// Also returns today's record (or null) so the page knows which button to show.
// ---------------------------------------------------------------------
async function getMyAttendance(req, res, next) {
  const filters = readCommonFilters(req.query);
  if (filters.error) return badRequest(res, filters.error);

  try {
    const conditions = ['a.employee_id = ?', ...filters.conditions];
    const [rows] = await pool.query(
      `${ATTENDANCE_SELECT} WHERE ${conditions.join(' AND ')} ${ORDER_NEWEST_FIRST}`,
      [req.user.employee_id, ...filters.values]
    );
    const today = await findTodayRecord(req.user.employee_id);

    res.json({
      success: true,
      message: `${rows.length} attendance record(s) found`,
      data: { today, records: rows.map(formatAttendance) },
    });
  } catch (error) {
    next(error);
  }
}

// =====================================================================
// ADMIN ENDPOINTS
// =====================================================================

// ---------------------------------------------------------------------
// GET /api/attendance?date=&from=&to=&employee_id=&department_id=&status=   (Admin)
// ---------------------------------------------------------------------
async function listAttendance(req, res, next) {
  const filters = readCommonFilters(req.query);
  if (filters.error) return badRequest(res, filters.error);
  const { conditions, values } = filters;

  for (const [key, column] of [['employee_id', 'a.employee_id'], ['department_id', 'e.department_id']]) {
    const raw = req.query[key];
    if (raw === undefined || raw === '') continue;
    const id = toPositiveInt(raw);
    if (!id) return badRequest(res, `${key} must be a number`);
    conditions.push(`${column} = ?`);
    values.push(id);
  }

  try {
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(`${ATTENDANCE_SELECT} ${where} ${ORDER_NEWEST_FIRST}`, values);
    res.json({ success: true, message: `${rows.length} attendance record(s) found`, data: rows.map(formatAttendance) });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// PUT /api/attendance/:id/verify   (Admin)
// Body: { "status": "Verified" | "Rejected", "admin_remarks": "..." }
// admin_remarks is required when rejecting, so the employee knows why.
// The Admin may change an earlier decision (e.g. fix a mistake).
// ---------------------------------------------------------------------
async function verifyAttendance(req, res, next) {
  const attendanceId = toPositiveInt(req.params.id);
  if (!attendanceId) return badRequest(res, 'Invalid attendance id');

  const typeErrors = checkStringFields(req.body, ['status', 'admin_remarks']);
  if (typeErrors.length > 0) return badRequest(res, typeErrors.join('. '));

  const status = cleanString(req.body.status);
  const remarks = cleanString(req.body.admin_remarks) || null;
  if (!DECISIONS[status]) return badRequest(res, 'status must be "Verified" or "Rejected"');
  if (status === 'Rejected' && !remarks) {
    return badRequest(res, 'admin_remarks is required when rejecting, so the employee knows why');
  }
  if (remarks && remarks.length > MAX_REMARKS_LENGTH) {
    return badRequest(res, `admin_remarks must be at most ${MAX_REMARKS_LENGTH} characters`);
  }

  try {
    const [result] = await pool.query(
      `UPDATE attendance SET verification_status = ?, attendance_status = ?, admin_remarks = ?
        WHERE attendance_id = ?`,
      [status, DECISIONS[status], remarks, attendanceId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }
    const record = await findAttendanceById(attendanceId);
    res.json({ success: true, message: `Attendance ${status.toLowerCase()}`, data: record });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// GET /api/attendance/stats?date=YYYY-MM-DD   (Admin, date defaults to today)
// Numbers for one day + the 7 days ending on that day + all pending records.
// ---------------------------------------------------------------------
function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function getAttendanceStats(req, res, next) {
  const requestedDate = req.query.date;
  if (requestedDate !== undefined && requestedDate !== '' && !isValidDate(requestedDate)) {
    return badRequest(res, 'date must be a valid date in the format YYYY-MM-DD');
  }

  try {
    const [[{ today }]] = await pool.query('SELECT CURDATE() AS today');
    const date = requestedDate || today;

    const [[day]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM employees
           WHERE COALESCE(employment_status, 'Active') = 'Active')                         AS active_employees,
         COUNT(a.attendance_id)                                                             AS marked,
         COALESCE(SUM(COALESCE(a.verification_status, 'Pending') = 'Verified'), 0)         AS verified,
         COALESCE(SUM(COALESCE(a.verification_status, 'Pending') = 'Pending'), 0)          AS pending,
         COALESCE(SUM(a.verification_status = 'Rejected'), 0)                               AS rejected,
         COALESCE(SUM(a.check_out IS NULL), 0)                                              AS not_checked_out,
         ROUND(AVG(a.total_hours), 2)                                                       AS average_hours
         FROM attendance a
        WHERE a.attendance_date = ?`,
      [date]
    );

    // Active employees with no record on that day
    const [[{ not_marked }]] = await pool.query(
      `SELECT COUNT(*) AS not_marked FROM employees e
        WHERE COALESCE(e.employment_status, 'Active') = 'Active'
          AND NOT EXISTS (SELECT 1 FROM attendance a
                           WHERE a.employee_id = e.employee_id AND a.attendance_date = ?)`,
      [date]
    );

    const [[{ pending_total }]] = await pool.query(
      "SELECT COUNT(*) AS pending_total FROM attendance WHERE COALESCE(verification_status, 'Pending') = 'Pending'"
    );

    // Last 7 days (days without records are filled with zeros)
    const weekStart = addDays(date, -6);
    const [weekRows] = await pool.query(
      `SELECT attendance_date,
              COUNT(*) AS marked,
              SUM(COALESCE(verification_status, 'Pending') = 'Verified') AS verified,
              SUM(COALESCE(verification_status, 'Pending') = 'Pending')  AS pending,
              SUM(verification_status = 'Rejected')                      AS rejected
         FROM attendance
        WHERE attendance_date BETWEEN ? AND ?
        GROUP BY attendance_date`,
      [weekStart, date]
    );
    const byDate = Object.fromEntries(weekRows.map((row) => [row.attendance_date, row]));
    const last7Days = [];
    for (let i = 0; i < 7; i += 1) {
      const d = addDays(weekStart, i);
      const row = byDate[d] || {};
      last7Days.push({
        date: d,
        marked: Number(row.marked || 0),
        verified: Number(row.verified || 0),
        pending: Number(row.pending || 0),
        rejected: Number(row.rejected || 0),
      });
    }

    res.json({
      success: true,
      message: `Attendance statistics for ${date}`,
      data: {
        date,
        active_employees: Number(day.active_employees),
        marked: Number(day.marked),
        // "present" = marked and not rejected (verified or still waiting)
        present: Number(day.marked) - Number(day.rejected),
        verified: Number(day.verified),
        pending: Number(day.pending),
        rejected: Number(day.rejected),
        not_marked: Number(not_marked),
        not_checked_out: Number(day.not_checked_out),
        average_hours: day.average_hours === null ? null : Number(day.average_hours),
        pending_verification_total: Number(pending_total),
        last_7_days: last7Days,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  ensureNotMarkedToday,
  markAttendance,
  checkOut,
  getMyAttendance,
  listAttendance,
  verifyAttendance,
  getAttendanceStats,
};
