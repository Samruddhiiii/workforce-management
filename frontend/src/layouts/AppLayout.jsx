// src/layouts/AppLayout.jsx
// The frame shared by both roles: sidebar + top bar + the current page.
// AdminLayout and EmployeeLayout only pass in different menu links.
// <Outlet /> is where React Router puts the page for the current URL.

import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';

export default function AppLayout({ links, title }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Title in the top bar = the menu link that matches the URL best
  const current = [...links]
    .sort((a, b) => b.to.length - a.to.length)
    .find((link) => location.pathname === link.to || location.pathname.startsWith(`${link.to}/`));

  return (
    <div className="app-shell">
      <Sidebar links={links} title={title} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="app-main">
        <Navbar title={current?.label || title} onMenuClick={() => setMenuOpen(true)} />
        <main className="app-content" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
