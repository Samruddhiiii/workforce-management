// src/pages/admin/Documents.jsx
// Review employee documents: preview/download, approve, reject with a reason, delete.

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiCheck, FiDownload, FiExternalLink, FiSearch, FiTrash2, FiX } from 'react-icons/fi';
import { documentApi, employeeApi, fileUrl, getErrorMessage } from '../../services/api';
import { useDebouncedValue, useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/format';
import ConfirmDialog from '../../components/ConfirmDialog';
import DataTable from '../../components/DataTable';
import ErrorMessage from '../../components/ErrorMessage';
import FormInput from '../../components/FormInput';
import Modal from '../../components/Modal';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';

export default function AdminDocuments() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({ employee_id: '', status: searchParams.get('status') || '', document_type: '' });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  const documents = useFetch(
    () => documentApi.list({ ...filters, search: debouncedSearch.trim() }),
    [filters.employee_id, filters.status, filters.document_type, debouncedSearch]
  );
  const employees = useFetch(() => employeeApi.list(), []);
  const types = useFetch(() => documentApi.types(), []);

  const [rejecting, setRejecting] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const setFilter = (name) => (event) => setFilters({ ...filters, [name]: event.target.value });

  async function verify(doc, status, adminRemarks) {
    setBusyId(doc.document_id);
    try {
      const result = await documentApi.verify(doc.document_id, status, adminRemarks);
      toast.success(`${result.message}: ${doc.document_name}`);
      documents.reload();
      return true;
    } catch (err) {
      const message = getErrorMessage(err);
      if (status === 'Rejected') setRejectError(message);
      else toast.error(message);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function submitReject(event) {
    event.preventDefault();
    if (!remarks.trim()) {
      setRejectError('Please explain what the employee should fix.');
      return;
    }
    if (await verify(rejecting, 'Rejected', remarks.trim())) setRejecting(null);
  }

  async function handleDelete() {
    setBusyId(deleteTarget.document_id);
    try {
      const result = await documentApi.remove(deleteTarget.document_id);
      toast.success(result.message);
      documents.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  }

  const columns = [
    { key: 'document_name', header: 'Document', render: (row) => (
      <div><strong>{row.document_name}</strong><div className="muted small">{row.document_type}</div></div>
    ) },
    { key: 'employee_name', header: 'Employee', render: (row) => (
      <div>{row.employee_name}<div className="muted small">{row.department_name}</div></div>
    ) },
    { key: 'uploaded_at', header: 'Uploaded', render: (row) => formatDateTime(row.uploaded_at) },
    { key: 'verification_status', header: 'Status', render: (row) => <StatusBadge value={row.verification_status} /> },
    { key: 'admin_remarks', header: 'Remarks', render: (row) => row.admin_remarks || <span className="muted">—</span> },
    { key: 'actions', header: 'Actions', className: 'actions', render: (row) => {
      const busy = busyId === row.document_id;
      return (
        <div className="row-actions">
          {row.file_url && (
            <>
              <a className="icon-button" href={fileUrl(row.file_url)} target="_blank" rel="noopener noreferrer" title="Open" aria-label={`Open ${row.document_name}`}><FiExternalLink /></a>
              <a className="icon-button" href={fileUrl(row.file_url, { download: true })} title="Download" aria-label={`Download ${row.document_name}`}><FiDownload /></a>
            </>
          )}
          {row.verification_status !== 'Approved' && (
            <button type="button" className="icon-button success" title="Approve" aria-label={`Approve ${row.document_name}`} disabled={busy} onClick={() => verify(row, 'Approved')}><FiCheck /></button>
          )}
          {row.verification_status !== 'Rejected' && (
            <button type="button" className="icon-button danger" title="Reject" aria-label={`Reject ${row.document_name}`} disabled={busy}
              onClick={() => { setRejecting(row); setRemarks(''); setRejectError(''); }}><FiX /></button>
          )}
          <button type="button" className="icon-button danger" title="Delete" aria-label={`Delete ${row.document_name}`} disabled={busy} onClick={() => setDeleteTarget(row)}><FiTrash2 /></button>
        </div>
      );
    } },
  ];

  return (
    <div className="page">
      <PageHeader title="Documents" subtitle="Review and verify employee documents" />

      <div className="toolbar">
        <label className="search-box">
          <FiSearch aria-hidden="true" />
          <input type="search" placeholder="Search document or employee" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search documents" />
        </label>
        <select value={filters.employee_id} onChange={setFilter('employee_id')} aria-label="Filter by employee">
          <option value="">All employees</option>
          {(employees.data || []).map((emp) => <option key={emp.employee_id} value={emp.employee_id}>{emp.full_name}</option>)}
        </select>
        <select value={filters.document_type} onChange={setFilter('document_type')} aria-label="Filter by type">
          <option value="">All types</option>
          {(types.data || []).map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <select value={filters.status} onChange={setFilter('status')} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      <ErrorMessage message={documents.error} onRetry={documents.reload} />
      <section className="panel">
        <DataTable columns={columns} rows={documents.data} rowKey="document_id" loading={documents.loading} emptyTitle="No documents found" />
      </section>

      <Modal
        open={Boolean(rejecting)}
        title={`Reject "${rejecting?.document_name}"`}
        onClose={() => setRejecting(null)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setRejecting(null)}>Cancel</button>
            <button type="submit" form="reject-form" className="btn btn-danger" disabled={Boolean(busyId)}>{busyId ? 'Rejecting...' : 'Reject document'}</button>
          </>
        }
      >
        <ErrorMessage message={rejectError} />
        <form id="reject-form" onSubmit={submitReject} noValidate>
          <FormInput as="textarea" label="Reason" name="admin_remarks" rows={3} maxLength={255} value={remarks} onChange={(e) => setRemarks(e.target.value)}
            hint={`${rejecting?.employee_name} will see this and can upload a replacement.`} required />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete document?"
        message={`"${deleteTarget?.document_name}" of ${deleteTarget?.employee_name} and its file will be deleted permanently.`}
        confirmLabel="Delete"
        danger
        busy={Boolean(busyId)}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
