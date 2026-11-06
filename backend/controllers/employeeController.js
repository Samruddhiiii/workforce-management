// controllers/employeeController.js
// Employee profiles.
//   Admin:    list/search/filter, view one, create (users + employees in a
//             transaction), edit, deactivate.
//   Employee: view and edit THEIR OWN profile (+ profile photo).
//
// Employees are identified from the session (req.user.employee_id), never
// from an id in the URL, so they cannot reach anyone else's profile.

const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { DB_ROLE_EMPLOYEE, toAppRole } = require('../utils/roles');
const { toFileUrl, toStoredPath, removeUploadedFile } = require('../utils/files');
const {
  cleanString,
  normalizeEmail,
  isValidEmail,
  toPositiveInt,
  checkStringFields,
  normalizePhone,
  splitFullName,
  validatePassword,
  isValidDate,
  escapeLike,
} = require('../utils/validators');

const EMPLOYMENT_STATUSES = ['Active', 'Inactive'];

// Fields each kind of user may change
const ADMIN_EDITABLE_FIELDS = [
  'first_name', 'last_name', 'full_name', 'email', 'phone', 'address',
  'designation', 'department_id', 'date_of_joining', 'employment_status',
];
const SELF_EDITABLE_FIELDS = ['first_name', 'last_name', 'full_name', 'phone', 'address'];
// Fields an employee might send but must NOT be able to change
const SELF_FORBIDDEN_FIELDS = ['email', 'role', 'department_id', 'designation', 'employment_status', 'date_of_joining', 'password'];

// One SELECT used everywhere, so every endpoint returns the same shape.
const EMPLOYEE_SELECT = `
  SELECT e.employee_id, e.user_id, u.email, u.role,
         e.first_name, e.last_name, e.phone, e.address, e.designation,
         e.department_id, d.department_name, e.date_of_joining,
         e.employment_status, e.profile_photo
    FROM employees e
    JOIN users u ON u.user_id = e.user_id
    LEFT JOIN departments d ON d.department_id = e.department_id`;

// DB row -> API object (adds full_name and a URL for the photo)
function formatEmployee(row) {
  return {
    employee_id: row.employee_id,
    user_id: row.user_id,
    email: row.email,
    role: toAppRole(row.role), // Managers are shown as employees in this app
    first_name: row.first_name,
    last_name: row.last_name,
    full_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
    phone: row.phone,
    address: row.address,
    designation: row.designation,
    department_id: row.department_id,
    department_name: row.department_name,
    date_of_joining: row.date_of_joining,
    employment_status: row.employment_status || 'Active',
    profile_photo: row.profile_photo,
    profile_photo_url: toFileUrl(row.profile_photo),
  };
}

async function findEmployeeById(employeeId) {
  const [rows] = await pool.query(`${EMPLOYEE_SELECT} WHERE e.employee_id = ?`, [employeeId]);
  return rows[0] ? formatEmployee(rows[0]) : null;
}

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}
function employeeNotFound(res) {
  return res.status(404).json({ success: false, message: 'Employee not found' });
}

