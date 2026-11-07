# Workforce Management System - Frontend

React 18 + Vite + React Router 6 + Axios, plain CSS. It talks to the Express
backend in `../backend` using a **session cookie** (`withCredentials: true`),
not tokens.

## Run it locally

You need two terminals. Start the backend first.

```bash
# Terminal 1 - backend
cd backend
npm install        # first time only
npm run dev        # listens on PORT from backend/.env

# Terminal 2 - frontend
cd frontend
npm install        # first time only
npm run dev        # http://localhost:5173
```

Open **http://localhost:5173** in the browser. Use `localhost`, not
`127.0.0.1`: the backend only accepts the origin in `CLIENT_URL`, and the
browser treats the two names as different sites (the login cookie would be dropped).

### Which backend address does the frontend use?

By default `http://localhost:5000/api`. If your backend runs on a different
port (check `PORT` in `backend/.env`), create `frontend/.env`:

```
VITE_API_URL=http://localhost:5001/api
```

and restart `npm run dev` (Vite reads `.env` only at start-up).

The frontend must stay on port 5173 because `CLIENT_URL` in `backend/.env`
is `http://localhost:5173` (CORS). `strictPort` makes Vite stop with an error
instead of silently moving to 5174.

## Scripts

| Command           | What it does                                   |
|-------------------|------------------------------------------------|
| `npm run dev`     | Development server with hot reload (port 5173) |
| `npm run build`   | Production build into `dist/`                  |
| `npm run preview` | Serve the `dist/` build locally                |

## Pages

| URL                       | Who      | Page                                   |
|---------------------------|----------|----------------------------------------|
| `/`                       | everyone | Home                                   |
| `/login`, `/register`     | logged out | Login, employee sign-up              |
| `/admin`                  | admin    | Dashboard                              |
| `/admin/employees[/:id]`  | admin    | Employees list, one employee's profile |
| `/admin/departments`      | admin    | Departments                            |
| `/admin/attendance`       | admin    | Attendance verification + statistics   |
| `/admin/tasks`            | admin    | Tasks                                  |
| `/admin/documents`        | admin    | Document verification                  |
| `/employee`               | employee | Dashboard                              |
| `/employee/profile`       | employee | My profile (+ photo)                   |
| `/employee/attendance`    | employee | Check in with photo, check out, history|
| `/employee/tasks`         | employee | My tasks (start / complete)            |
| `/employee/documents`     | employee | Upload, replace, delete my documents   |

A logged-out user who opens a protected page is sent to `/login`; a user
with the wrong role is sent to their own dashboard. The backend checks the
role again on every request, so this is only for the UI.

## Folder structure

```
src/
  main.jsx              providers: Router, Toasts, Auth
  App.jsx               all routes
  services/api.js       every API call (Axios, withCredentials)
  context/              AuthContext (who is logged in), ToastContext
  hooks/useFetch.js     loading / error / reload for API data
  layouts/              AppLayout (sidebar + navbar), Admin/Employee menus
  components/           Navbar, Sidebar, ProtectedRoute, DashboardCard,
                        DataTable, Modal, ConfirmDialog, FormInput,
                        LoadingSpinner, ErrorMessage, EmptyState, ...
  pages/                Home, Login, Register, NotFound
  pages/admin/          admin pages
  pages/employee/       employee pages
  utils/format.js       date / time / hours formatting
  styles/index.css      all styles (CSS variables, responsive rules)
```

## Common problems

| Symptom | Cause / fix |
|---|---|
| "Cannot reach the server at http://localhost:5000/api" | Backend not running, or on another port - set `VITE_API_URL` (see above). |
| Login works but you are logged out on the next click | You opened `127.0.0.1:5173`; use `localhost:5173`. |
| CORS error in the browser console | The page's address is not `CLIENT_URL` in `backend/.env`. |
| `Port 5173 is already in use` | Another Vite is running; stop it (the backend only accepts 5173). |
| Photos/documents show "No photo available" | The file is missing on disk (old sample rows point to files that were never uploaded). |
