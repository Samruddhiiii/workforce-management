// controllers/taskController.js
// Tasks are created by an Admin and assigned to one employee.
//
//   Admin:    create, list/filter, view, edit, delete, change status
//   Employee: list and view THEIR OWN tasks, change the status of their own
//             task to "In Progress" or "Completed" - nothing else
//
// assigned_by is ALWAYS the logged-in admin's user_id from the session.
// It is never read from the request body, so nobody can fake who assigned a task.
//
// Note: the existing column is called task_title. The API uses the same
// name; "title" is accepted as an alias in request bodies.

const pool = require('../config/db');
const { cleanString, toPositiveInt, isValidDate, checkStringFields, escapeLike } = require('../utils/validators');

const PRIORITIES = ['Low', 'Medium', 'High'];
const STATUSES = ['Pending', 'In Progress', 'Completed'];
const EMPLOYEE_STATUSES = ['In Progress', 'Completed']; // what an employee may set
const MAX_TITLE_LENGTH = 150;      // tasks.task_title is VARCHAR(150)
const MAX_DESCRIPTION_LENGTH = 5000;

// assigned_by points to users. Admins have no employee row, so the name
// comes from employees when there is one (legacy Manager rows) and the
// email is always available.
const TASK_SELECT = `
  SELECT t.task_id, t.task_title, t.description, t.priority, t.status, t.due_date, t.created_at,
         t.assigned_to, e.first_name, e.last_name, e.department_id, d.department_name,
         t.assigned_by, ub.email AS assigned_by_email,
         NULLIF(CONCAT_WS(' ', eb.first_name, eb.last_name), '') AS assigned_by_name,
         (t.due_date < CURDATE() AND t.status <> 'Completed') AS is_overdue
    FROM tasks t
    JOIN employees e ON e.employee_id = t.assigned_to
    LEFT JOIN departments d ON d.department_id = e.department_id
    LEFT JOIN users ub ON ub.user_id = t.assigned_by
    LEFT JOIN employees eb ON eb.user_id = t.assigned_by`;

// Unfinished first, then nearest due date (no date last), then High priority first
const TASK_ORDER = `
  ORDER BY t.status = 'Completed', t.due_date IS NULL, t.due_date,
           FIELD(t.priority, 'High', 'Medium', 'Low'), t.task_id DESC`;

function formatTask(row) {
  return {
    task_id: row.task_id,
    task_title: row.task_title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    due_date: row.due_date,
    is_overdue: row.is_overdue === 1,
    created_at: row.created_at,
    assigned_to: row.assigned_to,
    assigned_to_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
    department_id: row.department_id,
    department_name: row.department_name,
    assigned_by: row.assigned_by,
    assigned_by_name: row.assigned_by_name || row.assigned_by_email,
    assigned_by_email: row.assigned_by_email,
  };
}

async function findTaskById(taskId) {
  const [rows] = await pool.query(`${TASK_SELECT} WHERE t.task_id = ?`, [taskId]);
  return rows[0] ? formatTask(rows[0]) : null;
}

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}
function taskNotFound(res) {
  return res.status(404).json({ success: false, message: 'Task not found' });
}

// ---------------------------------------------------------------------
// Reads and validates the task fields present in `body`.
// Returns { updates: { column: value }, errors: [] }. Absent fields are skipped.
// `current` is the task being edited (null when creating). Values that are
// unchanged are accepted even if they would not be allowed for a new task -
// so the Admin can still edit an overdue task, or one whose employee left.
// ---------------------------------------------------------------------
async function readTaskFields(body, current = null) {
  const updates = {};
  const errors = checkStringFields(body, ['task_title', 'title', 'description', 'due_date', 'priority', 'status']);
  if (errors.length > 0) return { updates, errors };

  const rawTitle = body.task_title !== undefined ? body.task_title : body.title;
  if (rawTitle !== undefined) {
    const title = cleanString(rawTitle);
    if (!title) errors.push('task_title cannot be empty');
    else if (title.length > MAX_TITLE_LENGTH) errors.push(`task_title must be at most ${MAX_TITLE_LENGTH} characters`);
    else updates.task_title = title;
  }

  if (body.description !== undefined) {
    const description = cleanString(body.description) || null;
    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
    } else {
      updates.description = description;
    }
  }

  if (body.priority !== undefined) {
    const priority = cleanString(body.priority);
    if (!PRIORITIES.includes(priority)) errors.push(`priority must be one of: ${PRIORITIES.join(', ')}`);
    else updates.priority = priority;
  }

  if (body.status !== undefined) {
    const status = cleanString(body.status);
    if (!STATUSES.includes(status)) errors.push(`status must be one of: ${STATUSES.join(', ')}`);
    else updates.status = status;
  }

  if (body.due_date !== undefined) {
    const dueDate = cleanString(body.due_date) || null;
    if (dueDate && !isValidDate(dueDate)) {
      errors.push('due_date must be a valid date in the format YYYY-MM-DD');
    } else if (dueDate && current && dueDate === current.due_date) {
      updates.due_date = dueDate; // unchanged
    } else if (dueDate) {
      const [[{ today }]] = await pool.query('SELECT CURDATE() AS today');
      if (dueDate < today) errors.push(`due_date cannot be in the past (today is ${today})`);
      else updates.due_date = dueDate;
    } else {
      updates.due_date = null; // "" or null removes the due date
    }
  }

  if (body.assigned_to !== undefined) {
    const employeeId = toPositiveInt(body.assigned_to);
    if (!employeeId) {
      errors.push('assigned_to must be an employee_id (a number)');
    } else if (current && employeeId === current.assigned_to) {
      updates.assigned_to = employeeId; // unchanged
    } else {
      const [rows] = await pool.query(
        "SELECT COALESCE(employment_status, 'Active') AS status FROM employees WHERE employee_id = ?",
        [employeeId]
      );
      if (rows.length === 0) errors.push(`Employee ${employeeId} does not exist`);
      else if (rows[0].status !== 'Active') errors.push(`Employee ${employeeId} is inactive and cannot be given tasks`);
      else updates.assigned_to = employeeId;
    }
  }

  return { updates, errors };
}

