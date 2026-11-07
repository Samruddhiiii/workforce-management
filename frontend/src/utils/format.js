// src/utils/format.js
// Display helpers. The backend sends dates as plain text:
//   dates      "2026-11-07"
//   times      "09:05:00"
//   timestamps "2026-11-07 09:05:00"
// We split them ourselves instead of `new Date("2026-11-07")`, which would
// treat the date as UTC midnight and can show the previous day.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return String(value);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

// "13:05:00" -> "1:05 PM"
export function formatTime(value) {
  if (!value) return '—';
  const [hours, minutes] = String(value).split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return String(value);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const [date, time] = String(value).split(' ');
  return time ? `${formatDate(date)}, ${formatTime(time)}` : formatDate(date);
}

export function formatHours(value) {
  if (value === null || value === undefined) return '—';
  const totalMinutes = Math.round(Number(value) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
}

// "Rahul Kumar" -> "RK" (avatar placeholder)
export function initials(name) {
  return (
    String(name || '?')
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || '?'
  );
}

// Today's date as YYYY-MM-DD in the browser's time zone (for date inputs)
export function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export const MB = 1024 * 1024;
