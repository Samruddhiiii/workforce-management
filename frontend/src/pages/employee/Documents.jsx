// src/pages/employee/Documents.jsx
// Upload documents, see their verification status and the admin's remarks,
// replace a Pending/Rejected document, or delete one that isn't approved yet.
// Approved documents are locked (the backend refuses changes with 409).

import { useState } from 'react';
import { FiDownload, FiExternalLink, FiRefreshCw, FiTrash2, FiUpload } from 'react-icons/fi';
import { documentApi, fileUrl, getErrorMessage } from '../../services/api';
import { useFetch } from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { formatDateTime, MB } from '../../utils/format';
import ConfirmDialog from '../../components/ConfirmDialog';
import DataTable from '../../components/DataTable';
import ErrorMessage from '../../components/ErrorMessage';
import FormInput from '../../components/FormInput';
import Modal from '../../components/Modal';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';

const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const MAX_FILE_MB = 5;

// Checks the chosen file before sending it (the server checks again)
function checkFile(file) {
  if (!file) return 'Please choose a file.';
  if (!FILE_TYPES.includes(file.type)) return 'Only PDF, JPEG or PNG files are allowed.';
  if (file.size > MAX_FILE_MB * MB) return `The file is too large. Maximum size is ${MAX_FILE_MB} MB.`;
  return '';
}

const EMPTY_UPLOAD = { document_name: '', document_type: '', file: null };

export default function EmployeeDocuments() {
  const toast = useToast();
  const documents = useFetch(() => documentApi.my(), []);
  const types = useFetch(() => documentApi.types(), []);

  // Upload form
  const [upload, setUpload] = useState(EMPTY_UPLOAD);
  const [fileInputKey, setFileInputKey] = useState(0); // changing the key empties the file input
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);

  // Replace + delete
  const [replacing, setReplacing] = useState(null);
  const [replaceFile, setReplaceFile] = useState(null);
  const [replaceError, setReplaceError] = useState('');
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function handleUpload(event) {
    event.preventDefault();
    const problem = !upload.document_name.trim() ? 'Please enter a document name.'
      : !upload.document_type ? 'Please choose a document type.'
        : checkFile(upload.file);
    if (problem) return setUploadError(problem);

    setUploading(true);
    setUploadError('');
    try {
      const result = await documentApi.upload({ ...upload, document_name: upload.document_name.trim() });
      toast.success(result.message);
      setUpload(EMPTY_UPLOAD);
      setFileInputKey((key) => key + 1);
      documents.reload();
    } catch (err) {
      setUploadError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleReplace(event) {
    event.preventDefault();
    const problem = checkFile(replaceFile);
    if (problem) return setReplaceError(problem);
    setReplaceBusy(true);
    setReplaceError('');
    try {
      const result = await documentApi.replace(replacing.document_id, { file: replaceFile });
      toast.success(result.message);
      setReplacing(null);
      documents.reload();
    } catch (err) {
      setReplaceError(getErrorMessage(err));
    } finally {
      setReplaceBusy(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const result = await documentApi.remove(deleteTarget.document_id);
      toast.success(result.message);
      documents.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const columns = [
    { key: 'document_name', header: 'Document', render: (row) => (
      <div><strong>{row.document_name}</strong><div className="muted small">{row.document_type}</div></div>
    ) },
    { key: 'uploaded_at', header: 'Uploaded', render: (row) => formatDateTime(row.uploaded_at) },
    { key: 'verification_status', header: 'Status', render: (row) => <StatusBadge value={row.verification_status} /> },
    { key: 'admin_remarks', header: 'Admin remarks', render: (row) => row.admin_remarks || <span className="muted">—</span> },
    { key: 'actions', header: 'Actions', className: 'actions', render: (row) => {
      const locked = row.verification_status === 'Approved';
      return (
        <div className="row-actions">
          {row.file_url && (
            <>
              <a className="icon-button" href={fileUrl(row.file_url)} target="_blank" rel="noopener noreferrer" title="Open" aria-label={`Open ${row.document_name}`}><FiExternalLink /></a>
              <a className="icon-button" href={fileUrl(row.file_url, { download: true })} title="Download" aria-label={`Download ${row.document_name}`}><FiDownload /></a>
            </>
          )}
          {!locked && (
            <>
              <button type="button" className="icon-button" title="Replace file" aria-label={`Replace ${row.document_name}`}
                onClick={() => { setReplacing(row); setReplaceFile(null); setReplaceError(''); }}><FiRefreshCw /></button>
              <button type="button" className="icon-button danger" title="Delete" aria-label={`Delete ${row.document_name}`} onClick={() => setDeleteTarget(row)}><FiTrash2 /></button>
            </>
          )}
        </div>
      );
    } },
  ];

  return (
    <div className="page">
      <PageHeader title="My documents" subtitle="Upload documents for the administrator to verify" />

      <section className="panel">
        <h3>Upload a document</h3>
        <ErrorMessage message={uploadError || types.error} />
        <form className="upload-form" onSubmit={handleUpload} noValidate>
          <FormInput label="Document name" name="document_name" value={upload.document_name} maxLength={150} placeholder="e.g. PAN Card"
            onChange={(e) => setUpload({ ...upload, document_name: e.target.value })} required />
          <FormInput as="select" label="Type" name="document_type" value={upload.document_type}
            onChange={(e) => setUpload({ ...upload, document_type: e.target.value })} required>
            <option value="">Choose a type</option>
            {(types.data || []).map((type) => <option key={type} value={type}>{type}</option>)}
          </FormInput>
          <FormInput key={fileInputKey} label="File" name="document" type="file" accept={ACCEPT}
            onChange={(e) => setUpload({ ...upload, file: e.target.files[0] || null })} hint={`PDF, JPEG or PNG, up to ${MAX_FILE_MB} MB`} required />
          <button type="submit" className="btn btn-primary" disabled={uploading}>
            <FiUpload aria-hidden="true" /> {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      </section>

      <ErrorMessage message={documents.error} onRetry={documents.reload} />
      <section className="panel">
        <h3>Uploaded documents</h3>
        <DataTable columns={columns} rows={documents.data} rowKey="document_id" loading={documents.loading}
          emptyTitle="No documents yet" emptyMessage="Use the form above to upload your first document." />
      </section>

      <Modal
        open={Boolean(replacing)}
        title={`Replace "${replacing?.document_name}"`}
        onClose={() => setReplacing(null)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setReplacing(null)} disabled={replaceBusy}>Cancel</button>
            <button type="submit" form="replace-form" className="btn btn-primary" disabled={replaceBusy}>{replaceBusy ? 'Uploading...' : 'Replace file'}</button>
          </>
        }
      >
        {replacing?.admin_remarks && <div className="alert alert-info">Admin remark: {replacing.admin_remarks}</div>}
        <ErrorMessage message={replaceError} />
        <form id="replace-form" onSubmit={handleReplace} noValidate>
          <FormInput label="New file" name="document" type="file" accept={ACCEPT} onChange={(e) => setReplaceFile(e.target.files[0] || null)}
            hint="The document goes back to Pending and the admin reviews it again." required />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete document?"
        message={`"${deleteTarget?.document_name}" and its file will be deleted permanently.`}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
