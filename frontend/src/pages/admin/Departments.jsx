// src/pages/admin/Departments.jsx
// Add, rename and delete departments. The backend refuses to delete a
// department that still has employees (409) - we show that message.

import { useState } from 'react';
import { FiEdit2, FiPlus, FiTrash2 } from 'react-icons/fi';
import { departmentApi, getErrorMessage } from '../../services/api';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import DataTable from '../../components/DataTable';
import ErrorMessage from '../../components/ErrorMessage';
import FormInput from '../../components/FormInput';
import Modal from '../../components/Modal';
import PageHeader from '../../components/PageHeader';

export default function AdminDepartments() {
  const toast = useToast();
  const departments = useFetch(() => departmentApi.list(), []);

  const [formTarget, setFormTarget] = useState(null); // null closed, {} new, department = edit
  const [form, setForm] = useState({ department_name: '', description: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function openForm(department) {
    setFormTarget(department);
    setForm({ department_name: department.department_name || '', description: department.description || '' });
    setFormError('');
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!form.department_name.trim()) {
      setFormError('Department name is required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const result = formTarget.department_id
        ? await departmentApi.update(formTarget.department_id, form)
        : await departmentApi.create(form);
      toast.success(result.message);
      setFormTarget(null);
      departments.reload();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const result = await departmentApi.remove(deleteTarget.department_id);
      toast.success(result.message);
      departments.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const columns = [
    { key: 'department_name', header: 'Department', render: (row) => <strong>{row.department_name}</strong> },
    { key: 'description', header: 'Description', render: (row) => row.description || <span className="muted">—</span> },
    { key: 'employee_count', header: 'Employees', render: (row) => `${row.active_employee_count} active / ${row.employee_count} total` },
    {
      key: 'actions', header: 'Actions', className: 'actions',
      render: (row) => (
        <div className="row-actions">
          <button type="button" className="icon-button" title="Edit" aria-label={`Edit ${row.department_name}`} onClick={() => openForm(row)}><FiEdit2 /></button>
          <button
            type="button"
            className="icon-button danger"
            title={row.employee_count > 0 ? 'Move its employees to another department first' : 'Delete'}
            aria-label={`Delete ${row.department_name}`}
            onClick={() => setDeleteTarget(row)}
          >
            <FiTrash2 />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader title="Departments" subtitle="Organise employees into departments">
        <button type="button" className="btn btn-primary" onClick={() => openForm({})}>
          <FiPlus aria-hidden="true" /> Add department
        </button>
      </PageHeader>

      <ErrorMessage message={departments.error} onRetry={departments.reload} />
      <section className="panel">
        <DataTable columns={columns} rows={departments.data} rowKey="department_id" loading={departments.loading} emptyTitle="No departments yet" />
      </section>

      <Modal
        open={formTarget !== null}
        title={formTarget?.department_id ? 'Edit department' : 'Add department'}
        onClose={() => setFormTarget(null)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setFormTarget(null)} disabled={saving}>Cancel</button>
            <button type="submit" form="department-form" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </>
        }
      >
        <ErrorMessage message={formError} />
        <form id="department-form" onSubmit={handleSave} noValidate>
          <FormInput label="Name" name="department_name" value={form.department_name} maxLength={100}
            onChange={(e) => setForm({ ...form, department_name: e.target.value })} required />
          <FormInput as="textarea" label="Description" name="description" rows={3} value={form.description} maxLength={1000}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete department?"
        message={deleteTarget?.employee_count > 0
          ? `${deleteTarget.department_name} still has ${deleteTarget.employee_count} employee(s). Move them to another department first - the server will refuse to delete it.`
          : `"${deleteTarget?.department_name}" will be deleted permanently.`}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
