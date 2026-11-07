// controllers/dashboardController.js
// The numbers on the two dashboards. Every value is counted live in MySQL,
// nothing is hard-coded.
//
//   GET /api/dashboard/admin     (Admin)
//   GET /api/dashboard/employee  (Employee - only their own data)

const pool = require('../config/db');
const { toFileUrl } = require('../utils/files');

// MySQL COUNT/SUM results can arrive as strings; convert every field to a number.
function toNumbers(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value || 0)]));
}

const fullName = (first, last) => [first, last].filter(Boolean).join(' ');

// ---------------------------------------------------------------------
// GET /api/dashboard/admin
// ---------------------------------------------------------------------
async function getAdminDashboard(req, res, next) {
  try {
    const [[{ today }]] = await pool.query('SELECT CURDATE() AS today');

    const [[counts]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM employees WHERE COALESCE(employment_status, 'Active') = 'Active') AS total_employees,
         (SELECT COUNT(*) FROM employees WHERE employment_status = 'Inactive')                  AS inactive_employees,
         (SELECT COUNT(*) FROM departments)                                                      AS total_departments,
         (SELECT COUNT(*) FROM attendance
           WHERE attendance_date = CURDATE()
             AND COALESCE(verification_status, 'Pending') <> 'Rejected')                       AS present_today,
         (SELECT COUNT(*) FROM attendance
           WHERE COALESCE(verification_status, 'Pending') = 'Pending')                         AS pending_attendance_verifications,
         (SELECT COUNT(*) FROM tasks WHERE status = 'Pending')                                   AS pending_tasks,
         (SELECT COUNT(*) FROM tasks WHERE status = 'In Progress')                               AS in_progress_tasks,
         (SELECT COUNT(*) FROM tasks WHERE status = 'Completed')                                 AS completed_tasks,
         (SELECT COUNT(*) FROM tasks WHERE due_date < CURDATE() AND status <> 'Completed')       AS overdue_tasks,
         (SELECT COUNT(*) FROM employee_documents WHERE verification_status = 'Pending')         AS pending_documents`
    );

    // Latest attendance records, for a "recent activity" table
    const [attendanceRows] = await pool.query(
      `SELECT a.attendance_id, a.employee_id, e.first_name, e.last_name, a.attendance_date,
              a.check_in, a.check_out, COALESCE(a.verification_status, 'Pending') AS verification_status
         FROM attendance a JOIN employees e ON e.employee_id = a.employee_id
        ORDER BY a.attendance_date DESC, a.check_in DESC, a.attendance_id DESC
        LIMIT 5`
    );

    // Unfinished tasks with the nearest due dates
    const [taskRows] = await pool.query(
      `SELECT t.task_id, t.task_title, t.priority, t.status, t.due_date, t.assigned_to,
              e.first_name, e.last_name,
              (t.due_date < CURDATE()) AS is_overdue
         FROM tasks t JOIN employees e ON e.employee_id = t.assigned_to
        WHERE t.status <> 'Completed' AND t.due_date IS NOT NULL
        ORDER BY t.due_date, FIELD(t.priority, 'High', 'Medium', 'Low')
        LIMIT 5`
    );

    res.json({
      success: true,
      message: 'Admin dashboard',
      data: {
        today,
        ...toNumbers(counts),
        recent_attendance: attendanceRows.map((row) => ({
          attendance_id: row.attendance_id,
          employee_id: row.employee_id,
          employee_name: fullName(row.first_name, row.last_name),
          attendance_date: row.attendance_date,
          check_in: row.check_in,
          check_out: row.check_out,
          verification_status: row.verification_status,
        })),
        upcoming_tasks: taskRows.map((row) => ({
          task_id: row.task_id,
          task_title: row.task_title,
          priority: row.priority,
          status: row.status,
          due_date: row.due_date,
          is_overdue: row.is_overdue === 1,
          assigned_to: row.assigned_to,
          assigned_to_name: fullName(row.first_name, row.last_name),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// GET /api/dashboard/employee
// Everything is filtered by req.user.employee_id (from the session).
// ---------------------------------------------------------------------
async function getEmployeeDashboard(req, res, next) {
  const employeeId = req.user.employee_id;
  try {
    const [[profile]] = await pool.query(
      `SELECT e.employee_id, e.first_name, e.last_name, e.designation, e.profile_photo,
              e.department_id, d.department_name, CURDATE() AS today
         FROM employees e LEFT JOIN departments d ON d.department_id = e.department_id
        WHERE e.employee_id = ?`,
      [employeeId]
    );
    if (!profile) return res.status(404).json({ success: false, message: 'Employee profile not found' });

    const [todayRows] = await pool.query(
      `SELECT attendance_id, check_in, check_out, total_hours,
              COALESCE(verification_status, 'Pending') AS verification_status, admin_remarks
         FROM attendance WHERE employee_id = ? AND attendance_date = CURDATE()`,
      [employeeId]
    );
    const todayRecord = todayRows[0] || null;

    const [[taskCounts]] = await pool.query(
      `SELECT COALESCE(SUM(status = 'Pending'), 0)      AS pending,
              COALESCE(SUM(status = 'In Progress'), 0)  AS in_progress,
              COALESCE(SUM(status = 'Completed'), 0)    AS completed,
              COALESCE(SUM(due_date < CURDATE() AND status <> 'Completed'), 0) AS overdue
         FROM tasks WHERE assigned_to = ?`,
      [employeeId]
    );

    const [[documentCounts]] = await pool.query(
      `SELECT COALESCE(SUM(verification_status = 'Pending'), 0)  AS pending,
              COALESCE(SUM(verification_status = 'Approved'), 0) AS approved,
              COALESCE(SUM(verification_status = 'Rejected'), 0) AS rejected
         FROM employee_documents WHERE employee_id = ?`,
      [employeeId]
    );

    // Recent activity: check-ins, check-outs, new tasks and uploads, newest first.
    // UNION ALL glues the four lists together; each part is filtered by employee.
    const [activity] = await pool.query(
      `SELECT * FROM (
         SELECT 'attendance' AS type,
                CONCAT('Checked in (', COALESCE(verification_status, 'Pending'), ')') AS description,
                TIMESTAMP(attendance_date, COALESCE(check_in, '00:00:00')) AS activity_at
           FROM attendance WHERE employee_id = ?
         UNION ALL
         SELECT 'attendance', 'Checked out', TIMESTAMP(attendance_date, check_out)
           FROM attendance WHERE employee_id = ? AND check_out IS NOT NULL
         UNION ALL
         SELECT 'task', CONCAT('New task: ', task_title, ' (', status, ')'), created_at
           FROM tasks WHERE assigned_to = ?
         UNION ALL
         SELECT 'document', CONCAT('Uploaded ', document_name, ' (', verification_status, ')'), uploaded_at
           FROM employee_documents WHERE employee_id = ?
       ) AS activity
       ORDER BY activity_at DESC
       LIMIT 8`,
      [employeeId, employeeId, employeeId, employeeId]
    );

    // One word the dashboard card can show
    let attendanceLabel = 'Not marked';
    if (todayRecord) {
      if (todayRecord.verification_status === 'Rejected') attendanceLabel = 'Rejected';
      else if (todayRecord.check_out) attendanceLabel = 'Checked out';
      else attendanceLabel = 'Checked in';
    }

    res.json({
      success: true,
      message: 'Employee dashboard',
      data: {
        today: profile.today,
        employee: {
          employee_id: profile.employee_id,
          full_name: fullName(profile.first_name, profile.last_name),
          designation: profile.designation,
          department_id: profile.department_id,
          department_name: profile.department_name,
          profile_photo_url: toFileUrl(profile.profile_photo),
        },
        today_attendance: {
          status: attendanceLabel,
          record: todayRecord && {
            ...todayRecord,
            total_hours: todayRecord.total_hours === null ? null : Number(todayRecord.total_hours),
          },
        },
        tasks: toNumbers(taskCounts),
        documents: toNumbers(documentCounts),
        recent_activity: activity,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getAdminDashboard, getEmployeeDashboard };
