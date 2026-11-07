// src/components/EmptyState.jsx
// Shown when a list has no items ("No tasks yet").
import { FiInbox } from 'react-icons/fi';

export default function EmptyState({ title = 'Nothing here yet', message, icon: Icon = FiInbox, children }) {
  return (
    <div className="empty-state">
      <Icon className="empty-icon" aria-hidden="true" />
      <p className="empty-title">{title}</p>
      {message && <p className="empty-message">{message}</p>}
      {children}
    </div>
  );
}
