// src/layouts/EmployeeLayout.jsx
// Menu for employees. Wrapped in <ProtectedRoute role="employee"> in App.jsx.
import { FiCalendar, FiCheckSquare, FiFileText, FiGrid, FiUser } from 'react-icons/fi';
import AppLayout from './AppLayout';

const EMPLOYEE_LINKS = [
  { to: '/employee', label: 'Dashboard', icon: FiGrid, end: true },
  { to: '/employee/profile', label: 'My Profile', icon: FiUser },
  { to: '/employee/attendance', label: 'My Attendance', icon: FiCalendar },
  { to: '/employee/tasks', label: 'My Tasks', icon: FiCheckSquare },
  { to: '/employee/documents', label: 'My Documents', icon: FiFileText },
];

export default function EmployeeLayout() {
  return <AppLayout links={EMPLOYEE_LINKS} title="Employee Portal" />;
}
