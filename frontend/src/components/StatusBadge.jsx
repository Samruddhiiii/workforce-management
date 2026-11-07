// src/components/StatusBadge.jsx
// Coloured pill for statuses and priorities, e.g. <StatusBadge value="Pending" />.
const TONES = {
  Active: 'green', Verified: 'green', Approved: 'green', Completed: 'green', Present: 'green',
  'Checked out': 'green',
  Pending: 'amber', Medium: 'amber', 'Checked in': 'blue',
  'In Progress': 'blue',
  Rejected: 'red', Inactive: 'red', Absent: 'red', High: 'red', Overdue: 'red',
  Low: 'slate', 'Not marked': 'slate',
};

export default function StatusBadge({ value, tone }) {
  if (!value) return <span className="muted">—</span>;
  return <span className={`badge badge-${tone || TONES[value] || 'slate'}`}>{value}</span>;
}
