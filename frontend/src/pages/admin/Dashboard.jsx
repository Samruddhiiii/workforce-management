// src/pages/admin/Dashboard.jsx
// Live overview from GET /api/dashboard/admin. Each card links to the page
// where the admin can act on that number.

import { Link } from 'react-router-dom';
import {
  FiAlertCircle, FiBriefcase, FiCheckCircle, FiClipboard, FiClock, FiFileText, FiUserCheck, FiUsers,
} from 'react-icons/fi';
import { dashboardApi } from '../../services/api';
import { useFetch } from '../../hooks/useFetch';
import { formatDate, formatTime } from '../../utils/format';
import DashboardCard from '../../components/DashboardCard';
import DataTable from '../../components/DataTable';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingSpinner from '../../components/LoadingSpinner';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';

export default function AdminDashboard() {
  const { data, loading, error, reload } = useFetch(() => dashboardApi.admin(), []);

  if (loading && !data) return <LoadingSpinner label="Loading dashboard..." />;
  if (error && !data) return <ErrorMessage message={error} onRetry={reload} />;

  return (
    <div className="page">
      <PageHeader title="Dashboard" subtitle={`Overview for ${formatDate(data.today)}`}>
        <button type="button" className="btn btn-secondary" onClick={reload} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </PageHeader>
      <ErrorMessage message={error} />

      <div className="card-grid">
        <DashboardCard label="Total employees" value={data.total_employees} icon={FiUsers} tone="blue"
          hint={data.inactive_employees ? `${data.inactive_employees} inactive` : 'All active'} to="/admin/employees" />
        <DashboardCard label="Departments" value={data.total_departments} icon={FiBriefcase} tone="violet" to="/admin/departments" />
        <DashboardCard label="Present today" value={data.present_today} icon={FiUserCheck} tone="green"
          hint={`of ${data.total_employees} active employees`} to="/admin/attendance" />
        <DashboardCard label="Attendance to verify" value={data.pending_attendance_verifications} icon={FiClock} tone="amber" to="/admin/attendance?status=Pending" />
        <DashboardCard label="Pending tasks" value={data.pending_tasks} icon={FiClipboard} tone="slate"
          hint={`${data.in_progress_tasks} in progress`} to="/admin/tasks?status=Pending" />
        <DashboardCard label="Completed tasks" value={data.completed_tasks} icon={FiCheckCircle} tone="green" to="/admin/tasks?status=Completed" />
        <DashboardCard label="Overdue tasks" value={data.overdue_tasks} icon={FiAlertCircle} tone="red" to="/admin/tasks?overdue=true" />
        <DashboardCard label="Documents to review" value={data.pending_documents} icon={FiFileText} tone="amber" to="/admin/documents?status=Pending" />
      </div>

      <div className="two-column">
        <section className="panel">
          <div className="panel-header">
            <h3>Recent attendance</h3>
            <Link to="/admin/attendance" className="link">View all</Link>
          </div>
          <DataTable
            rows={data.recent_attendance}
            rowKey="attendance_id"
            emptyTitle="No attendance yet"
            columns={[
              { key: 'employee_name', header: 'Employee' },
              { key: 'attendance_date', header: 'Date', render: (row) => formatDate(row.attendance_date) },
              { key: 'check_in', header: 'In', render: (row) => formatTime(row.check_in) },
              { key: 'verification_status', header: 'Status', render: (row) => <StatusBadge value={row.verification_status} /> },
            ]}
          />
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>Upcoming deadlines</h3>
            <Link to="/admin/tasks" className="link">View all</Link>
          </div>
          <DataTable
            rows={data.upcoming_tasks}
            rowKey="task_id"
            emptyTitle="No open tasks with a due date"
            columns={[
              { key: 'task_title', header: 'Task' },
              { key: 'assigned_to_name', header: 'Assigned to' },
              {
                key: 'due_date', header: 'Due',
                render: (row) => (
                  <span className={row.is_overdue ? 'text-danger' : ''}>
                    {formatDate(row.due_date)}{row.is_overdue && ' (overdue)'}
                  </span>
                ),
              },
              { key: 'priority', header: 'Priority', render: (row) => <StatusBadge value={row.priority} /> },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
