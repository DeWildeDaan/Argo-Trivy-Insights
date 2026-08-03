import * as React from 'react';

import { ChecksRow, flattenChecksReports } from './checksReport';
import { ReportCleanState, ReportDashboard, ReportDashboardColumn } from './ReportDashboard';

interface ChecksReportViewProps {
  reports: unknown[];
  searchPlaceholder: string;
  emptyMessage: string;
  cleanMessage: string;
  distributionLabel: string;
  exportFileLabel: string;
  showScope?: boolean;
}

function buildColumns(showScope: boolean): Array<ReportDashboardColumn<ChecksRow>> {
  const columns: Array<ReportDashboardColumn<ChecksRow>> = [
    { key: 'id', label: 'Check ID', render: (row) => row.id },
  ];

  if (showScope) {
    columns.push({ key: 'namespace', label: 'Namespace', render: (row) => row.namespace ?? '-' });
  }

  columns.push({ key: 'resource', label: 'Resource', render: (row) => row.resource });

  columns.push(
    { key: 'title', label: 'Title', render: (row) => row.title ?? <em className="rd-muted">Not available</em> },
    {
      key: 'category',
      label: 'Category',
      render: (row) => (row.category ? <span className="rd-pill">{row.category}</span> : '-'),
    },
    {
      key: 'severity',
      label: 'Severity',
      render: (row) => <span className={`rd-badge rd-badge--${row.severity.toLowerCase()}`}>{row.severity}</span>,
    }
  );

  return columns;
}

function rowKey(row: ChecksRow, index: number): string {
  return `${row.id}-${row.resource}-${index}`;
}

function searchPredicate(row: ChecksRow, needle: string): boolean {
  return (
    row.id.toLowerCase().includes(needle) ||
    row.resource.toLowerCase().includes(needle) ||
    row.severity.toLowerCase().includes(needle) ||
    (row.category ?? '').toLowerCase().includes(needle) ||
    (row.title ?? '').toLowerCase().includes(needle) ||
    (row.namespace ?? '').toLowerCase().includes(needle)
  );
}

export const ChecksReportView: React.FC<ChecksReportViewProps> = ({
  reports,
  searchPlaceholder,
  emptyMessage,
  cleanMessage,
  distributionLabel,
  exportFileLabel,
  showScope = false,
}) => {
  const rows = React.useMemo(() => flattenChecksReports(reports), [reports]);
  const columns = React.useMemo(() => buildColumns(showScope), [showScope]);
  const [flyoutRow, setFlyoutRow] = React.useState<ChecksRow | null>(null);
  const [flyoutOpen, setFlyoutOpen] = React.useState(false);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const flyoutRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);

  const openFlyout = (row: ChecksRow) => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    setFlyoutRow(row);
    setFlyoutOpen(true);
  };

  const closeFlyout = () => setFlyoutOpen(false);

  React.useEffect(() => {
    if (flyoutOpen) {
      closeButtonRef.current?.focus();
    } else {
      triggerRef.current?.focus();
    }
  }, [flyoutOpen]);

  React.useEffect(() => {
    if (!flyoutOpen) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeFlyout();
        return;
      }
      if (e.key === 'Tab' && flyoutRef.current) {
        const focusable = flyoutRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) {
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flyoutOpen]);

  if (rows.length === 0) {
    return <ReportCleanState message={cleanMessage} />;
  }

  return (
    <>
      <ReportDashboard
        rows={rows}
        columns={columns}
        rowKey={rowKey}
        searchPlaceholder={searchPlaceholder}
        searchPredicate={searchPredicate}
        defaultSortKey="severity"
        emptyMessage={emptyMessage}
        distributionLabel={distributionLabel}
        onRowClick={openFlyout}
        exportFileLabel={exportFileLabel}
        showNamespaceFilter={showScope}
      />
      <div
        className={`rd-flyout-overlay${flyoutOpen ? ' rd-flyout-overlay--open' : ''}`}
        onClick={closeFlyout}
      />
      <div
        ref={flyoutRef}
        className={`rd-flyout${flyoutOpen ? ' rd-flyout--open' : ''}${
          flyoutRow ? ` rd-flyout--${flyoutRow.severity.toLowerCase()}` : ''
        }`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!flyoutOpen}
        aria-labelledby="rd-flyout-title"
      >
        <button className="rd-flyout-close" ref={closeButtonRef} onClick={closeFlyout} aria-label="Close">
          <i className="fa fa-times" />
        </button>
        {flyoutRow && (
          <>
            <div className="rd-flyout-header">
              {flyoutRow.title && flyoutRow.title !== flyoutRow.id && (
                <div className="rd-flyout-eyebrow">{flyoutRow.id}</div>
              )}
              <h4 id="rd-flyout-title">{flyoutRow.title ?? flyoutRow.id}</h4>
              <div className="rd-flyout-meta">
                <span className={`rd-badge rd-badge--${flyoutRow.severity.toLowerCase()}`}>
                  {flyoutRow.severity}
                </span>
                {flyoutRow.category && (
                  <span className="rd-pill">
                    <i className="fas fa-tag" />
                    {flyoutRow.category}
                  </span>
                )}
                <span className="rd-pill">
                  <i className="fas fa-cube" />
                  {flyoutRow.resource}
                </span>
                {showScope && flyoutRow.namespace && (
                  <span className="rd-pill">
                    <i className="fas fa-layer-group" />
                    {flyoutRow.namespace}
                  </span>
                )}
              </div>
            </div>
            <div className="rd-flyout-body">
              <div className="rd-flyout-section">
                <h6>
                  <i className="fas fa-align-left" />
                  Description
                </h6>
                <p>{flyoutRow.description ?? <em className="rd-muted">Not available</em>}</p>
              </div>
              <div className="rd-flyout-section rd-flyout-section--messages">
                <h6>
                  <i className="fas fa-terminal" />
                  Messages
                </h6>
                {flyoutRow.messages && flyoutRow.messages.length > 0 ? (
                  <ul>
                    {flyoutRow.messages.map((message, index) => (
                      <li key={index}>{message}</li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    <em className="rd-muted">Not available</em>
                  </p>
                )}
              </div>
              <div className="rd-flyout-section rd-flyout-section--remediation">
                <h6>
                  <i className="fas fa-wrench" />
                  Remediation
                </h6>
                <p>{flyoutRow.remediation ?? <em className="rd-muted">Not available</em>}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
};
