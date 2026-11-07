// src/pages/employee/Profile.jsx
// View and edit your own profile. Editable: name, phone, address, photo.
// Email, department, designation and status are shown read-only - only the
// admin can change them (the backend ignores them here anyway).

import { useEffect, useState } from 'react';
import { FiCamera } from 'react-icons/fi';
import { employeeApi, getErrorMessage } from '../../services/api';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDate, MB } from '../../utils/format';
import Avatar from '../../components/Avatar';
import ErrorMessage from '../../components/ErrorMessage';
import FormInput from '../../components/FormInput';
import LoadingSpinner from '../../components/LoadingSpinner';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_MB = 2;

export default function EmployeeProfile() {
  const { refreshUser } = useAuth();
  const toast = useToast();
  const profile = useFetch(() => employeeApi.getMe(), []);
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', address: '' });
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Fill the form when the profile arrives
  useEffect(() => {
    if (profile.data) {
      const p = profile.data;
      setForm({ first_name: p.first_name || '', last_name: p.last_name || '', phone: p.phone || '', address: p.address || '' });
    }
  }, [profile.data]);

  // Free the preview URL when it is no longer needed
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  function choosePhoto(event) {
    const file = event.target.files[0];
    event.target.value = ''; // allow choosing the same file again
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) return setError('Please choose a JPEG, PNG or WebP image.');
    if (file.size > MAX_PHOTO_MB * MB) return setError(`The photo is too large. Maximum size is ${MAX_PHOTO_MB} MB.`);
    setError('');
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.first_name.trim()) return setError('First name cannot be empty.');
    setSaving(true);
    setError('');
    try {
      const result = await employeeApi.updateMe(form, photo);
      profile.setData(result.data);
      setPhoto(null);
      setPreview('');
      await refreshUser(); // update the name in the top bar
      toast.success(result.message);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (profile.loading && !profile.data) return <LoadingSpinner label="Loading profile..." />;
  if (profile.error && !profile.data) return <ErrorMessage message={profile.error} onRetry={profile.reload} />;

  const p = profile.data;
  const readOnly = [
    ['Email', p.email],
    ['Department', p.department_name],
    ['Designation', p.designation || '—'],
    ['Date of joining', formatDate(p.date_of_joining)],
  ];

  return (
    <div className="page">
      <PageHeader title="My profile" subtitle="Keep your personal details up to date" />

      <div className="profile-layout">
        <section className="panel profile-card">
          {preview ? <img className="avatar" src={preview} alt="New profile photo preview" style={{ width: 120, height: 120 }} /> : <Avatar name={p.full_name} photoUrl={p.profile_photo_url} size={120} />}
          <label className="btn btn-secondary file-button">
            <FiCamera aria-hidden="true" /> {photo ? 'Choose another photo' : 'Change photo'}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} />
          </label>
          {photo && <p className="muted small">New photo selected. Click "Save changes" to upload it.</p>}
          <h2>{p.full_name}</h2>
          <StatusBadge value={p.employment_status} />
          <dl className="details-list">
            {readOnly.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
          <p className="muted small">To change these details, please contact the administrator.</p>
        </section>

        <section className="panel">
          <h3>Personal information</h3>
          <ErrorMessage message={error} />
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-grid">
              <FormInput label="First name" name="first_name" value={form.first_name} maxLength={50} required
                onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              <FormInput label="Last name" name="last_name" value={form.last_name} maxLength={50}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              <FormInput label="Phone" name="phone" type="tel" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} hint="7-14 digits, an optional + at the start" />
              <FormInput as="textarea" label="Address" name="address" rows={3} value={form.address} maxLength={500} className="span-2"
                onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
