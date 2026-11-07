// src/components/Sidebar.jsx
// Dark navigation panel on the left. The links come from the layout
// (AdminLayout / EmployeeLayout), so each role sees only its own menu.
// On phones it slides in from the left when the menu button is pressed.

import { NavLink } from 'react-router-dom';
import { FiX } from 'react-icons/fi';

export default function Sidebar({ links, title, open, onClose }) {
  return (
    <>
      <aside className={`sidebar${open ? ' is-open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">W</span>
          <span className="brand-text">
            <strong>Workforce</strong>
            <small>{title}</small>
          </span>
          <button type="button" className="icon-button sidebar-close" onClick={onClose} aria-label="Close menu">
            <FiX />
          </button>
        </div>
        <nav className="sidebar-nav">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="sidebar-link" onClick={onClose}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      {open && <div className="sidebar-overlay" onClick={onClose} aria-hidden="true" />}
    </>
  );
}
