// src/components/ConfirmDialog.jsx
// "Are you sure?" box before deleting or deactivating something.
//   <ConfirmDialog open={!!toDelete} title="Delete task?" message="..." confirmLabel="Delete"
//                  danger busy={deleting} onConfirm={handleDelete} onCancel={() => setToDelete(null)} />
import Modal from './Modal';

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger = false, busy = false, onConfirm, onCancel }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? () => {} : onCancel}
      size="small"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Please wait...' : confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}
