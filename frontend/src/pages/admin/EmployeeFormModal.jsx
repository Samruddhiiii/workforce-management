// src/pages/admin/EmployeeFormModal.jsx
// One form for "Add employee" and "Edit employee".
//  - Add:  POST /api/employees  (creates the login account + profile together)
//  - Edit: PUT  /api/employees/:id  (only the fields that changed are sent)

import { useEffect, useState } from 'react';
import { employeeApi, getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { todayISO } from '../../utils/format';
import ErrorMessage from '../../components/ErrorMessage';
import FormInput from '../../components/FormInput';
import Modal from '../../components/Modal';

const FIELDS = ['first_name', 'last_name', 'email', 'phone', 'department_id', 'designation', 'date_of_joining', 'employment_status', 'address'];

function toForm(employee) {
  if (!employee) {
    return { first_name: '', last_name: '', email: '', password: '', phone: '', department_id: '', designation: '', date_of_joining: todayISO(), employment_status: 'Active', address: '' };
  }
  return Object.fromEntries(FIELDS.map((field) => [field, employee[field] ?? '']));
}

export default function EmployeeFormModal({ open, employee, departments, onClose, onSaved }) {
  const isEdit = Boolean(employee);
  const toast = useToast();
  const [form, setForm] = useState(toForm(employee));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Fresh form every time the modal opens
  useEffect(() => {
    if (open) {
      setForm(toForm(employee));
      setError('');
    }
  }, [open, employee]);

  const handleChange = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!form.first_name.trim() || !form.email.trim() || !form.department_id || (!isEdit && !form.password)) {
      setError(`Please fill in first name, email, department${isEdit ? '' : ' and password'}.`);
      return;
    }

    let body;
    if (isEdit) {
      // Partial update: only what changed
      const original = toForm(employee);
      body = Object.fromEntries(FIELDS.filter((field) => String(form[field]) !== String(original[field])).map((field) => [field, form[field]]));
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
    } else {
      body = { ...form };
    }
    if (body.department_id !== undefined) body.department_id = Number(body.department_id);

    setSaving(true);
    try {
      const result = isEdit ? await employeeApi.update(employee.employee_id, body) : await employeeApi.create(body);
      toast.success(result.message);
      onSaved(result.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="large"
      title={isEdit ? `Edit ${employee.full_name}` : 'Add employee'}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="employee-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create employee'}
          </button>
        </>
      }
    >
      <ErrorMessage message={error} />
      <form id="employee-form" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <FormInput label="First name" name="first_name" value={form.first_name} onChange={handleChange} required />
          <FormInput label="Last name" name="last_name" value={form.last_name} onChange={handleChange} />
          <FormInput label="Email" name="email" type="email" value={form.email} onChange={handleChange} required />
          {isEdit ? (
            <FormInput as="select" label="Status" name="employment_status" value={form.employment_status} onChange={handleChange}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </FormInput>
          ) : (
            <FormInput label="Temporary password" name="password" type="password" value={form.password} onChange={handleChange}
              hint="At least 8 characters. Share it with the employee." autoComplete="new-password" required />
          )}
          <FormInput as="select" label="Department" name="department_id" value={form.department_id} onChange={handleChange} required>
            <option value="">Choose a department</option>
            {departments.map((dept) => (
              <option key={dept.department_id} value={dept.department_id}>{dept.department_name}</option>
            ))}
          </FormInput>
          <FormInput label="Designation" name="designation" value={form.designation} onChange={handleChange} placeholder="e.g. Software Engineer" />
          <FormInput label="Phone" name="phone" type="tel" value={form.phone} onChange={handleChange} />
          <FormInput label="Date of joining" name="date_of_joining" type="date" value={form.date_of_joining} onChange={handleChange} />
          <FormInput as="textarea" label="Address" name="address" rows={2} value={form.address} onChange={handleChange} className="span-2" />
        </div>
      </form>
    </Modal>
  );
}
