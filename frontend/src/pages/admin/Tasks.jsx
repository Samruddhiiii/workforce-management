// src/pages/admin/Tasks.jsx
// Create, edit, delete and track tasks. Filters: employee, status, priority,
// title search, overdue only. The status can also be changed right in the table.

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiEdit2, FiPlus, FiSearch, FiTrash2 } from 'react-icons/fi';
import { employeeApi, getErrorMessage, taskApi } from '../../services/api';
import { useDebouncedValue, useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { formatDate, todayISO } from '../../utils/format';
import ConfirmDialog from '../../components/ConfirmDialog';
import DataTable from '../../components/DataTable';
import ErrorMessage from '../../components/ErrorMessage';
import FormInput from '../../components/FormInput';
import Modal from '../../components/Modal';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';

const STATUSES = ['Pending', 'In Progress', 'Completed'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const EMPTY_TASK = { task_title: '', description: '', assigned_to: '', due_date: '', priority: 'Medium', status: 'Pending' };

function TaskFormModal({ task, employees, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = Boolean(task?.task_id);
  const [form, setForm] = useState(EMPTY_TASK);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!task) return;
    setForm(isEdit
      ? { task_title: task.task_title, description: task.description || '', assigned_to: String(task.assigned_to), due_date: task.due_date || '', priority: task.priority, status: task.status }
      : EMPTY_TASK);
    setError('');
  }, [task, isEdit]);

  const handleChange = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.task_title.trim() || !form.assigned_to) {
      setError('Please enter a title and choose an employee.');
      return;
    }
    setSaving(true);
    setError('');
    const body = { ...form, assigned_to: Number(form.assigned_to), due_date: form.due_date || null };
    try {
      const result = isEdit ? await taskApi.update(task.task_id, body) : await taskApi.create(body);
      toast.success(result.message);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // Inactive employees can't get new tasks, but keep the current assignee in the list when editing
  const choices = employees.filter((emp) => emp.employment_status === 'Active' || String(emp.employee_id) === form.assigned_to);

  return (
    <Modal
      open={Boolean(task)}
      title={isEdit ? 'Edit task' : 'New task'}
      onClose={onClose}
      size="large"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="task-form" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create task'}</button>
        </>
      }
    >
      <ErrorMessage message={error} />
      <form id="task-form" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <FormInput label="Title" name="task_title" value={form.task_title} onChange={handleChange} maxLength={150} required className="span-2" />
          <FormInput as="textarea" label="Description" name="description" rows={3} value={form.description} onChange={handleChange} className="span-2" />
          <FormInput as="select" label="Assign to" name="assigned_to" value={form.assigned_to} onChange={handleChange} required>
            <option value="">Choose an employee</option>
            {choices.map((emp) => (
              <option key={emp.employee_id} value={emp.employee_id}>{emp.full_name} ({emp.department_name})</option>
            ))}
          </FormInput>
          <FormInput label="Due date" name="due_date" type="date" value={form.due_date} onChange={handleChange} min={isEdit ? undefined : todayISO()} />
          <FormInput as="select" label="Priority" name="priority" value={form.priority} onChange={handleChange}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </FormInput>
          <FormInput as="select" label="Status" name="status" value={form.status} onChange={handleChange}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </FormInput>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminTasks() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    employee_id: '',
    status: searchParams.get('status') || '',
    priority: '',
    overdue: searchParams.get('overdue') === 'true',
  });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  const tasks = useFetch(
    () => taskApi.list({ ...filters, overdue: filters.overdue ? 'true' : '', search: debouncedSearch.trim() }),
    [filters.employee_id, filters.status, filters.priority, filters.overdue, debouncedSearch]
  );
  const employees = useFetch(() => employeeApi.list(), []);

  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const setFilter = (name) => (event) => setFilters({ ...filters, [name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value });

  async function changeStatus(task, status) {
    try {
      const result = await taskApi.setStatus(task.task_id, status);
      toast.success(result.message);
      tasks.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const result = await taskApi.remove(deleteTarget.task_id);
      toast.success(result.message);
      tasks.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const columns = [
    { key: 'task_title', header: 'Task', render: (row) => (
      <div className="task-cell"><strong>{row.task_title}</strong>{row.description && <div className="muted small clamp-2">{row.description}</div>}</div>
    ) },
    { key: 'assigned_to_name', header: 'Assigned to', render: (row) => (
      <div>{row.assigned_to_name}<div className="muted small">{row.department_name}</div></div>
    ) },
    { key: 'priority', header: 'Priority', render: (row) => <StatusBadge value={row.priority} /> },
    { key: 'due_date', header: 'Due date', render: (row) => (
      <span className={row.is_overdue ? 'text-danger' : ''}>{formatDate(row.due_date)}{row.is_overdue && <><br /><StatusBadge value="Overdue" /></>}</span>
    ) },
    { key: 'status', header: 'Status', render: (row) => (
      <select className="inline-select" value={row.status} onChange={(e) => changeStatus(row, e.target.value)} aria-label={`Status of ${row.task_title}`}>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    ) },
    { key: 'assigned_by_name', header: 'Assigned by', render: (row) => <span className="small">{row.assigned_by_name || '—'}</span> },
    { key: 'actions', header: 'Actions', className: 'actions', render: (row) => (
      <div className="row-actions">
        <button type="button" className="icon-button" title="Edit" aria-label={`Edit ${row.task_title}`} onClick={() => setEditing(row)}><FiEdit2 /></button>
        <button type="button" className="icon-button danger" title="Delete" aria-label={`Delete ${row.task_title}`} onClick={() => setDeleteTarget(row)}><FiTrash2 /></button>
      </div>
    ) },
  ];

  const hasFilters = filters.employee_id || filters.status || filters.priority || filters.overdue || search;

  return (
    <div className="page">
      <PageHeader title="Tasks" subtitle="Assign work and follow its progress">
        <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>
          <FiPlus aria-hidden="true" /> New task
        </button>
      </PageHeader>

      <div className="toolbar">
        <label className="search-box">
          <FiSearch aria-hidden="true" />
          <input type="search" placeholder="Search task titles" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search tasks" />
        </label>
        <select value={filters.employee_id} onChange={setFilter('employee_id')} aria-label="Filter by employee">
          <option value="">All employees</option>
          {(employees.data || []).map((emp) => <option key={emp.employee_id} value={emp.employee_id}>{emp.full_name}</option>)}
        </select>
        <select value={filters.status} onChange={setFilter('status')} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.priority} onChange={setFilter('priority')} aria-label="Filter by priority">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={filters.overdue} onChange={setFilter('overdue')} /> Overdue only
        </label>
        {hasFilters && (
          <button type="button" className="btn btn-ghost" onClick={() => { setFilters({ employee_id: '', status: '', priority: '', overdue: false }); setSearch(''); }}>
            Clear filters
          </button>
        )}
      </div>

      <ErrorMessage message={tasks.error} onRetry={tasks.reload} />
      <section className="panel">
        <DataTable columns={columns} rows={tasks.data} rowKey="task_id" loading={tasks.loading}
          emptyTitle="No tasks found" emptyMessage={hasFilters ? 'Try different filters.' : 'Create the first task.'} />
      </section>

      <TaskFormModal
        task={editing}
        employees={employees.data || []}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          tasks.reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete task?"
        message={`"${deleteTarget?.task_title}" will be deleted permanently.`}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
