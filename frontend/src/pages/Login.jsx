// src/pages/Login.jsx
// Email + password. On success the backend sets the session cookie and we
// go to the page the user originally wanted, or to their dashboard.

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { homePathFor, useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../services/api';
import ErrorMessage from '../components/ErrorMessage';
import FormInput from '../components/FormInput';

// Only follow "from" if it is a page of THIS app that the role may open.
// (Never navigate to something like "//evil.com" or "/\evil.com".)
function safeRedirect(from, user) {
  const home = homePathFor(user);
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.includes('\\')) return home;
  return from === home || from.startsWith(`${home}/`) ? from : home;
}

export default function Login() {
  // sessionMessage ("Your session has expired...") is cleared by login() itself
  const { login, sessionMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: location.state?.email || '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const notice = location.state?.message || sessionMessage;

  const handleChange = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!form.email.trim() || !form.password) {
      setError('Please enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      const user = await login(form.email.trim(), form.password);
      navigate(safeRedirect(location.state?.from, user), { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="auth-brand">
          <span className="brand-mark" aria-hidden="true">W</span> Workforce
        </Link>
        <h1>Welcome back</h1>
        <p className="muted">Log in to continue to your dashboard.</p>

        {notice && <div className="alert alert-info">{notice}</div>}
        <ErrorMessage message={error} />

        <form onSubmit={handleSubmit} noValidate>
          <FormInput label="Email" name="email" type="email" autoComplete="email" value={form.email} onChange={handleChange} required />
          <FormInput label="Password" name="password" type="password" autoComplete="current-password" value={form.password} onChange={handleChange} required />
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        <p className="auth-switch">
          New employee? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