// ---------------------------------------------------------------------
// Reads and validates the editable fields present in `body`.
// Only fields listed in `allowedFields` are looked at. Returns:
//   employeeUpdates: { column: value } for the employees table
//   email:           new email (for the users table) or undefined
//   errors:          array of messages
// Fields that are absent are left untouched (partial update).
// ---------------------------------------------------------------------
async function readEmployeeFields(body, allowedFields) {
  const has = (field) => allowedFields.includes(field) && body[field] !== undefined;
  const employeeUpdates = {};
  const errors = checkStringFields(
    body,
    ['first_name', 'last_name', 'full_name', 'email', 'address', 'designation', 'date_of_joining', 'employment_status']
      .filter((field) => allowedFields.includes(field))
  );
  if (errors.length > 0) return { employeeUpdates, errors };

  // Name: first_name/last_name, or full_name split into both
  if (has('first_name') || has('last_name')) {
    if (has('first_name')) employeeUpdates.first_name = cleanString(body.first_name);
    if (has('last_name')) employeeUpdates.last_name = cleanString(body.last_name) || null;
  } else if (has('full_name')) {
    Object.assign(employeeUpdates, splitFullName(body.full_name));
  }
  if ('first_name' in employeeUpdates) {
    if (!employeeUpdates.first_name) errors.push('First name cannot be empty');
    else if (employeeUpdates.first_name.length > 50) errors.push('First name must be at most 50 characters');
  }
  if (employeeUpdates.last_name && employeeUpdates.last_name.length > 50) {
    errors.push('Last name must be at most 50 characters');
  }

  if (has('phone')) {
    const { phone, error } = normalizePhone(body.phone);
    if (error) errors.push(error);
    else employeeUpdates.phone = phone;
  }

  if (has('address')) {
    const address = cleanString(body.address) || null;
    if (address && address.length > 500) errors.push('Address must be at most 500 characters');
    else employeeUpdates.address = address;
  }

  if (has('designation')) {
    const designation = cleanString(body.designation) || null;
    if (designation && designation.length > 100) errors.push('Designation must be at most 100 characters');
    else employeeUpdates.designation = designation;
  }

  if (has('date_of_joining')) {
    const date = cleanString(body.date_of_joining) || null;
    if (date && !isValidDate(date)) errors.push('date_of_joining must be a valid date in the format YYYY-MM-DD');
    else employeeUpdates.date_of_joining = date;
  }

  if (has('employment_status')) {
    const status = cleanString(body.employment_status);
    if (!EMPLOYMENT_STATUSES.includes(status)) errors.push('employment_status must be "Active" or "Inactive"');
    else employeeUpdates.employment_status = status;
  }

  if (has('department_id')) {
    const departmentId = toPositiveInt(body.department_id);
    if (!departmentId) {
      errors.push('department_id must be a department number');
    } else {
      const [rows] = await pool.query('SELECT 1 FROM departments WHERE department_id = ?', [departmentId]);
      if (rows.length === 0) errors.push(`Department ${departmentId} does not exist`);
      else employeeUpdates.department_id = departmentId;
    }
  }

  let email;
  if (has('email')) {
    email = normalizeEmail(body.email);
    if (!isValidEmail(email)) errors.push('Please enter a valid email address');
  }

  return { employeeUpdates, email, errors };
}

// Builds "col1 = ?, col2 = ?" + values from { col1: v1, col2: v2 }.
// Column names come from our own allow-list above, never from the client.
function buildSetClause(updates) {
  const columns = Object.keys(updates);
  return {
    sql: columns.map((column) => `${column} = ?`).join(', '),
    values: columns.map((column) => updates[column]),
  };
}

// =====================================================================
// ADMIN ENDPOINTS
// =====================================================================

