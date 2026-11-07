// src/components/Modal.jsx
// A dialog box on top of the page.
//   <Modal open={isOpen} title="Add employee" onClose={() => setOpen(false)} footer={<buttons/>}>
//     ...form...
//   </Modal>
// Closes with the Escape key, the X button, or a click on the dark background.
// Rendered with a portal into <body> so it is never cut off by a parent's CSS.

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiX } from 'react-icons/fi';

export default function Modal({ open, title, onClose, children, footer, size = 'medium' }) {
  const dialogRef = useRef(null);
  // Keep the latest onClose in a ref: parents usually pass a new arrow
  // function on every render, and we don't want the effect below to re-run
  // (and move the focus back to the first field) on every key press.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('modal-open'); // stop the page behind from scrolling

    // Put the keyboard focus inside the dialog (first field, or the dialog itself)
    const first = dialogRef.current?.querySelector('input, select, textarea, button:not(.modal-close)');
    (first || dialogRef.current)?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('modal-open');
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCloseRef.current()}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={dialogRef} tabIndex={-1}>
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-button modal-close" onClick={onClose} aria-label="Close">
            <FiX />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
