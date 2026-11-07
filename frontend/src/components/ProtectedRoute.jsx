// src/components/ProtectedRoute.jsx
// Wraps pages that need a login, and optionally a specific role.
//
//   <Route element={<ProtectedRoute role="admin" />}> ...admin pages... </Route>
//
//  - still checking the session -> spinner (don't redirect too early on refresh)
//  - not logged in              -> /login (and remember where the user wanted to go)
//  - logged in, wrong role      -> their own dashboard
//
// This only decides what the UI shows. The backend checks the role again on
// every API request, so a user who edits the JavaScript still gets 403.

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { homePathFor, useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';

export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingSpinner fullPage label="Checking your session..." />;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (role && user.role !== role) {
    return <Navigate to={homePathFor(user)} replace />;
  }

  return children || <Outlet />;
}

// The opposite: login and register pages. A logged-in user is sent to
// their dashboard instead of seeing the login form again.
export function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage label="Checking your session..." />;
  if (user) return <Navigate to={homePathFor(user)} replace />;
  return children || <Outlet />;
}
