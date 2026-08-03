import * as React from 'react';

import { ExposedSecretRow, flattenExposedSecretReports } from './exposedSecretReport';
import { ReportCleanState, ReportDashboard, ReportDashboardColumn } from './ReportDashboard';

interface ExposedSecretReportViewProps {
  reports: unknown[];
  showScope?: boolean;
  cleanMessage?: string;
  exportFileLabel?: string;
}

function buildColumns(showScope: boolean): Array<ReportDashboardColumn<ExposedSecretRow>> {
  const columns: Array<ReportDashboardColumn<ExposedSecretRow>> = [
    { key: 'id', label: 'Rule ID', render: (row) => row.id },
  ];

  if (showScope) {
    columns.push({ key: 'namespace', label: 'Namespace', render: (row) => row.namespace ?? '-' });
  }

  columns.push({ key: 'resource', label: 'Resource', render: (row) => row.resource });

  columns.push(
    { key: 'title', label: 'Title', render: (row) => row.title ?? <em className="rd-muted">Not available</em> },
    { key: 'category', label: 'Category', render: (row) => (row.category ? <span className="rd-pill">{row.category}</span> : '-') },
    {
      key: 'severity',
      label: 'Severity',
      render: (row) => <span className={`rd-badge rd-badge--${row.severity.toLowerCase()}`}>{row.severity}</span>,
    },
    { key: 'target', label: 'Target', render: (row) => row.target ?? <em className="rd-muted">Not available</em> }
  );

  return columns;
}

function rowKey(row: ExposedSecretRow, index: number): string {
  return `${row.id}-${row.resource}-${row.target}-${index}`;
}

function searchPredicate(row: ExposedSecretRow, needle: string): boolean {
  return (
    row.id.toLowerCase().includes(needle) ||
    row.resource.toLowerCase().includes(needle) ||
    row.severity.toLowerCase().includes(needle) ||
    (row.category ?? '').toLowerCase().includes(needle) ||
    (row.title ?? '').toLowerCase().includes(needle) ||
    (row.target ?? '').toLowerCase().includes(needle) ||
    (row.namespace ?? '').toLowerCase().includes(needle)
  );
}

export const ExposedSecretReportView: React.FC<ExposedSecretReportViewProps> = ({
  reports,
  showScope = false,
  cleanMessage = 'No exposed secrets found for this application.',
  exportFileLabel = 'exposed-secrets',
}) => {
  const rows = React.useMemo(() => flattenExposedSecretReports(reports), [reports]);
  const columns = React.useMemo(() => buildColumns(showScope), [showScope]);

  if (rows.length === 0) {
    return <ReportCleanState message={cleanMessage} />;
  }

  return (
    <ReportDashboard
      rows={rows}
      columns={columns}
      rowKey={rowKey}
      searchPlaceholder="Filter by rule, resource, category or target..."
      searchPredicate={searchPredicate}
      defaultSortKey="severity"
      emptyMessage="No exposed secrets match your filters."
      distributionLabel="Exposed Secret Distribution"
      exportFileLabel={exportFileLabel}
      showNamespaceFilter={showScope}
    />
  );
};
