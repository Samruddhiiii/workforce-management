// utils/roles.js
// The database stores roles as 'Admin', 'Manager', 'Employee'.
// The APP only has two roles: 'admin' and 'employee'.
//
// Your existing data contains two 'Manager' accounts. By design decision,
// managers are treated exactly like employees inside this app (they get the
// Employee dashboard; manager_id is ignored). Converting in ONE place keeps
// every other file simple: everywhere else we only check 'admin'/'employee'.

const DB_ROLE_ADMIN = 'Admin';
const DB_ROLE_EMPLOYEE = 'Employee';

// 'Admin' -> 'admin'; 'Employee' or 'Manager' -> 'employee'
function toAppRole(dbRole) {
  return dbRole === DB_ROLE_ADMIN ? 'admin' : 'employee';
}

module.exports = { DB_ROLE_ADMIN, DB_ROLE_EMPLOYEE, toAppRole };