// ---------------------------------------------------------------------
// GET /api/employees?search=&department_id=&status=   (Admin)
// search: matches first name, last name, full name or email
// status: Active | Inactive (omit for all)
// ---------------------------------------------------------------------
async function listEmployees(req, res, next) {
  const { search, department_id, status } = req.query;
  const conditions = [];
  const values = [];

  if (search !== undefined) {
    if (typeof search !== 'string') return badRequest(res, 'search must be a single text value');
    const term = search.trim();
    if (term.length > 100) return badRequest(res, 'search must be at most 100 characters');
    if (term) {
      const like = `%${escapeLike(term)}%`;
      conditions.push("(CONCAT_WS(' ', e.first_name, e.last_name) LIKE ? OR u.email LIKE ?)");
      values.push(like, like);
    }
  }

  if (department_id !== undefined && department_id !== '') {
    const departmentId = toPositiveInt(department_id);
    if (!departmentId) return badRequest(res, 'department_id must be a department number');
    conditions.push('e.department_id = ?');
    values.push(departmentId);
  }

  if (status !== undefined && status !== '') {
    if (!EMPLOYMENT_STATUSES.includes(status)) return badRequest(res, 'status must be "Active" or "Inactive"');
    // Old rows may have NULL status, which the column default treats as Active
    conditions.push("COALESCE(e.employment_status, 'Active') = ?");
    values.push(status);
  }

  try {
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(`${EMPLOYEE_SELECT} ${where} ORDER BY e.first_name, e.last_name`, values);
    res.json({ success: true, message: `${rows.length} employee(s) found`, data: rows.map(formatEmployee) });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// GET /api/employees/:id   (Admin) - profile plus a few activity counts
// ---------------------------------------------------------------------
async function getEmployeeById(req, res, next) {
  const employeeId = toPositiveInt(req.params.id);
  if (!employeeId) return badRequest(res, 'Invalid employee id');

  try {
    const employee = await findEmployeeById(employeeId);
    if (!employee) return employeeNotFound(res);

    const [[stats]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM tasks WHERE assigned_to = ? AND status = 'Pending')     AS pending_tasks,
         (SELECT COUNT(*) FROM tasks WHERE assigned_to = ? AND status = 'In Progress') AS in_progress_tasks,
         (SELECT COUNT(*) FROM tasks WHERE assigned_to = ? AND status = 'Completed')   AS completed_tasks,
         (SELECT COUNT(*) FROM attendance WHERE employee_id = ?)                       AS attendance_records,
         (SELECT COUNT(*) FROM employee_documents WHERE employee_id = ?)               AS documents`,
      [employeeId, employeeId, employeeId, employeeId, employeeId]
    );

    res.json({ success: true, message: 'Employee fetched', data: { ...employee, stats } });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// POST /api/employees   (Admin)
// Body: first_name (+ last_name) or full_name, email, password, department_id,
//       designation?, phone?, address?, date_of_joining? (default today),
//       employment_status? (default Active)
// Creates the users row AND the employees row in ONE transaction.
// ---------------------------------------------------------------------
async function createEmployee(req, res, next) {
  const body = req.body;
  let connection;
  try {
    const { employeeUpdates: fields, email, errors } = await readEmployeeFields(body, ADMIN_EDITABLE_FIELDS);

    // Required for a NEW employee (readEmployeeFields only checks fields that were sent)
    if (fields.first_name === undefined && !errors.some((e) => e.startsWith('First name'))) {
      errors.push('First name is required (send "first_name", or "full_name")');
    }
    if (body.email === undefined) errors.push('Email is required');
    if (body.department_id === undefined) errors.push('department_id is required');
    const passwordError = checkStringFields(body, ['password'])[0] || validatePassword(body.password);
    if (passwordError) errors.push(passwordError);
    if (errors.length > 0) return badRequest(res, errors.join('. '));

    const [existing] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [userResult] = await connection.query(
      'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
      [email, passwordHash, DB_ROLE_EMPLOYEE]
    );

    // Defaults first, then whatever the admin sent overrides them.
    // date_of_joining defaults to today's date from MySQL (same clock as the rest of the app).
    const [[{ today }]] = await connection.query('SELECT CURDATE() AS today');
    const employeeRow = {
      user_id: userResult.insertId,
      date_of_joining: today,
      employment_status: 'Active',
      ...fields,
    };
    if (!employeeRow.date_of_joining) employeeRow.date_of_joining = today; // sent as "" or null

    // Column names come from our allow-list (readEmployeeFields), values are placeholders
    const columns = Object.keys(employeeRow);
    const [employeeResult] = await connection.query(
      `INSERT INTO employees (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      columns.map((column) => employeeRow[column])
    );

    await connection.commit();

    const employee = await findEmployeeById(employeeResult.insertId);
    res.status(201).json({ success: true, message: 'Employee created', data: employee });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }
    next(error);
  } finally {
    if (connection) connection.release();
  }
}

// ---------------------------------------------------------------------
// PUT /api/employees/:id   (Admin) - partial update, send only what changes
// Editable: first_name, last_name (or full_name), email, phone, address,
//           designation, department_id, date_of_joining, employment_status
// ---------------------------------------------------------------------
async function updateEmployee(req, res, next) {
  const employeeId = toPositiveInt(req.params.id);
  if (!employeeId) return badRequest(res, 'Invalid employee id');

  let connection;
  try {
    const current = await findEmployeeById(employeeId);
    if (!current) return employeeNotFound(res);

    const { employeeUpdates, email, errors } = await readEmployeeFields(req.body, ADMIN_EDITABLE_FIELDS);
    if (errors.length > 0) return badRequest(res, errors.join('. '));

    const emailChanged = email !== undefined && email !== current.email;
    if (Object.keys(employeeUpdates).length === 0 && !emailChanged) {
      if (email !== undefined) {
        return res.json({ success: true, message: 'Nothing changed', data: current });
      }
      return badRequest(res, `Nothing to update. Editable fields: ${ADMIN_EDITABLE_FIELDS.join(', ')}`);
    }

    // Email lives in users, the rest in employees -> one transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();

    if (emailChanged) {
      await connection.query('UPDATE users SET email = ? WHERE user_id = ?', [email, current.user_id]);
    }
    if (Object.keys(employeeUpdates).length > 0) {
      const { sql, values } = buildSetClause(employeeUpdates);
      await connection.query(`UPDATE employees SET ${sql} WHERE employee_id = ?`, [...values, employeeId]);
    }

    await connection.commit();

    const employee = await findEmployeeById(employeeId);
    res.json({ success: true, message: 'Employee updated', data: employee });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Another account already uses this email' });
    }
    next(error);
  } finally {
    if (connection) connection.release();
  }
}

