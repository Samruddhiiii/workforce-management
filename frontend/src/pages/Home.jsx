// src/pages/Home.jsx
// Public landing page. Logged-in users get a button to their dashboard.
import { Link } from 'react-router-dom';
import { FiCalendar, FiCheckSquare, FiFileText, FiUsers } from 'react-icons/fi';
import { homePathFor, useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const FEATURES = [
  { icon: FiUsers, title: 'Employees & departments', text: 'One place for profiles, departments and employment status.' },
  { icon: FiCalendar, title: 'Photo attendance', text: 'Employees check in with a photo; admins verify each record.' },
  { icon: FiCheckSquare, title: 'Task tracking', text: 'Assign work with priorities and due dates, and follow progress.' },
  { icon: FiFileText, title: 'Document verification', text: 'Collect employee documents and approve or reject them.' },
];

export default function Home() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage />;

  return (
    <div className="home">
      <header className="home-header">
        <span className="home-brand">
          <span className="brand-mark" aria-hidden="true">W</span> Workforce
        </span>
        <nav className="home-nav">
          {user ? (
            <Link className="btn btn-primary" to={homePathFor(user)}>Open dashboard</Link>
          ) : (
            <>
              <Link className="btn btn-ghost" to="/login">Log in</Link>
              <Link className="btn btn-primary" to="/register">Create account</Link>
            </>
          )}
        </nav>
      </header>

      <section className="home-hero">
        <h1>Workforce Management System</h1>
        <p>
          Manage employees, departments, attendance, tasks and documents - with separate,
          role-based spaces for administrators and employees.
        </p>
        {!user && (
          <div className="home-cta">
            <Link className="btn btn-primary btn-large" to="/login">Log in</Link>
            <Link className="btn btn-secondary btn-large" to="/register">Register as employee</Link>
          </div>
        )}
      </section>

      <section className="home-features" aria-label="Features">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <article key={title} className="feature">
            <span className="card-icon tone-blue" aria-hidden="true"><Icon /></span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
