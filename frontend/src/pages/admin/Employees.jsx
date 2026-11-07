// src/pages/admin/Employees.jsx
// List, search and filter employees; add, edit, deactivate/reactivate.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiEdit2, FiEye, FiPlus, FiSearch, FiUserCheck, FiUserX } from 'react-icons/fi';
import { departmentApi, employeeApi, getErrorMessage } from '../../services/api';
import { useDebouncedValue, useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import Avatar from '../../components/Avatar';
import ConfirmDialog from '../../components/ConfirmDialog';
import DataTable from '../../components/DataTable';
import ErrorMessage from '../../components/ErrorMessage';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';
import EmployeeFormModal from './EmployeeFormModal';

export default function AdminEmployees() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  const employees = useFetch(
    () => employeeApi.list({ search: debouncedSearch.trim(), department_id: departmentId, status }),
    [debouncedSearch, departmentId, status]
  );
  const departments = useFetch(() => departmentApi.list(), []);

  const [formTarget, setFormTarget] = useState(null); // null = closed, {} = add, employee = edit
  const [statusTarget, setStatusTarget] = useState(null); // employee to (de)activate
  const [busy, setBusy] = useState(false);

  async function toggleStatus() {
    const employee = statusTarget;
    setBusy(true);
    try {
      const result = employee.employment_status === 'Active'
        ? await employeeApi.deactivate(employee.employee_id)
        : await employeeApi.update(employee.employee_id, { employment_status: 'Active' });
      toast.success(result.message);
      setStatusTarget(null);
      employees.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    {
      key: 'name', header: 'Employee',
      render: (row) => (
        <div className="person">
          <Avatar name={row.full_name} photoUrl={row.profile_photo_url} size={36} />
          <div>
            <Link to={`/admin/employees/${row.employee_id}`} className="person-name">{row.full_name}</Link>
            <div className="muted small">{row.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'department_name', header: 'Department' },
    { key: 'designation', header: 'Designation' },
    { key: 'phone', header: 'Phone' },
    { key: 'employment_status', header: 'Status', render: (row) => <StatusBadge value={row.employment_status} /> },
    {
      key: 'actions', header: 'Actions', className: 'actions',
      render: (row) => (
        <div className="row-actions">
          <Link to={`/admin/employees/${row.employee_id}`} className="icon-button" title="View profile" aria-label={`View ${row.full_name}`}><FiEye /></Link>
          <button type="button" className="icon-button" title="Edit" aria-label={`Edit ${row.full_name}`} onClick={() => setFormTarget(row)}><FiEdit2 /></button>
          {row.employment_status === 'Active' ? (
            <button type="button" className="icon-button danger" title="Deactivate" aria-label={`Deactivate ${row.full_name}`} onClick={() => setStatusTarget(row)}><FiUserX /></button>
          ) : (
            <button type="button" className="icon-button success" title="Reactivate" aria-label={`Reactivate ${row.full_name}`} onClick={() => setStatusTarget(row)}><FiUserCheck /></button>
          )}
        </div>
      ),
    },
  ];

  const isDeactivating = statusTarget?.employment_status === 'Active';

  return (
    <div className="page">
      <PageHeader title="Employees" subtitle="Add, search and manage employee profiles">
        <button type="button" className="btn btn-primary" onClick={() => setFormTarget({})}>
          <FiPlus aria-hidden="true" /> Add employee
        </button>
      </PageHeader>

      <div className="toolbar">
        <label className="search-box">
          <FiSearch aria-hidden="true" />
          <input type="search" placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search employees" />
        </label>
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} aria-label="Filter by department">
          <option value="">All departments</option>
          {(departments.data || []).map((dept) => (
            <option key={dept.department_id} value={dept.department_id}>{dept.department_name}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      <ErrorMessage message={employees.error} onRetry={employees.reload} />
      <section className="panel">
        <DataTable columns={columns} rows={employees.data} rowKey="employee_id" loading={employees.loading}
          emptyTitle="No employees found" emptyMessage={search || departmentId || status ? 'Try different filters.' : 'Add your first employee.'} />
      </section>

      <EmployeeFormModal
        open={formTarget !== null}
        employee={formTarget && formTarget.employee_id ? formTarget : null}
        departments={departments.data || []}
        onClose={() => setFormTarget(null)}
        onSaved={() => {
          setFormTarget(null);
          employees.reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(statusTarget)}
        title={isDeactivating ? 'Deactivate employee?' : 'Reactivate employee?'}
        message={isDeactivating
          ? `${statusTarget?.full_name} will no longer be able to log in. Their attendance, tasks and documents are kept.`
          : `${statusTarget?.full_name} will be able to log in again.`}
        confirmLabel={isDeactivating ? 'Deactivate' : 'Reactivate'}
        danger={isDeactivating}
        busy={busy}
        onConfirm={toggleStatus}
        onCancel={() => setStatusTarget(null)}
      />
    </div>
  );
}
