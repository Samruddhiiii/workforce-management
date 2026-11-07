// src/pages/employee/Dashboard.jsx
// Personal overview from GET /api/dashboard/employee (only this employee's data).

import { Link } from 'react-router-dom';
import { FiCalendar, FiCheckCircle, FiClipboard, FiFileText, FiLoader, FiUpload } from 'react-icons/fi';
import { dashboardApi } from '../../services/api';
import { useFetch } from '../../hooks/useFetch';
import { formatDate, formatDateTime, formatTime } from '../../utils/format';
import Avatar from '../../components/Avatar';
import DashboardCard from '../../components/DashboardCard';
import EmptyState from '../../components/EmptyState';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingSpinner from '../../components/LoadingSpinner';

const ACTIVITY_ICONS = { attendance: FiCalendar, task: FiClipboard, document: FiFileText };

export default function EmployeeDashboard() {
  const { data, loading, error, reload } = useFetch(() => dashboardApi.employee(), []);

  if (loading && !data) return <LoadingSpinner label="Loading your dashboard..." />;
  if (error && !data) return <ErrorMessage message={error} onRetry={reload} />;

  const { employee, today_attendance: today, tasks, documents } = data;
  const record = today.record;
  const attendanceHint = record
    ? `In ${formatTime(record.check_in)}${record.check_out ? ` · Out ${formatTime(record.check_out)}` : ''} · ${record.verification_status}`
    : 'Mark your attendance for today';

  return (
    <div className="page">
      <section className="panel welcome">
        <Avatar name={employee.full_name} photoUrl={employee.profile_photo_url} size={64} />
        <div>
          <p className="eyebrow">{formatDate(data.today)}</p>
          <h1>Hello, {employee.full_name}</h1>
          <p className="muted">{employee.designation || 'Employee'} · {employee.department_name}</p>
        </div>
        <div className="welcome-actions">
          {!record && (
            <Link to="/employee/attendance" className="btn btn-primary"><FiCalendar aria-hidden="true" /> Mark attendance</Link>
          )}
          {record && !record.check_out && today.status !== 'Rejected' && (
            <Link to="/employee/attendance" className="btn btn-primary"><FiCalendar aria-hidden="true" /> Check out</Link>
          )}
          <Link to="/employee/documents" className="btn btn-secondary"><FiUpload aria-hidden="true" /> Upload document</Link>
        </div>
      </section>

      <div className="card-grid">
        <DashboardCard label="Today's attendance" value={today.status} icon={FiCalendar}
          tone={today.status === 'Not marked' ? 'slate' : today.status === 'Rejected' ? 'red' : 'green'} hint={attendanceHint} to="/employee/attendance" />
        <DashboardCard label="Pending tasks" value={tasks.pending} icon={FiClipboard} tone="amber"
          hint={tasks.overdue ? `${tasks.overdue} overdue` : 'None overdue'} to="/employee/tasks" />
        <DashboardCard label="In progress" value={tasks.in_progress} icon={FiLoader} tone="blue" to="/employee/tasks" />
        <DashboardCard label="Completed tasks" value={tasks.completed} icon={FiCheckCircle} tone="green" to="/employee/tasks" />
        <DashboardCard label="Documents" value={documents.pending + documents.approved + documents.rejected} icon={FiFileText} tone="violet"
          hint={`${documents.pending} pending · ${documents.approved} approved · ${documents.rejected} rejected`} to="/employee/documents" />
      </div>

      {record?.admin_remarks && (
        <div className={`alert ${record.verification_status === 'Rejected' ? 'alert-error' : 'alert-info'}`}>
          Admin remark on today's attendance: {record.admin_remarks}
        </div>
      )}

      <section className="panel">
        <h3>Recent activity</h3>
        {data.recent_activity.length === 0 ? (
          <EmptyState title="No activity yet" message="Your check-ins, tasks and uploads will appear here." />
        ) : (
          <ul className="activity-list">
            {data.recent_activity.map((item, index) => {
              const Icon = ACTIVITY_ICONS[item.type] || FiClipboard;
              return (
                <li key={`${item.type}-${item.activity_at}-${index}`}>
                  <span className={`card-icon small tone-${item.type === 'task' ? 'amber' : item.type === 'document' ? 'violet' : 'blue'}`} aria-hidden="true"><Icon /></span>
                  <span className="activity-text">{item.description}</span>
                  <time className="muted small">{formatDateTime(item.activity_at)}</time>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
