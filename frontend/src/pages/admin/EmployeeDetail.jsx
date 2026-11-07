// src/pages/admin/EmployeeDetail.jsx
// One employee's profile, activity counts, and their latest tasks,
// attendance and documents (the lists use the normal admin filters).

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FiArrowLeft, FiEdit2 } from 'react-icons/fi';
import { attendanceApi, departmentApi, documentApi, employeeApi, taskApi } from '../../services/api';
import { useFetch } from '../../hooks/useFetch';
import { formatDate, formatDateTime, formatHours, formatTime } from '../../utils/format';
import Avatar from '../../components/Avatar';
import DataTable from '../../components/DataTable';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingSpinner from '../../components/LoadingSpinner';
import StatusBadge from '../../components/StatusBadge';
import EmployeeFormModal from './EmployeeFormModal';

export default function AdminEmployeeDetail() {
  const { id } = useParams();
  const employee = useFetch(() => employeeApi.get(id), [id]);
  const tasks = useFetch(() => taskApi.list({ employee_id: id }), [id]);
  const attendance = useFetch(() => attendanceApi.list({ employee_id: id }), [id]);
  const documents = useFetch(() => documentApi.list({ employee_id: id }), [id]);
  const departments = useFetch(() => departmentApi.list(), []);
  const [editing, setEditing] = useState(false);

  if (employee.loading && !employee.data) return <LoadingSpinner label="Loading profile..." />;
  if (employee.error && !employee.data) {
    return (
      <div className="page">
        <Link to="/admin/employees" className="back-link"><FiArrowLeft /> Back to employees</Link>
        <ErrorMessage message={employee.error} onRetry={employee.reload} />
      </div>
    );
  }

  const person = employee.data;
  const stats = person.stats || {};
  const details = [
    ['Email', person.email],
    ['Phone', person.phone],
    ['Department', person.department_name],
    ['Designation', person.designation],
    ['Date of joining', formatDate(person.date_of_joining)],
    ['Address', person.address],
  ];

  return (
    <div className="page">
      <Link to="/admin/employees" className="back-link"><FiArrowLeft aria-hidden="true" /> Back to employees</Link>

      <section className="panel profile-header">
        <Avatar name={person.full_name} photoUrl={person.profile_photo_url} size={88} />
        <div className="profile-heading">
          <h1>{person.full_name}</h1>
          <p className="muted">{person.designation || 'No designation'} · {person.department_name}</p>
          <StatusBadge value={person.employment_status} />
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
          <FiEdit2 aria-hidden="true" /> Edit
        </button>
      </section>

      <div className="two-column">
        <section className="panel">
          <h3>Details</h3>
          <dl className="details-list">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="panel">
          <h3>Activity</h3>
          <dl className="mini-stats">
            <div><dt>Pending tasks</dt><dd>{stats.pending_tasks ?? 0}</dd></div>
            <div><dt>In progress</dt><dd>{stats.in_progress_tasks ?? 0}</dd></div>
            <div><dt>Completed</dt><dd>{stats.completed_tasks ?? 0}</dd></div>
            <div><dt>Attendance records</dt><dd>{stats.attendance_records ?? 0}</dd></div>
            <div><dt>Documents</dt><dd>{stats.documents ?? 0}</dd></div>
          </dl>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3>Tasks</h3>
          <Link className="link" to="/admin/tasks">Manage tasks</Link>
        </div>
        <ErrorMessage message={tasks.error} />
        <DataTable rows={tasks.data} rowKey="task_id" loading={tasks.loading} emptyTitle="No tasks assigned"
          columns={[
            { key: 'task_title', header: 'Task' },
            { key: 'priority', header: 'Priority', render: (row) => <StatusBadge value={row.priority} /> },
            { key: 'due_date', header: 'Due', render: (row) => formatDate(row.due_date) },
            { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.is_overdue ? 'Overdue' : row.status} /> },
          ]} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Recent attendance</h3>
          <Link className="link" to="/admin/attendance">Manage attendance</Link>
        </div>
        <ErrorMessage message={attendance.error} />
        <DataTable rows={(attendance.data || []).slice(0, 10)} rowKey="attendance_id" loading={attendance.loading} emptyTitle="No attendance records"
          columns={[
            { key: 'attendance_date', header: 'Date', render: (row) => formatDate(row.attendance_date) },
            { key: 'check_in', header: 'Check in', render: (row) => formatTime(row.check_in) },
            { key: 'check_out', header: 'Check out', render: (row) => formatTime(row.check_out) },
            { key: 'total_hours', header: 'Hours', render: (row) => formatHours(row.total_hours) },
            { key: 'verification_status', header: 'Status', render: (row) => <StatusBadge value={row.verification_status} /> },
          ]} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Documents</h3>
          <Link className="link" to="/admin/documents">Review documents</Link>
        </div>
        <ErrorMessage message={documents.error} />
        <DataTable rows={documents.data} rowKey="document_id" loading={documents.loading} emptyTitle="No documents uploaded"
          columns={[
            { key: 'document_name', header: 'Document' },
            { key: 'document_type', header: 'Type' },
            { key: 'uploaded_at', header: 'Uploaded', render: (row) => formatDateTime(row.uploaded_at) },
            { key: 'verification_status', header: 'Status', render: (row) => <StatusBadge value={row.verification_status} /> },
          ]} />
      </section>

      <EmployeeFormModal
        open={editing}
        employee={person}
        departments={departments.data || []}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          employee.reload();
        }}
      />
    </div>
  );
}
