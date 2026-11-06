// controllers/departmentController.js
// CRUD for the departments table (department_id, department_name, description).
//
// GET is PUBLIC because the registration form must show the department list
// before the user has an account (employees.department_id is required).
// It only returns names/descriptions/headcounts - nothing private.

const pool = require('../config/db');
const { cleanString, toPositiveInt, checkStringFields } = require('../utils/validators');

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

// Validates name/description for create and update. Returns { values, errors }.
function readDepartmentInput(body) {
  const errors = checkStringFields(body, ['department_name', 'description']);
  if (errors.length > 0) return { errors };

  const department_name = cleanString(body.department_name);
  const description = cleanString(body.description) || null;

  if (!department_name) errors.push('department_name is required');
  else if (department_name.length > 100) errors.push('department_name must be at most 100 characters');
  if (description && description.length > 1000) errors.push('description must be at most 1000 characters');

  return { values: { department_name, description }, errors };
}

// ---------------------------------------------------------------------
// GET /api/departments   (Public)
// Includes how many employees are in each department, so the Admin page
// can show it and grey out "Delete" for departments that are in use.
// ---------------------------------------------------------------------
async function getDepartments(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT d.department_id, d.department_name, d.description,
              COUNT(e.employee_id) AS employee_count,
              COALESCE(SUM(e.employment_status = 'Active'), 0) AS active_employee_count
         FROM departments d
         LEFT JOIN employees e ON e.department_id = d.department_id
        GROUP BY d.department_id, d.department_name, d.description
        ORDER BY d.department_name`
    );
    // SUM() comes back from MySQL as a string ("3"), so convert to numbers
    const departments = rows.map((row) => ({
      ...row,
      employee_count: Number(row.employee_count),
      active_employee_count: Number(row.active_employee_count),
    }));
    res.json({ success: true, message: 'Departments fetched', data: departments });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// POST /api/departments   (Admin)   Body: { department_name, description? }
// ---------------------------------------------------------------------
async function createDepartment(req, res, next) {
  const { values, errors } = readDepartmentInput(req.body);
  if (errors.length > 0) return badRequest(res, errors.join('. '));

  try {
    const [result] = await pool.query(
      'INSERT INTO departments (department_name, description) VALUES (?, ?)',
      [values.department_name, values.description]
    );
    res.status(201).json({
      success: true,
      message: 'Department created',
      data: { department_id: result.insertId, ...values, employee_count: 0, active_employee_count: 0 },
    });
  } catch (error) {
    // UNIQUE(department_name). The table's collation is case-insensitive,
    // so "it" and "IT" count as the same name.
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: `A department named "${values.department_name}" already exists` });
    }
    next(error);
  }
}

// ---------------------------------------------------------------------
// PUT /api/departments/:id   (Admin)   Body: { department_name, description? }
// ---------------------------------------------------------------------
async function updateDepartment(req, res, next) {
  const departmentId = toPositiveInt(req.params.id);
  if (!departmentId) return badRequest(res, 'Invalid department id');

  const { values, errors } = readDepartmentInput(req.body);
  if (errors.length > 0) return badRequest(res, errors.join('. '));

  try {
    const [result] = await pool.query(
      'UPDATE departments SET department_name = ?, description = ? WHERE department_id = ?',
      [values.department_name, values.description, departmentId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }
    res.json({ success: true, message: 'Department updated', data: { department_id: departmentId, ...values } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: `A department named "${values.department_name}" already exists` });
    }
    next(error);
  }
}

// ---------------------------------------------------------------------
// DELETE /api/departments/:id   (Admin)
// Blocked while ANY employee (active or inactive) still belongs to it,
// because employees.department_id is a required foreign key.
// ---------------------------------------------------------------------
async function deleteDepartment(req, res, next) {
  const departmentId = toPositiveInt(req.params.id);
  if (!departmentId) return badRequest(res, 'Invalid department id');

  try {
    const [departments] = await pool.query(
      'SELECT department_name FROM departments WHERE department_id = ?',
      [departmentId]
    );
    if (departments.length === 0) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM employees WHERE department_id = ?',
      [departmentId]
    );
    if (count > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete "${departments[0].department_name}": ${count} employee(s) are still assigned to it. ` +
          'Move them to another department first.',
      });
    }

    await pool.query('DELETE FROM departments WHERE department_id = ?', [departmentId]);
    res.json({ success: true, message: 'Department deleted', data: { department_id: departmentId } });
  } catch (error) {
    // Safety net: an employee was assigned between our check and the delete
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ success: false, message: 'Cannot delete: employees are still assigned to this department' });
    }
    next(error);
  }
}

module.exports = { getDepartments, createDepartment, updateDepartment, deleteDepartment };
