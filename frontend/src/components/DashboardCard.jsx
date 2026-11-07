// src/components/DashboardCard.jsx
// One number on a dashboard: icon, label, value and an optional hint line.
// `tone` picks the colour of the icon: blue, green, amber, red, slate, violet.
// If `to` is given the whole card is a link (e.g. to the filtered list).
import { Link } from 'react-router-dom';

export default function DashboardCard({ label, value, icon: Icon, tone = 'blue', hint, to }) {
  const content = (
    <>
      {Icon && (
        <span className={`card-icon tone-${tone}`} aria-hidden="true">
          <Icon />
        </span>
      )}
      <span className="card-body">
        <span className="card-label">{label}</span>
        <span className="card-value">{value ?? '—'}</span>
        {hint && <span className="card-hint">{hint}</span>}
      </span>
    </>
  );
  return to ? (
    <Link to={to} className="stat-card stat-card-link">
      {content}
    </Link>
  ) : (
    <div className="stat-card">{content}</div>
  );
}
