// src/pages/employee/Tasks.jsx
// Your assigned tasks. You can move a task to "In Progress" or "Completed".
// Everything else (title, due date, priority, who it is assigned to) can
// only be changed by the admin - the backend enforces this too.

import { useState } from 'react';
import { FiCalendar, FiCheck, FiPlay, FiRotateCcw, FiUser } from 'react-icons/fi';
import { getErrorMessage, taskApi } from '../../services/api';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/format';
import EmptyState from '../../components/EmptyState';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingSpinner from '../../components/LoadingSpinner';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';

const TABS = [
  { value: '', label: 'All' },
  { value: 'Pending', label: 'Pending' },
  { value: 'In Progress', label: 'In progress' },
  { value: 'Completed', label: 'Completed' },
];

export default function EmployeeTasks() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const tasks = useFetch(() => taskApi.my({ status }), [status]);
  const [busyId, setBusyId] = useState(null);

  async function changeStatus(task, newStatus) {
    setBusyId(task.task_id);
    try {
      const result = await taskApi.setStatus(task.task_id, newStatus);
      toast.success(result.message);
      tasks.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <PageHeader title="My tasks" subtitle="Tasks assigned to you by the administrator" />

      <div className="tabs" role="tablist" aria-label="Filter tasks by status">
        {TABS.map((tab) => (
          <button key={tab.label} type="button" role="tab" aria-selected={status === tab.value}
            className={`tab${status === tab.value ? ' is-active' : ''}`} onClick={() => setStatus(tab.value)}>
            {tab.label}
          </button>
        ))}
      </div>

      <ErrorMessage message={tasks.error} onRetry={tasks.reload} />

      {tasks.loading && !tasks.data ? (
        <LoadingSpinner />
      ) : !tasks.data || tasks.data.length === 0 ? (
        !tasks.error && (
          <section className="panel">
            <EmptyState title={status ? `No ${status.toLowerCase()} tasks` : 'No tasks assigned yet'} message="New tasks from the administrator will appear here." />
          </section>
        )
      ) : (
        <div className={`task-grid${tasks.loading ? ' is-reloading' : ''}`}>
          {tasks.data.map((task) => {
            const busy = busyId === task.task_id;
            return (
              <article key={task.task_id} className={`task-card${task.is_overdue ? ' is-overdue' : ''}`}>
                <div className="task-card-top">
                  <StatusBadge value={task.priority} />
                  <StatusBadge value={task.status} />
                  {task.is_overdue && <StatusBadge value="Overdue" />}
                </div>
                <h3>{task.task_title}</h3>
                {task.description && <p className="muted">{task.description}</p>}
                <ul className="task-meta">
                  <li><FiCalendar aria-hidden="true" /> Due {task.due_date ? formatDate(task.due_date) : 'no date'}</li>
                  <li><FiUser aria-hidden="true" /> From {task.assigned_by_name || 'Admin'}</li>
                </ul>
                <div className="task-actions">
                  {task.status !== 'In Progress' && task.status !== 'Completed' && (
                    <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => changeStatus(task, 'In Progress')}>
                      <FiPlay aria-hidden="true" /> Start
                    </button>
                  )}
                  {task.status === 'Completed' ? (
                    <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={() => changeStatus(task, 'In Progress')}>
                      <FiRotateCcw aria-hidden="true" /> Reopen
                    </button>
                  ) : (
                    <button type="button" className="btn btn-success btn-small" disabled={busy} onClick={() => changeStatus(task, 'Completed')}>
                      <FiCheck aria-hidden="true" /> {busy ? 'Saving...' : 'Mark completed'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