// Reads ?status= &priority= into SQL conditions. Returns { conditions, values } or { error }.
function readStatusPriorityFilters(query) {
  const conditions = [];
  const values = [];
  if (query.status !== undefined && query.status !== '') {
    if (!STATUSES.includes(query.status)) return { error: `status must be one of: ${STATUSES.join(', ')}` };
    conditions.push('t.status = ?');
    values.push(query.status);
  }
  if (query.priority !== undefined && query.priority !== '') {
    if (!PRIORITIES.includes(query.priority)) return { error: `priority must be one of: ${PRIORITIES.join(', ')}` };
    conditions.push('t.priority = ?');
    values.push(query.priority);
  }
  if (query.overdue === 'true' || query.overdue === '1') {
    conditions.push("t.due_date < CURDATE() AND t.status <> 'Completed'");
  }
  return { conditions, values };
}

// =====================================================================
// ADMIN ENDPOINTS
// =====================================================================

// ---------------------------------------------------------------------
// POST /api/tasks   (Admin)
// Body: task_title (or title), assigned_to, description?, due_date?,
//       priority? (default Medium), status? (default Pending)
// ---------------------------------------------------------------------
async function createTask(req, res, next) {
  try {
    const { updates: fields, errors } = await readTaskFields(req.body);
    if (req.body.task_title === undefined && req.body.title === undefined) errors.push('task_title is required');
    if (req.body.assigned_to === undefined) errors.push('assigned_to (employee_id) is required');
    if (errors.length > 0) return badRequest(res, errors.join('. '));

    const row = { priority: 'Medium', status: 'Pending', ...fields, assigned_by: req.user.user_id };
    const columns = Object.keys(row); // all from our own allow-list above
    const [result] = await pool.query(
      `INSERT INTO tasks (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      columns.map((column) => row[column])
    );

    const task = await findTaskById(result.insertId);
    res.status(201).json({ success: true, message: `Task assigned to ${task.assigned_to_name}`, data: task });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// GET /api/tasks?employee_id=&status=&priority=&search=&overdue=true   (Admin)
// ---------------------------------------------------------------------
async function listTasks(req, res, next) {
  const filters = readStatusPriorityFilters(req.query);
  if (filters.error) return badRequest(res, filters.error);
  const { conditions, values } = filters;

  if (req.query.employee_id !== undefined && req.query.employee_id !== '') {
    const employeeId = toPositiveInt(req.query.employee_id);
    if (!employeeId) return badRequest(res, 'employee_id must be a number');
    conditions.push('t.assigned_to = ?');
    values.push(employeeId);
  }

  if (req.query.search !== undefined) {
    if (typeof req.query.search !== 'string') return badRequest(res, 'search must be a single text value');
    const term = req.query.search.trim();
    if (term.length > 100) return badRequest(res, 'search must be at most 100 characters');
    if (term) {
      conditions.push('t.task_title LIKE ?');
      values.push(`%${escapeLike(term)}%`);
    }
  }

  try {
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(`${TASK_SELECT} ${where} ${TASK_ORDER}`, values);
    res.json({ success: true, message: `${rows.length} task(s) found`, data: rows.map(formatTask) });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// PUT /api/tasks/:id   (Admin) - partial update, send only what changes
// ---------------------------------------------------------------------
async function updateTask(req, res, next) {
  const taskId = toPositiveInt(req.params.id);
  if (!taskId) return badRequest(res, 'Invalid task id');

  try {
    const current = await findTaskById(taskId);
    if (!current) return taskNotFound(res);

    const { updates, errors } = await readTaskFields(req.body, current);
    if (errors.length > 0) return badRequest(res, errors.join('. '));
    if (Object.keys(updates).length === 0) {
      return badRequest(res, 'Nothing to update. Editable fields: task_title, description, assigned_to, due_date, priority, status');
    }

    const columns = Object.keys(updates);
    await pool.query(
      `UPDATE tasks SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE task_id = ?`,
      [...columns.map((column) => updates[column]), taskId]
    );

    const task = await findTaskById(taskId);
    res.json({ success: true, message: 'Task updated', data: task });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// DELETE /api/tasks/:id   (Admin)
// ---------------------------------------------------------------------
async function deleteTask(req, res, next) {
  const taskId = toPositiveInt(req.params.id);
  if (!taskId) return badRequest(res, 'Invalid task id');

  try {
    const task = await findTaskById(taskId);
    if (!task) return taskNotFound(res);
    await pool.query('DELETE FROM tasks WHERE task_id = ?', [taskId]);
    res.json({ success: true, message: 'Task deleted', data: task });
  } catch (error) {
    next(error);
  }
}

// =====================================================================
// ENDPOINTS FOR BOTH ROLES
// =====================================================================

// ---------------------------------------------------------------------
// GET /api/tasks/:id   (Admin: any task. Employee: only their own)
// Another employee's task answers 404 - we don't reveal that it exists.
// ---------------------------------------------------------------------
async function getTaskById(req, res, next) {
  const taskId = toPositiveInt(req.params.id);
  if (!taskId) return badRequest(res, 'Invalid task id');

  try {
    const task = await findTaskById(taskId);
    if (!task) return taskNotFound(res);
    if (req.user.role === 'employee' && task.assigned_to !== req.user.employee_id) return taskNotFound(res);
    res.json({ success: true, message: 'Task fetched', data: task });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------
// PATCH /api/tasks/:id/status   Body: { "status": "In Progress" | "Completed" }
// Employee: own tasks only, and only In Progress / Completed.
// Admin:    any task, any status (also back to Pending).
// Other fields in the body are ignored (an employee can't change the title,
// due date, priority or assignee) and listed in the message.
// ---------------------------------------------------------------------
async function updateTaskStatus(req, res, next) {
  const taskId = toPositiveInt(req.params.id);
  if (!taskId) return badRequest(res, 'Invalid task id');

  const isEmployee = req.user.role === 'employee';
  const allowed = isEmployee ? EMPLOYEE_STATUSES : STATUSES;
  const typeErrors = checkStringFields(req.body, ['status']);
  if (typeErrors.length > 0) return badRequest(res, typeErrors[0]);
  const status = cleanString(req.body.status);
  if (!status) return badRequest(res, `status is required (one of: ${allowed.join(', ')})`);
  if (!allowed.includes(status)) {
    return badRequest(res, isEmployee
      ? `Employees can set the status to ${EMPLOYEE_STATUSES.map((s) => `"${s}"`).join(' or ')}`
      : `status must be one of: ${STATUSES.join(', ')}`);
  }

  try {
    const task = await findTaskById(taskId);
    if (!task) return taskNotFound(res);
    if (isEmployee && task.assigned_to !== req.user.employee_id) return taskNotFound(res);

    const ignored = Object.keys(req.body).filter((key) => key !== 'status');
    const note = ignored.length > 0 ? ` Ignored fields (only the status can change here): ${ignored.join(', ')}` : '';

    if (task.status === status) {
      return res.json({ success: true, message: `Task is already "${status}".${note}`, data: task });
    }

    await pool.query('UPDATE tasks SET status = ? WHERE task_id = ?', [status, taskId]);
    const updated = await findTaskById(taskId);
    res.json({ success: true, message: `Task status changed to "${status}".${note}`, data: updated });
  } catch (error) {
    next(error);
  }
}

// =====================================================================
// EMPLOYEE ENDPOINTS
// =====================================================================

// ---------------------------------------------------------------------
// GET /api/tasks/my?status=&priority=&overdue=true   (Employee)
// ---------------------------------------------------------------------
async function getMyTasks(req, res, next) {
  const filters = readStatusPriorityFilters(req.query);
  if (filters.error) return badRequest(res, filters.error);

  try {
    const conditions = ['t.assigned_to = ?', ...filters.conditions];
    const [rows] = await pool.query(
      `${TASK_SELECT} WHERE ${conditions.join(' AND ')} ${TASK_ORDER}`,
      [req.user.employee_id, ...filters.values]
    );
    res.json({ success: true, message: `${rows.length} task(s) found`, data: rows.map(formatTask) });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createTask,
  listTasks,
  updateTask,
  deleteTask,
  getTaskById,
  updateTaskStatus,
  getMyTasks,
};