// ---------------------------------------------------------------------
// DELETE /api/employees/:id   (Admin)
// Deactivates instead of deleting: attendance, tasks and documents stay for
// history, and the employee can no longer log in (their open session is
// ended on their next request by requireAuth).
// ---------------------------------------------------------------------
async function deactivateEmployee(req, res, next) {
  const employeeId = toPositiveInt(req.params.id);
  if (!employeeId) return badRequest(res, 'Invalid employee id');

  try {
    const current = await findEmployeeById(employeeId);
    if (!current) return employeeNotFound(res);

    if (current.employment_status === 'Inactive') {
      return res.json({ success: true, message: 'Employee is already inactive', data: current });
    }

    await pool.query("UPDATE employees SET employment_status = 'Inactive' WHERE employee_id = ?", [employeeId]);
    const employee = await findEmployeeById(employeeId);
    res.json({ success: true, message: 'Employee deactivated', data: employee });
  } catch (error) {
    next(error);
  }
}

// =====================================================================
// EMPLOYEE (SELF) ENDPOINTS
// =====================================================================

// ---------------------------------------------------------------------
// GET /api/employees/me   (Employee)
// ---------------------------------------------------------------------
async function getMyProfile(req, res, next) {
  try {
    const employee = await findEmployeeById(req.user.employee_id);
    if (!employee) return employeeNotFound(res);
    res.json({ success: true, message: 'Profile fetched', data: employee });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// PUT /api/employees/me   (Employee)
// JSON or multipart/form-data. Editable: first_name, last_name (or
// full_name), phone, address, and the file field "profile_photo".
// Role, email, department, designation and status are NOT editable here;
// if sent, they are ignored and listed in the response message.
// ---------------------------------------------------------------------
async function updateMyProfile(req, res, next) {
  const newPhoto = req.file; // set by uploadProfilePhoto, or undefined
  const employeeId = req.user.employee_id;

  try {
    const { employeeUpdates, errors } = await readEmployeeFields(req.body, SELF_EDITABLE_FIELDS);
    if (errors.length > 0) {
      await removeUploadedFile(newPhoto); // don't keep a file for a rejected request
      return badRequest(res, errors.join('. '));
    }

    if (newPhoto) employeeUpdates.profile_photo = toStoredPath('profiles', newPhoto.filename);

    if (Object.keys(employeeUpdates).length === 0) {
      return badRequest(res, `Nothing to update. Editable fields: ${SELF_EDITABLE_FIELDS.join(', ')}, and the file "profile_photo"`);
    }

    // Remember the old photo so we can delete it after a successful update
    const [photoRows] = await pool.query('SELECT profile_photo FROM employees WHERE employee_id = ?', [employeeId]);
    const oldPhoto = photoRows.length > 0 ? photoRows[0].profile_photo : null;

    const { sql, values } = buildSetClause(employeeUpdates);
    await pool.query(`UPDATE employees SET ${sql} WHERE employee_id = ?`, [...values, employeeId]);

    if (newPhoto && oldPhoto && oldPhoto !== employeeUpdates.profile_photo) {
      await removeUploadedFile(oldPhoto);
    }

    const ignored = SELF_FORBIDDEN_FIELDS.filter((field) => req.body[field] !== undefined);
    const employee = await findEmployeeById(employeeId);
    res.json({
      success: true,
      message: ignored.length > 0
        ? `Profile updated. Ignored fields you cannot change yourself: ${ignored.join(', ')}`
        : 'Profile updated',
      data: employee,
    });
  } catch (error) {
    await removeUploadedFile(newPhoto); // the DB was not updated, so drop the new file
    next(error);
  }
}

module.exports = {
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
  getMyProfile,
  updateMyProfile,
};
