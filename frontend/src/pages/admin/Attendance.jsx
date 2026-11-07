// src/pages/admin/Attendance.jsx
// All attendance records with filters, daily statistics, and a review
// window where the admin looks at the photo and verifies or rejects.
// (A normal photo check by a person - no face recognition.)

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiCheck, FiClock, FiUserCheck, FiUserX, FiUsers, FiX } from 'react-icons/fi';
import { attendanceApi, employeeApi, fileUrl, getErrorMessage } from '../../services/api';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatHours, formatTime, todayISO } from '../../utils/format';
import DashboardCard from '../../components/DashboardCard';
import DataTable from '../../components/DataTable';
import ErrorMessage from '../../components/ErrorMessage';
import FormInput from '../../components/FormInput';
import Modal from '../../components/Modal';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';

// Photo with a fallback message (old sample rows point to files that don't exist)
function AttendancePhoto({ url, alt, className }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) return <div className={`photo-missing ${className || ''}`}>No photo available</div>;
  return <img src={fileUrl(url)} alt={alt} className={className} onError={() => setFailed(true)} />;
}

function ReviewModal({ record, onClose, onDone }) {
  const toast = useToast();
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');

  useEffect(() => {
    setRemarks(record?.admin_remarks || '');
    setError('');
  }, [record]);

  async function decide(status) {
    if (status === 'Rejected' && !remarks.trim()) {
      setError('Please write a reason before rejecting, so the employee knows why.');
      return;
    }
    setSaving(status);
    setError('');
    try {
      const result = await attendanceApi.verify(record.attendance_id, status, remarks.trim());
      toast.success(`${result.message} for ${record.employee_name}`);
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving('');
    }
  }

  return (
    <Modal
      open={Boolean(record)}
      title="Review attendance"
      onClose={onClose}
      size="large"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={Boolean(saving)}>Close</button>
          <button type="button" className="btn btn-danger" onClick={() => decide('Rejected')} disabled={Boolean(saving)}>
            <FiX aria-hidden="true" /> {saving === 'Rejected' ? 'Rejecting...' : 'Reject'}
          </button>
          <button type="button" className="btn btn-success" onClick={() => decide('Verified')} disabled={Boolean(saving)}>
            <FiCheck aria-hidden="true" /> {saving === 'Verified' ? 'Verifying...' : 'Verify'}
          </button>
        </>
      }
    >
      {record && (
        <div className="review-layout">
          <AttendancePhoto url={record.attendance_photo_url} alt={`Attendance photo of ${record.employee_name}`} className="review-photo" />
          <div>
            <dl className="details-list">
              <div><dt>Employee</dt><dd>{record.employee_name}</dd></div>
              <div><dt>Department</dt><dd>{record.department_name || '—'}</dd></div>
              <div><dt>Date</dt><dd>{formatDate(record.attendance_date)}</dd></div>
              <div><dt>Check in / out</dt><dd>{formatTime(record.check_in)} – {formatTime(record.check_out)}</dd></div>
              <div><dt>Hours</dt><dd>{formatHours(record.total_hours)}</dd></div>
              <div><dt>Current status</dt><dd><StatusBadge value={record.verification_status} /></dd></div>
            </dl>
            <ErrorMessage message={error} />
            <FormInput as="textarea" label="Remarks" name="admin_remarks" rows={3} maxLength={255} value={remarks}
              onChange={(e) => setRemarks(e.target.value)} hint="Required when rejecting. The employee will see this." />
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function AdminAttendance() {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    date: searchParams.get('status') ? '' : todayISO(), // from the dashboard "to verify" card: all dates
    employee_id: '',
    status: searchParams.get('status') || '',
  });
  const [statsDate, setStatsDate] = useState(todayISO());
  const [reviewing, setReviewing] = useState(null);

  const records = useFetch(() => attendanceApi.list(filters), [filters.date, filters.employee_id, filters.status]);
  const stats = useFetch(() => attendanceApi.stats(statsDate), [statsDate]);
  const employees = useFetch(() => employeeApi.list(), []);

  const setFilter = (name) => (event) => setFilters({ ...filters, [name]: event.target.value });
  const s = stats.data;

  const columns = [
    { key: 'employee_name', header: 'Employee', render: (row) => (
      <div><strong>{row.employee_name}</strong><div className="muted small">{row.department_name}</div></div>
    ) },
    { key: 'attendance_date', header: 'Date', render: (row) => formatDate(row.attendance_date) },
    { key: 'check_in', header: 'Check in', render: (row) => formatTime(row.check_in) },
    { key: 'check_out', header: 'Check out', render: (row) => formatTime(row.check_out) },
    { key: 'total_hours', header: 'Hours', render: (row) => formatHours(row.total_hours) },
    { key: 'photo', header: 'Photo', render: (row) => (
      <button type="button" className="thumb-button" onClick={() => setReviewing(row)} aria-label={`View photo of ${row.employee_name}`}>
        <AttendancePhoto url={row.attendance_photo_url} alt="" className="thumb" />
      </button>
    ) },
    { key: 'verification_status', header: 'Status', render: (row) => <StatusBadge value={row.verification_status} /> },
    { key: 'admin_remarks', header: 'Remarks', render: (row) => row.admin_remarks || <span className="muted">—</span> },
    { key: 'actions', header: '', className: 'actions', render: (row) => (
      <button type="button" className={`btn btn-small ${row.verification_status === 'Pending' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setReviewing(row)}>
        {row.verification_status === 'Pending' ? 'Review' : 'Change'}
      </button>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="Attendance" subtitle="Verify photo attendance and follow daily presence" />

      <section className="panel">
        <div className="panel-header">
          <h3>Statistics for {s ? formatDate(s.date) : '...'}</h3>
          <input type="date" value={statsDate} max={todayISO()} onChange={(e) => setStatsDate(e.target.value || todayISO())} aria-label="Statistics date" />
        </div>
        <ErrorMessage message={stats.error} onRetry={stats.reload} />
        {s && (
          <>
            <div className="card-grid compact">
              <DashboardCard label="Active employees" value={s.active_employees} icon={FiUsers} tone="slate" />
              <DashboardCard label="Present" value={s.present} icon={FiUserCheck} tone="green" hint={`${s.verified} verified`} />
              <DashboardCard label="Waiting for review" value={s.pending} icon={FiClock} tone="amber" hint={`${s.pending_verification_total} pending in total`} />
              <DashboardCard label="Not marked" value={s.not_marked} icon={FiUserX} tone="red" hint={`${s.rejected} rejected`} />
            </div>
            <div className="week-strip" aria-label="Last 7 days">
              {s.last_7_days.map((day) => (
                <div key={day.date} className="week-day">
                  <span className="muted small">{formatDate(day.date).split(' ').slice(0, 2).join(' ')}</span>
                  <strong>{day.marked}</strong>
                  <span className="muted small">{day.verified} ✓ · {day.pending} ⏳</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="toolbar">
        <label className="inline-field">
          <span>Date</span>
          <input type="date" value={filters.date} onChange={setFilter('date')} />
        </label>
        <select value={filters.employee_id} onChange={setFilter('employee_id')} aria-label="Filter by employee">
          <option value="">All employees</option>
          {(employees.data || []).map((emp) => (
            <option key={emp.employee_id} value={emp.employee_id}>{emp.full_name}</option>
          ))}
        </select>
        <select value={filters.status} onChange={setFilter('status')} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="Pending">Pending</option>
          <option value="Verified">Verified</option>
          <option value="Rejected">Rejected</option>
        </select>
        {(filters.date || filters.employee_id || filters.status) && (
          <button type="button" className="btn btn-ghost" onClick={() => setFilters({ date: '', employee_id: '', status: '' })}>Clear filters</button>
        )}
      </div>

      <ErrorMessage message={records.error} onRetry={records.reload} />
      <section className="panel">
        <DataTable columns={columns} rows={records.data} rowKey="attendance_id" loading={records.loading}
          emptyTitle="No attendance records" emptyMessage={filters.date ? 'Nobody has marked attendance for this date yet.' : 'Try different filters.'} />
      </section>

      <ReviewModal
        record={reviewing}
        onClose={() => setReviewing(null)}
        onDone={() => {
          setReviewing(null);
          records.reload();
          stats.reload();
        }}
      />
    </div>
  );
}
