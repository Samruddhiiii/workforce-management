// src/App.jsx
// All the pages and which role may open them.
//
//   /                 Home (public)
//   /login /register  only when logged OUT
//   /admin/...        role "admin"    (AdminLayout)
//   /employee/...     role "employee" (EmployeeLayout)

import { Route, Routes } from 'react-router-dom';
import ProtectedRoute, { PublicOnlyRoute } from './components/ProtectedRoute';
import AdminLayout from './layouts/AdminLayout';
import EmployeeLayout from './layouts/EmployeeLayout';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import NotFound from './pages/NotFound';

import AdminDashboard from './pages/admin/Dashboard';
import AdminEmployees from './pages/admin/Employees';
import AdminEmployeeDetail from './pages/admin/EmployeeDetail';
import AdminDepartments from './pages/admin/Departments';
import AdminAttendance from './pages/admin/Attendance';
import AdminTasks from './pages/admin/Tasks';
import AdminDocuments from './pages/admin/Documents';

import EmployeeDashboard from './pages/employee/Dashboard';
import EmployeeProfile from './pages/employee/Profile';
import EmployeeAttendance from './pages/employee/Attendance';
import EmployeeTasks from './pages/employee/Tasks';
import EmployeeDocuments from './pages/employee/Documents';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route element={<ProtectedRoute role="admin" />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="employees" element={<AdminEmployees />} />
          <Route path="employees/:id" element={<AdminEmployeeDetail />} />
          <Route path="departments" element={<AdminDepartments />} />
          <Route path="attendance" element={<AdminAttendance />} />
          <Route path="tasks" element={<AdminTasks />} />
          <Route path="documents" element={<AdminDocuments />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute role="employee" />}>
        <Route path="/employee" element={<EmployeeLayout />}>
          <Route index element={<EmployeeDashboard />} />
          <Route path="profile" element={<EmployeeProfile />} />
          <Route path="attendance" element={<EmployeeAttendance />} />
          <Route path="tasks" element={<EmployeeTasks />} />
          <Route path="documents" element={<EmployeeDocuments />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
