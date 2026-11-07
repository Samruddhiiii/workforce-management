// src/pages/employee/Attendance.jsx
// Check in with a photo, check out, and see your attendance history with
// the admin's verification status and remarks.
//
// The check-in and check-out TIMES come from the server's clock, not from
// this browser, so they can't be faked by changing the computer's time.
// The photo is only looked at by the admin - there is no face recognition.

import { useEffect, useState } from 'react';
import { FiCamera, FiLogIn, FiLogOut } from 'react-icons/fi';
import { attendanceApi, fileUrl, getErrorMessage } from '../../services/api';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatHours, formatTime, MB } from '../../utils/format';
import ConfirmDialog from '../../components/ConfirmDialog';
import DataTable from '../../components/DataTable';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingSpinner from '../../components/LoadingSpinner';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_MB = 2;

// Photo thumbnail that opens the full image in a new tab
function PhotoLink({ url }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <span className="muted small">No photo</span>;
  return (
    <a href={fileUrl(url)} target="_blank" rel="noopener noreferrer" className="thumb-button" aria-label="Open attendance photo">
      <img src={fileUrl(url)} alt="" className="thumb" onError={() => setFailed(true)} />
    </a>
  );
}

function TodayCard({ today, onChanged }) {
  const toast = useToast();
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCheckOut, setConfirmCheckOut] = useState(false);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  function choosePhoto(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) return setError('Please choose a JPEG, PNG or WebP image.');
    if (file.size > MAX_PHOTO_MB * MB) return setError(`The photo is too large. Maximum size is ${MAX_PHOTO_MB} MB.`);
    setError('');
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  }

  async function checkIn() {
    if (!photo) return setError('Please take or choose a photo first.');
    setBusy(true);
    setError('');
    try {
      const result = await attendanceApi.mark(photo);
      toast.success(result.message);
      setPhoto(null);
      setPreview('');
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
      if (err.response?.status === 409) onChanged(); // already marked (e.g. in another tab)
    } finally {
      setBusy(false);
    }
  }

  async function checkOut() {
    setBusy(true);
    setError('');
    try {
      const result = await attendanceApi.checkOut();
      toast.success(result.message);
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
      onChanged();
    } finally {
      setBusy(false);
      setConfirmCheckOut(false);
    }
  }

  // 1. Not marked yet -> photo + check in
  if (!today) {
    return (
      <section className="panel today-card">
        <div>
          <h3>Today: not marked yet</h3>
          <p className="muted">Take a photo (or choose one) and check in. The admin will verify it.</p>
        </div>
        <ErrorMessage message={error} />
        <div className="checkin-row">
          <div className="photo-preview">
            {preview ? <img src={preview} alt="Selected attendance photo" /> : <FiCamera aria-hidden="true" />}
          </div>
          <div className="checkin-actions">
            {/* capture="user" opens the front camera on phones; on a computer it opens a file picker */}
            <label className="btn btn-secondary file-button">
              <FiCamera aria-hidden="true" /> {photo ? 'Retake / choose another' : 'Take or choose photo'}
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={choosePhoto} />
            </label>
            <button type="button" className="btn btn-primary" onClick={checkIn} disabled={busy || !photo}>
              <FiLogIn aria-hidden="true" /> {busy ? 'Checking in...' : 'Check in'}
            </button>
            <span className="muted small">JPEG, PNG or WebP, up to {MAX_PHOTO_MB} MB</span>
          </div>
        </div>
      </section>
    );
  }

  // 2. Checked in (maybe out too) -> summary, and the check-out button if needed
  return (
    <section className="panel today-card">
      <div className="today-summary">
        <PhotoLink url={today.attendance_photo_url} />
        <div>
          <h3>Today, {formatDate(today.attendance_date)}</h3>
          <p>
            Checked in at <strong>{formatTime(today.check_in)}</strong>
            {today.check_out && <> · checked out at <strong>{formatTime(today.check_out)}</strong> ({formatHours(today.total_hours)})</>}
          </p>
          <p>Verification: <StatusBadge value={today.verification_status} /></p>
          {today.admin_remarks && <p className="muted">Admin remark: {today.admin_remarks}</p>}
        </div>
        {!today.check_out && (
          <button type="button" className="btn btn-primary" onClick={() => setConfirmCheckOut(true)} disabled={busy}>
            <FiLogOut aria-hidden="true" /> Check out
          </button>
        )}
      </div>
      <ErrorMessage message={error} />
      <ConfirmDialog
        open={confirmCheckOut}
        title="Check out now?"
        message="Your check-out time will be recorded now. You can check out only once per day."
        confirmLabel="Check out"
        busy={busy}
        onConfirm={checkOut}
        onCancel={() => setConfirmCheckOut(false)}
      />
    </section>
  );
}

export default function EmployeeAttendance() {
  const [filters, setFilters] = useState({ from: '', to: '', status: '' });
  const attendance = useFetch(() => attendanceApi.my(filters), [filters.from, filters.to, filters.status]);
  const setFilter = (name) => (event) => setFilters({ ...filters, [name]: event.target.value });

  const columns = [
    { key: 'attendance_date', header: 'Date', render: (row) => formatDate(row.attendance_date) },
    { key: 'check_in', header: 'Check in', render: (row) => formatTime(row.check_in) },
    { key: 'check_out', header: 'Check out', render: (row) => formatTime(row.check_out) },
    { key: 'total_hours', header: 'Hours', render: (row) => formatHours(row.total_hours) },
    { key: 'photo', header: 'Photo', render: (row) => <PhotoLink url={row.attendance_photo_url} /> },
    { key: 'verification_status', header: 'Verification', render: (row) => <StatusBadge value={row.verification_status} /> },
    { key: 'admin_remarks', header: 'Admin remarks', render: (row) => row.admin_remarks || <span className="muted">—</span> },
  ];

  return (
    <div className="page">
      <PageHeader title="My attendance" subtitle="Check in once a day with a photo, and check out when you leave" />

      {attendance.loading && !attendance.data ? (
        <LoadingSpinner />
      ) : (
        attendance.data && <TodayCard today={attendance.data.today} onChanged={attendance.reload} />
      )}

      <div className="toolbar">
        <label className="inline-field"><span>From</span><input type="date" value={filters.from} onChange={setFilter('from')} /></label>
        <label className="inline-field"><span>To</span><input type="date" value={filters.to} onChange={setFilter('to')} /></label>
        <select value={filters.status} onChange={setFilter('status')} aria-label="Filter by verification status">
          <option value="">All statuses</option>
          <option value="Pending">Pending</option>
          <option value="Verified">Verified</option>
          <option value="Rejected">Rejected</option>
        </select>
        {(filters.from || filters.to || filters.status) && (
          <button type="button" className="btn btn-ghost" onClick={() => setFilters({ from: '', to: '', status: '' })}>Clear filters</button>
        )}
      </div>

      <ErrorMessage message={attendance.error} onRetry={attendance.reload} />
      <section className="panel">
        <h3>History</h3>
        <DataTable columns={columns} rows={attendance.data?.records} rowKey="attendance_id" loading={attendance.loading}
          emptyTitle="No attendance records" emptyMessage="Your check-ins will be listed here." />
      </section>
    </div>
  );
}
