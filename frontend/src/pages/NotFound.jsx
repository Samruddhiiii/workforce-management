// src/pages/NotFound.jsx - any URL that matches no route
import { Link } from 'react-router-dom';
import { homePathFor, useAuth } from '../context/AuthContext';

export default function NotFound() {
  const { user } = useAuth();
  return (
    <div className="center-page">
      <div className="center-card">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p className="muted">The page you are looking for does not exist or has moved.</p>
        <Link className="btn btn-primary" to={user ? homePathFor(user) : '/'}>
          {user ? 'Go to my dashboard' : 'Go to the home page'}
        </Link>
      </div>
    </div>
  );
}
