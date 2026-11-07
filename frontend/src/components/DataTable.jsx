// src/components/DataTable.jsx
// A reusable table.
//
//   <DataTable
//     columns={[
//       { key: 'name', header: 'Name' },                                   // shows row.name
//       { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
//     ]}
//     rows={employees}
//     rowKey="employee_id"
//     loading={loading}
//     emptyTitle="No employees found"
//   />
//
// On small screens the table scrolls sideways inside its card, so the page
// itself never scrolls horizontally.

import EmptyState from './EmptyState';
import LoadingSpinner from './LoadingSpinner';

export default function DataTable({ columns, rows, rowKey, loading = false, emptyTitle = 'No records found', emptyMessage, caption }) {
  const hasRows = Array.isArray(rows) && rows.length > 0;

  if (!hasRows) {
    return loading ? <LoadingSpinner /> : <EmptyState title={emptyTitle} message={emptyMessage} />;
  }

  return (
    <div className={`table-wrap${loading ? ' is-reloading' : ''}`}>
      <table className="data-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.className}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[rowKey]}>
              {columns.map((column) => (
                <td key={column.key} className={column.className} data-label={column.header}>
                  {column.render ? column.render(row) : row[column.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
