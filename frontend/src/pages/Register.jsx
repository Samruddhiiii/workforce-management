// src/pages/Register.jsx
// Public sign-up. It ALWAYS creates an Employee account: there is no role
// field, and the backend would ignore one anyway. Admin accounts can only be
// created by an existing admin.
// The department list comes from GET /api/departments (public on purpose).

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { departmentApi, authApi, getErrorMessage } from '../services/api';
import { useFetch } from '../hooks/useFetch';
import ErrorMessage from '../components/ErrorMessage';
import FormInput from '../components/FormInput';

const EMPTY_FORM = { first_name: '', last_name: '', email: '', phone: '', department_id: '', password: '', confirm_password: '' };

// Same rules as the backend, checked early so the user gets instant feedback
function validate(form) {
  const errors = {};
  if (!form.first_name.trim()) errors.first_name = 'First name is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address';
  if (!form.department_id) errors.department_id = 'Choose your department';
  if (form.password.length < 8) errors.password = 'At least 8 characters';
  else if (!form.password.trim()) errors.password = 'Password cannot be only spaces';
  if (form.confirm_password !== form.password) errors.confirm_password = 'Passwords do not match';
  if (form.phone && !/^\+?[\d\s\-().]{7,20}$/.test(form.phone)) errors.phone = 'Use digits only, e.g. 98765 43210';
  return errors;
}

export default function Register() {
  const navigate = useNavigate();
  const departments = useFetch(() => departmentApi.list(), []);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value });
    setFieldErrors({ ...fieldErrors, [event.target.name]: undefined });
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const { confirm_password: _unused, ...body } = form;
      const result = await authApi.register({ ...body, email: body.email.trim(), department_id: Number(body.department_id) });
      navigate('/login', { replace: true, state: { message: result.message, email: body.email.trim() } });
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-wide">
        <Link to="/" className="auth-brand">
          <span className="brand-mark" aria-hidden="true">W</span> Workforce
        </Link>
        <h1>Create your employee account</h1>
        <p className="muted">After registering, log in with your email and password.</p>

        <ErrorMessage message={error || departments.error} onRetry={departments.error ? departments.reload : undefined} />

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <FormInput label="First name" name="first_name" value={form.first_name} onChange={handleChange} error={fieldErrors.first_name} autoComplete="given-name" required />
            <FormInput label="Last name" name="last_name" value={form.last_name} onChange={handleChange} autoComplete="family-name" />
            <FormInput label="Email" name="email" type="email" value={form.email} onChange={handleChange} error={fieldErrors.email} autoComplete="email" required />
            <FormInput label="Phone" name="phone" type="tel" value={form.phone} onChange={handleChange} error={fieldErrors.phone} autoComplete="tel" hint="Optional" />
            <FormInput as="select" label="Department" name="department_id" value={form.department_id} onChange={handleChange} error={fieldErrors.department_id} required className="span-2">
              <option value="">{departments.loading ? 'Loading departments...' : 'Choose your department'}</option>
              {(departments.data || []).map((dept) => (
                <option key={dept.department_id} value={dept.department_id}>{dept.department_name}</option>
              ))}
            </FormInput>
            <FormInput label="Password" name="password" type="password" value={form.password} onChange={handleChange} error={fieldErrors.password} hint="At least 8 characters" autoComplete="new-password" required />
            <FormInput label="Confirm password" name="confirm_password" type="password" value={form.confirm_password} onChange={handleChange} error={fieldErrors.confirm_password} autoComplete="new-password" required />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          Already registered? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
