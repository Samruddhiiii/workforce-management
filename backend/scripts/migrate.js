// scripts/migrate.js
// Brings your EXISTING workforce_management tables up to what the app needs,
// without deleting or renaming anything and without losing any rows.
//
// Run with:  npm run migrate
//
// It is safe to run many times: every step first checks whether it is
// already done (using MySQL's information_schema) and skips it if so.
//
// Changes:
//  1. employees.designation               (new column)
//  2. attendance.admin_remarks            (new column)
//  3. employee_documents.verification_status (new column, default 'Pending')
//  4. employee_documents.admin_remarks    (new column)
//  5. tasks.assigned_by now references users.user_id instead of
//     employees.employee_id, so the Admin (who has no employee row) can
//     create tasks. Existing values are converted to the matching user_id.

require('dotenv').config({ quiet: true });
const pool = require('../config/db');

const DB = process.env.DB_NAME;

// Does table.column exist?
async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DB, table, column]
  );
  return rows.length > 0;
}

// Which foreign keys exist on table.column, and what do they point to?
async function getForeignKeys(table, column) {
  const [rows] = await pool.query(
    `SELECT CONSTRAINT_NAME AS name, REFERENCED_TABLE_NAME AS refTable
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [DB, table, column]
  );
  return rows;
}

// Adds a column only if it is missing.
// (Table/column names can't be "?" placeholders; these are fixed strings
//  written in this file, never user input, so building the SQL is safe.)
async function addColumnIfMissing(table, column, definition) {
  if (await columnExists(table, column)) {
    console.log(`   ⏭️  ${table}.${column} already exists`);
    return;
  }
  await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`   ✅ Added ${table}.${column}`);
}

async function migrateTasksAssignedBy() {
  const fks = await getForeignKeys('tasks', 'assigned_by');

  if (fks.some((fk) => fk.refTable === 'users')) {
    console.log('   ⏭️  tasks.assigned_by already references users');
    return;
  }

  const oldFk = fks.find((fk) => fk.refTable === 'employees');
  if (!oldFk) {
    // Neither the old nor the new FK exists: we can't tell whether the values
    // are employee_ids or user_ids, so stop and let a human check.
    throw new Error('tasks.assigned_by has no foreign key - check the data manually before migrating');
  }

  // 1) remove the old rule, 2) convert employee_id -> user_id, 3) add the new rule
  await pool.query(`ALTER TABLE tasks DROP FOREIGN KEY \`${oldFk.name}\``);
  const [result] = await pool.query(
    `UPDATE tasks t
       JOIN employees e ON e.employee_id = t.assigned_by
        SET t.assigned_by = e.user_id`
  );
  await pool.query(
    `ALTER TABLE tasks
       ADD CONSTRAINT fk_tasks_assigned_by
       FOREIGN KEY (assigned_by) REFERENCES users (user_id)`
  );
  console.log(`   ✅ tasks.assigned_by now references users (${result.affectedRows} existing task(s) converted)`);
}

(async () => {
  try {
    console.log(`Migrating database "${DB}"...`);

    await addColumnIfMissing('employees', 'designation', 'VARCHAR(100) NULL AFTER `department_id`');
    await addColumnIfMissing('attendance', 'admin_remarks', 'VARCHAR(255) NULL AFTER `verification_status`');
    await addColumnIfMissing(
      'employee_documents',
      'verification_status',
      "ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending' AFTER `file_path`"
    );
    await addColumnIfMissing('employee_documents', 'admin_remarks', 'VARCHAR(255) NULL AFTER `verification_status`');
    await migrateTasksAssignedBy();

    console.log('✅ Migration finished');
  } catch (error) {
    console.error('❌ Migration failed:', error.code || '', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
