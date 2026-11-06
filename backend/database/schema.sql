-- =====================================================================
-- Workforce Management System - Database Schema
-- File: backend/database/schema.sql
--
-- This file describes the EXISTING workforce_management tables exactly as
-- they are in MySQL (the original design), including the columns added by
-- `npm run migrate` (scripts/migrate.js).
--
--  * On YOUR machine the tables already exist, so running this file
--    changes nothing (CREATE TABLE IF NOT EXISTS skips them).
--  * On a NEW machine it builds the same structure from scratch,
--    after which `npm run migrate` reports every step as already done.
--
-- Run it from the backend folder:
--   PowerShell:      Get-Content database\schema.sql | mysql -u root -p
--   cmd / Git Bash:  mysql -u root -p < database/schema.sql
--
-- Notes about the existing design:
--  * users.role has 'Manager'. The app treats Manager accounts as Employees
--    (see utils/roles.js); manager_id is kept but not used by the app.
--  * attendance.check_in / check_out are TIME values; attendance_date holds the day.
--  * attendance.verification_status: 'Pending' / 'Verified' / 'Rejected'
--    attendance.attendance_status:   e.g. 'Present'
--  * No passwords are stored here. Use `npm run create-admin` and
--    `npm run set-password`, which hash passwords with bcrypt.
--  * The "sessions" table is created automatically by express-mysql-session.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS workforce_management
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE workforce_management;

-- ---------------------------------------------------------------------
-- Table 1: users - login credentials and role
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  user_id        INT          NOT NULL AUTO_INCREMENT,
  email          VARCHAR(100) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,              -- bcrypt hash only
  role           ENUM('Admin','Manager','Employee') NOT NULL,
  created_at     TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (user_id),
  UNIQUE KEY email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- Table 2: departments
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  department_id    INT          NOT NULL AUTO_INCREMENT,
  department_name  VARCHAR(100) NOT NULL,
  description      TEXT,

  PRIMARY KEY (department_id),
  UNIQUE KEY department_name (department_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- Table 3: employees - profile data (1-to-1 with users; admins have none)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  employee_id        INT          NOT NULL AUTO_INCREMENT,
  user_id            INT          NOT NULL,
  department_id      INT          NOT NULL,
  designation        VARCHAR(100) DEFAULT NULL,      -- added by migrate.js
  manager_id         INT          DEFAULT NULL,      -- legacy, unused by the app
  first_name         VARCHAR(50)  NOT NULL,
  last_name          VARCHAR(50)  DEFAULT NULL,
  phone              VARCHAR(15)  DEFAULT NULL,
  address            TEXT,
  profile_photo      VARCHAR(255) DEFAULT NULL,      -- relative file path
  date_of_joining    DATE         DEFAULT NULL,
  employment_status  VARCHAR(20)  DEFAULT 'Active',  -- 'Active' / 'Inactive'

  PRIMARY KEY (employee_id),
  UNIQUE KEY user_id (user_id),
  KEY department_id (department_id),
  KEY manager_id (manager_id),
  CONSTRAINT employees_ibfk_1 FOREIGN KEY (user_id)       REFERENCES users (user_id),
  CONSTRAINT employees_ibfk_2 FOREIGN KEY (department_id) REFERENCES departments (department_id),
  CONSTRAINT employees_ibfk_3 FOREIGN KEY (manager_id)    REFERENCES employees (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- Table 4: attendance - one row per employee per day
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
  attendance_id        INT          NOT NULL AUTO_INCREMENT,
  employee_id          INT          NOT NULL,
  attendance_date      DATE         NOT NULL,
  check_in             TIME         DEFAULT NULL,
  check_out            TIME         DEFAULT NULL,
  attendance_photo     VARCHAR(255) DEFAULT NULL,    -- relative file path
  verification_status  VARCHAR(30)  DEFAULT NULL,    -- Pending / Verified / Rejected
  admin_remarks        VARCHAR(255) DEFAULT NULL,    -- added by migrate.js
  attendance_status    VARCHAR(20)  DEFAULT NULL,    -- e.g. Present
  total_hours          DECIMAL(5,2) DEFAULT NULL,

  PRIMARY KEY (attendance_id),
  -- Prevents duplicate attendance for the same employee on the same day
  UNIQUE KEY employee_id (employee_id, attendance_date),
  CONSTRAINT attendance_ibfk_1 FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- Table 5: tasks
-- assigned_by -> users.user_id          (changed by migrate.js)
-- assigned_to -> employees.employee_id
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  task_id      INT          NOT NULL AUTO_INCREMENT,
  assigned_to  INT          NOT NULL,
  assigned_by  INT          NOT NULL,
  task_title   VARCHAR(150) NOT NULL,
  description  TEXT,
  priority     ENUM('Low','Medium','High') DEFAULT 'Medium',
  status       ENUM('Pending','In Progress','Completed') DEFAULT 'Pending',
  due_date     DATE         DEFAULT NULL,
  created_at   TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (task_id),
  KEY assigned_to (assigned_to),
  KEY fk_tasks_assigned_by (assigned_by),
  CONSTRAINT fk_tasks_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (user_id),
  CONSTRAINT tasks_ibfk_1         FOREIGN KEY (assigned_to) REFERENCES employees (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- Table 6: employee_documents
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_documents (
  document_id          INT          NOT NULL AUTO_INCREMENT,
  employee_id          INT          NOT NULL,
  document_name        VARCHAR(150) NOT NULL,
  document_type        VARCHAR(50)  DEFAULT NULL,
  file_path            VARCHAR(255) DEFAULT NULL,
  verification_status  ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending', -- added by migrate.js
  admin_remarks        VARCHAR(255) DEFAULT NULL,                                       -- added by migrate.js
  uploaded_at          TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (document_id),
  KEY employee_id (employee_id),
  CONSTRAINT employee_documents_ibfk_1 FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- Sample departments (same as your existing data).
-- INSERT IGNORE skips names that already exist.
-- ---------------------------------------------------------------------
INSERT IGNORE INTO departments (department_name, description) VALUES
  ('IT',             'Software development and technical operations'),
  ('HR',             'Human resource management'),
  ('Administration', 'Office and administrative operations'),
  ('Training',       'Technical training and education');
