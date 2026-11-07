// src/context/ToastContext.jsx
// Small pop-up messages in the corner ("Task created", "Could not save...").
// Usage in any component:
//   const toast = useToast();
//   toast.success('Saved');   toast.error('Something went wrong');

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { FiAlertCircle, FiCheckCircle, FiX } from 'react-icons/fi';

const ToastContext = createContext(null);
const TOAST_DURATION_MS = 4000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);

  const show = useCallback(
    (type, message) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, type, message }]); // keep at most 4
      setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({ success: (message) => show('success', message), error: (message) => show('error', message) }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.type === 'success' ? <FiCheckCircle aria-hidden="true" /> : <FiAlertCircle aria-hidden="true" />}
            <span>{toast.message}</span>
            <button type="button" className="icon-button" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              <FiX />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
