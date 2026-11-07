// src/components/LoadingSpinner.jsx
// A spinning circle with an optional label. `fullPage` centres it on the screen
// (used while the app checks whether the user is still logged in).
export default function LoadingSpinner({ label = 'Loading...', fullPage = false, small = false }) {
  return (
    <div className={`spinner-wrap${fullPage ? ' spinner-full' : ''}`} role="status">
      <span className={`spinner${small ? ' spinner-small' : ''}`} aria-hidden="true" />
      {label && <span className="spinner-label">{label}</span>}
    </div>
  );
}
