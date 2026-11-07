// src/components/ErrorMessage.jsx
// A red box with an error message and an optional "Try again" button.
import { FiAlertTriangle } from 'react-icons/fi';

export default function ErrorMessage({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="alert alert-error" role="alert">
      <FiAlertTriangle aria-hidden="true" />
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-small btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
