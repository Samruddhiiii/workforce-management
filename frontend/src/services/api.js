// src/services/api.js
// Every call to the backend goes through this file.
//
// HOW LOGIN WORKS: the backend uses a SESSION COOKIE ("wms.sid"), not a token.
// `withCredentials: true` tells the browser to send that cookie with every
// request to the API (and to store it when the login response sets it).
// We never read or store the cookie ourselves - it is httpOnly, so
// JavaScript cannot even see it. That protects it from XSS.
//
// Every backend response looks like { success, message, data }.
//  - GET helpers return `data` directly (what the page needs to show).
//  - Helpers that change something return the whole { success, message, data },
//    so the page can show the server's message ("Task deleted", ...).

import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// The backend gives file links like "/api/files/profiles/x.jpg".
// They live on the BACKEND's address, so we prefix its origin.
const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');
export function fileUrl(path, { download = false } = {}) {
  if (!path) return null;
  return `${API_ORIGIN}${path}${download ? '?download=1' : ''}`;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 20000,
});

// ---------------------------------------------------------------------
// Session expired? When any request (other than the login check itself)
// answers 401, AuthContext is told so it can log the user out of the UI
// and send them to the login page.
// ---------------------------------------------------------------------
let onUnauthorized = null;
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isAuthCheck = url.startsWith('/auth/me') || url.startsWith('/auth/login');
    if (error.response?.status === 401 && !isAuthCheck && onUnauthorized) {
      onUnauthorized(error.response.data?.message);
    }
    return Promise.reject(error);
  }
);

// Turns any Axios error into one sentence for the user.
export function getErrorMessage(error) {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.code === 'ECONNABORTED') return 'The server took too long to answer. Please try again.';
  if (error?.request && !error.response) {
    return `Cannot reach the server at ${API_BASE_URL}. Is the backend running?`;
  }
  return error?.message || 'Something went wrong. Please try again.';
}

// Small helpers so each endpoint below is one line
const getData = (url, params) => api.get(url, { params }).then((res) => res.data.data);
const send = (method, url, body) => api.request({ method, url, data: body }).then((res) => res.data);

// Drops empty filter values so the URL stays clean (?status=&search= -> nothing)
function cleanParams(params = {}) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined));
}

// Builds multipart/form-data for file uploads. Axios sets the
// Content-Type header (with the boundary) automatically for FormData.
// undefined/null are left out; "" is sent (it clears a field, e.g. last name).
function toFormData(fields) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.append(key, value);
  });
  return form;
}

// ---------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------
export const authApi = {
  me: () => getData('/auth/me'),
  login: (email, password) => send('post', '/auth/login', { email, password }),
  register: (body) => send('post', '/auth/register', body),
  logout: () => send('post', '/auth/logout'),
};

export const departmentApi = {
  list: () => getData('/departments'),
  create: (body) => send('post', '/departments', body),
  update: (id, body) => send('put', `/departments/${id}`, body),
  remove: (id) => send('delete', `/departments/${id}`),
};

export const employeeApi = {
  list: (filters) => getData('/employees', cleanParams(filters)),
  get: (id) => getData(`/employees/${id}`),
  create: (body) => send('post', '/employees', body),
  update: (id, body) => send('put', `/employees/${id}`, body),
  deactivate: (id) => send('delete', `/employees/${id}`),
  getMe: () => getData('/employees/me'),
  // With a photo -> form-data; without -> plain JSON
  updateMe: (fields, photoFile) =>
    send('put', '/employees/me', photoFile ? toFormData({ ...fields, profile_photo: photoFile }) : fields),
};

export const attendanceApi = {
  mark: (photoFile) => send('post', '/attendance/mark', toFormData({ attendance_photo: photoFile })),
  checkOut: () => send('post', '/attendance/check-out'),
  my: (filters) => getData('/attendance/my', cleanParams(filters)),
  list: (filters) => getData('/attendance', cleanParams(filters)),
  stats: (date) => getData('/attendance/stats', cleanParams({ date })),
  verify: (id, status, adminRemarks) =>
    send('put', `/attendance/${id}/verify`, { status, admin_remarks: adminRemarks || undefined }),
};

export const taskApi = {
  list: (filters) => getData('/tasks', cleanParams(filters)),
  my: (filters) => getData('/tasks/my', cleanParams(filters)),
  get: (id) => getData(`/tasks/${id}`),
  create: (body) => send('post', '/tasks', body),
  update: (id, body) => send('put', `/tasks/${id}`, body),
  setStatus: (id, status) => send('patch', `/tasks/${id}/status`, { status }),
  remove: (id) => send('delete', `/tasks/${id}`),
};

export const documentApi = {
  types: () => getData('/documents/types'),
  my: (filters) => getData('/documents/my', cleanParams(filters)),
  list: (filters) => getData('/documents', cleanParams(filters)),
  upload: ({ file, document_name, document_type }) =>
    send('post', '/documents/upload', toFormData({ document_name, document_type, document: file })),
  replace: (id, { file, document_name, document_type }) =>
    send('put', `/documents/${id}`, toFormData({ document_name, document_type, document: file })),
  verify: (id, status, adminRemarks) =>
    send('put', `/documents/${id}/verify`, { status, admin_remarks: adminRemarks || undefined }),
  remove: (id) => send('delete', `/documents/${id}`),
};

export const dashboardApi = {
  admin: () => getData('/dashboard/admin'),
  employee: () => getData('/dashboard/employee'),
};

export default api;
