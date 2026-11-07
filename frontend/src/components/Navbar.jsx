// src/components/Navbar.jsx
// Top bar: menu button (phones), current page title, the logged-in user and Logout.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiLogOut, FiMenu } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Avatar from './Avatar';

export default function Navbar({ title, onMenuClick }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const displayName = user?.full_name || user?.email;

  async function handleLogout() {
    setBusy(true);
    try {
      await logout();
      toast.success('You have been logged out');
    } catch {
      // logout() already cleared the user locally; nothing else to do
    } finally {
      setBusy(false);
      navigate('/login', { replace: true });
    }
  }

  return (
    <header className="navbar">
      <button type="button" className="icon-button menu-button" onClick={onMenuClick} aria-label="Open menu">
        <FiMenu />
      </button>
      <h2 className="navbar-title">{title}</h2>
      <div className="navbar-user">
        <Avatar name={displayName} size={36} />
        <span className="navbar-user-text">
          <strong>{displayName}</strong>
          <small>{user?.role === 'admin' ? 'Administrator' : 'Employee'}</small>
        </span>
        <button type="button" className="btn btn-ghost" onClick={handleLogout} disabled={busy}>
          <FiLogOut aria-hidden="true" />
          <span className="hide-sm">{busy ? 'Logging out...' : 'Logout'}</span>
        </button>
      </div>
    </header>
  );
}
