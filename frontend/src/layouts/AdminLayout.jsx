// src/layouts/AdminLayout.jsx
// Menu for administrators. Wrapped in <ProtectedRoute role="admin"> in App.jsx.
import { FiBriefcase, FiCalendar, FiCheckSquare, FiFileText, FiGrid, FiUsers } from 'react-icons/fi';
import AppLayout from './AppLayout';

const ADMIN_LINKS = [
  { to: '/admin', label: 'Dashboard', icon: FiGrid, end: true },
  { to: '/admin/employees', label: 'Employees', icon: FiUsers },
  { to: '/admin/departments', label: 'Departments', icon: FiBriefcase },
  { to: '/admin/attendance', label: 'Attendance', icon: FiCalendar },
  { to: '/admin/tasks', label: 'Tasks', icon: FiCheckSquare },
  { to: '/admin/documents', label: 'Documents', icon: FiFileText },
];

export default function AdminLayout() {
  return <AppLayout links={ADMIN_LINKS} title="Admin Panel" />;
}
