import * as React from 'react';

import { ComplianceControlRow, ComplianceInstance, flattenClusterComplianceReports } from './clusterComplianceReport';
import { downloadBlob, formatTimestampForFilename, slugifyForFilename, toCsv } from './exportUtils';
import './ReportDashboard.css';
import './ClusterComplianceReportView.css';
import { ReportCleanState, SeverityLegend } from './ReportDashboard';
import { SEVERITIES, Severity, severityRank } from './trivyReport';
import { getUrlParam, setUrlParam } from './urlState';

const PAGE_SIZE = 10;

type SortKey = 'id' | 'name' | 'severity' | 'status';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'fail' | 'pass' | 'manual';

const DEFAULT_SORT_KEY: SortKey = 'id';
const SORT_KEYS: SortKey[] = ['id', 'name', 'severity', 'status'];

const STATUS_LABEL: Record<ComplianceControlRow['status'], string> = {
  pass: 'Pass',
  fail: 'Fail',
  manual: 'Manual',
};

const STATUS_ICON: Record<ComplianceControlRow['status'], string> = {
  pass: 'fas fa-check-circle',
  fail: 'fas fa-times-circle',
  manual: 'fas fa-hand-paper',
};

function isValidSortKey(value: string | null): value is SortKey {
  return value !== null && (SORT_KEYS as string[]).includes(value);
}

function isValidStatusFilter(value: string | null): value is StatusFilter {
  return value === 'all' || value === 'fail' || value === 'pass' || value === 'manual';
}

function compareRows(a: ComplianceControlRow, b: ComplianceControlRow, key: SortKey): number {
  if (key === 'severity') {
    return severityRank(a.severity) - severityRank(b.severity);
  }
  const av = a[key].toString().toLowerCase();
  const bv = b[key].toString().toLowerCase();
  return av.localeCompare(bv);
}

interface ClusterComplianceReportViewProps {
  reports: unknown[];
  urlKey?: string;
}

export const ClusterComplianceReportView: React.FC<ClusterComplianceReportViewProps> = ({
  reports,
  urlKey = 'compliance',
}) => {
  const instances = React.useMemo(() => flattenClusterComplianceReports(reports), [reports]);

  const [typeId, setTypeId] = React.useState(() => getUrlParam(`${urlKey}-type`) ?? '');
  const [search, setSearch] = React.useState(() => getUrlParam(`${urlKey}-search`) ?? '');
  const [severityFilter, setSeverityFilter] = React.useState(() => getUrlParam(`${urlKey}-severity`) ?? 'all');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>(() => {
    const value = getUrlParam(`${urlKey}-status`);
    return isValidStatusFilter(value) ? value : 'all';
  });
  const [sortKey, setSortKey] = React.useState<SortKey>(() => {
    const value = getUrlParam(`${urlKey}-sort`);
    return isValidSortKey(value) ? value : DEFAULT_SORT_KEY;
  });
  const [sortDir, setSortDir] = React.useState<SortDir>(() =>
    getUrlParam(`${urlKey}-dir`) === 'desc' ? 'desc' : 'asc'
  );
  const [page, setPage] = React.useState(0);
  const [flyoutControl, setFlyoutControl] = React.useState<ComplianceControlRow | null>(null);
  const [flyoutOpen, setFlyoutOpen] = React.useState(false);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const flyoutRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);

  const openFlyout = (control: ComplianceControlRow) => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    setFlyoutControl(control);
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

  const selectedInstance: ComplianceInstance | undefined = React.useMemo(() => {
    if (instances.length === 0) {
      return undefined;
    }
    return instances.find((instance) => instance.typeId === typeId) ?? instances[0];
  }, [instances, typeId]);

  React.useEffect(() => {
    if (selectedInstance && selectedInstance.typeId !== typeId) {
      setTypeId(selectedInstance.typeId);
    }
  }, [selectedInstance, typeId]);

  React.useEffect(() => {
    setUrlParam(`${urlKey}-type`, typeId || null);
  }, [typeId, urlKey]);

  React.useEffect(() => {
    setPage(0);
  }, [typeId, search, severityFilter, statusFilter]);

  React.useEffect(() => {
    setUrlParam(`${urlKey}-search`, search || null);
  }, [search, urlKey]);

  React.useEffect(() => {
    setUrlParam(`${urlKey}-severity`, severityFilter === 'all' ? null : severityFilter);
  }, [severityFilter, urlKey]);

  React.useEffect(() => {
    setUrlParam(`${urlKey}-status`, statusFilter === 'all' ? null : statusFilter);
  }, [statusFilter, urlKey]);

  React.useEffect(() => {
    setUrlParam(`${urlKey}-sort`, sortKey === DEFAULT_SORT_KEY ? null : sortKey);
  }, [sortKey, urlKey]);

  React.useEffect(() => {
    setUrlParam(`${urlKey}-dir`, sortDir === 'asc' ? null : sortDir);
  }, [sortDir, urlKey]);

  const controls = selectedInstance?.controls ?? [];

  const stats = React.useMemo(() => {
    let pass = 0;
    let fail = 0;
    let manual = 0;
    for (const control of controls) {
      if (control.status === 'pass') pass += 1;
      else if (control.status === 'fail') fail += 1;
      else manual += 1;
    }
    const passRate = pass + fail > 0 ? Math.round((pass / (pass + fail)) * 100) : 0;
    return { total: controls.length, pass, fail, manual, passRate };
  }, [controls]);

  const failingSeverityCounts = React.useMemo(() => {
    const counts: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    for (const control of controls) {
      if (control.status === 'fail') {
        counts[control.severity] += 1;
      }
    }
    return counts;
  }, [controls]);

  const statusScopedRows = React.useMemo(
    () => (statusFilter === 'all' ? controls : controls.filter((control) => control.status === statusFilter)),
    [controls, statusFilter]
  );

  const severityScopedRows = React.useMemo(
    () =>
      severityFilter === 'all'
        ? statusScopedRows
        : statusScopedRows.filter((control) => control.severity === severityFilter),
    [statusScopedRows, severityFilter]
  );

  const searchedRows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return severityScopedRows;
    }
    return severityScopedRows.filter(
      (control) =>
        control.id.toLowerCase().includes(needle) ||
        control.name.toLowerCase().includes(needle) ||
        (control.description ?? '').toLowerCase().includes(needle)
    );
  }, [severityScopedRows, search]);

  const sortedRows = React.useMemo(() => {
    const sorted = [...searchedRows].sort((a, b) => compareRows(a, b, sortKey));
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [searchedRows, sortKey, sortDir]);

  const total = sortedRows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const rangeStart = total === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, rangeStart + PAGE_SIZE - 1);
  const pageRows = sortedRows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const handleExport = () => {
    if (!selectedInstance) {
      return;
    }
    const csv = toCsv(
      ['ID', 'Name', 'Severity', 'Status', 'Total Failing Resources', 'Description'],
      sortedRows.map((control) => [
        control.id,
        control.name,
        control.severity,
        control.status,
        control.totalFail !== undefined ? String(control.totalFail) : '',
        control.description ?? '',
      ])
    );
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadBlob(
      blob,
      `${slugifyForFilename(selectedInstance.title)}-compliance-${formatTimestampForFilename(new Date())}.csv`
    );
  };

  const toggleSort = (key: SortKey) => {
    if (key !== sortKey) {
      setSortKey(key);
      setSortDir('asc');
      return;
    }
    if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortKey(DEFAULT_SORT_KEY);
      setSortDir('asc');
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (key !== sortKey) {
      return (
        <span className="rd-sort-icon rd-sort-icon--inactive">
          <i className="fas fa-sort" />
        </span>
      );
    }
    return (
      <span className="rd-sort-icon rd-sort-icon--active">
        <i className={sortDir === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down'} />
      </span>
    );
  };

  const columns: Array<{ key: SortKey; label: string }> = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Control' },
    { key: 'severity', label: 'Severity' },
    { key: 'status', label: 'Status' },
  ];

  if (instances.length === 0) {
    return <ReportCleanState message="No compliance reports found." />;
  }

  return (
    <div className="rd-dashboard">
      <div className="rd-toolbar">
        <select className="rd-select" value={selectedInstance?.typeId ?? ''} onChange={(e) => setTypeId(e.target.value)}>
          {instances.map((instance) => (
            <option key={instance.typeId} value={instance.typeId}>
              {instance.title}
            </option>
          ))}
        </select>
      </div>

      <div className="rd-panel">
        <h5>Compliance Score</h5>
        <div className="rd-cards ccr-stat-cards">
          <div className="rd-card">
            <span className="rd-card-icon ccr-card-icon--pass">
              <i className="fas fa-percentage" />
            </span>
            <div>
              <div className="rd-card-label">Pass Rate</div>
              <div className="rd-card-count">{stats.passRate}%</div>
            </div>
          </div>
          <div className="rd-card">
            <span className="rd-card-icon rd-card-icon--unknown">
              <i className="fas fa-layer-group" />
            </span>
            <div>
              <div className="rd-card-label">Total</div>
              <div className="rd-card-count">{stats.total}</div>
            </div>
          </div>
          <div className="rd-card">
            <span className="rd-card-icon ccr-card-icon--pass">
              <i className="fas fa-check-circle" />
            </span>
            <div>
              <div className="rd-card-label">Passed</div>
              <div className="rd-card-count">{stats.pass}</div>
            </div>
          </div>
          <div className="rd-card">
            <span className="rd-card-icon ccr-card-icon--fail">
              <i className="fas fa-times-circle" />
            </span>
            <div>
              <div className="rd-card-label">Failed</div>
              <div className="rd-card-count">{stats.fail}</div>
            </div>
          </div>
          <div className="rd-card">
            <span className="rd-card-icon ccr-card-icon--manual">
              <i className="fas fa-hand-paper" />
            </span>
            <div>
              <div className="rd-card-label">Manual</div>
              <div className="rd-card-count">{stats.manual}</div>
            </div>
          </div>
        </div>
      </div>

      {stats.fail > 0 && (
        <div className="rd-panel">
          <h5>Failing Controls by Severity</h5>
          <SeverityLegend />
          <div className="rd-distribution-bar">
            {[...SEVERITIES]
              .sort((a, b) => failingSeverityCounts[b] - failingSeverityCounts[a])
              .map((severity) =>
                failingSeverityCounts[severity] > 0 ? (
                  <div
                    key={severity}
                    className={`rd-distribution-segment rd-distribution-segment--${severity.toLowerCase()}`}
                    style={{ flexGrow: failingSeverityCounts[severity], flexBasis: 0 }}
                    tabIndex={0}
                  >
                    <span className="rd-distribution-tooltip">
                      {severity}: {failingSeverityCounts[severity]}
                    </span>
                  </div>
                ) : null
              )}
          </div>
        </div>
      )}

      <div className="rd-toolbar">
        <div className="rd-search-wrap">
          <input
            className="rd-search"
            type="text"
            placeholder="Filter by control ID, name or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="rd-search-clear" aria-label="Clear search" onClick={() => setSearch('')}>
              ×
            </button>
          )}
        </div>
        <select className="rd-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">All Statuses</option>
          <option value="fail">Fail</option>
          <option value="pass">Pass</option>
          <option value="manual">Manual</option>
        </select>
        <select className="rd-select" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
          <option value="all">All Severities</option>
          {SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>
        <button
          className="rd-export-btn"
          disabled={sortedRows.length === 0}
          onClick={handleExport}
          title="Export the filtered controls below as CSV"
        >
          <i className="fas fa-download" />
          Export CSV
        </button>
        <div className="rd-results-info">
          <span>
            Showing {rangeStart}-{rangeEnd} of {total} results
          </span>
          <button className="rd-page-btn" aria-label="First page" disabled={currentPage <= 0} onClick={() => setPage(0)}>
            «
          </button>
          <button
            className="rd-page-btn"
            aria-label="Previous page"
            disabled={currentPage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ‹
          </button>
          <button
            className="rd-page-btn"
            aria-label="Next page"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            ›
          </button>
          <button
            className="rd-page-btn"
            aria-label="Last page"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage(pageCount - 1)}
          >
            »
          </button>
        </div>
      </div>

      <div className="rd-table-card">
        <table className="rd-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} aria-sort={col.key !== sortKey ? 'none' : sortDir === 'asc' ? 'ascending' : 'descending'}>
                  <button type="button" className="rd-th-btn" onClick={() => toggleSort(col.key)}>
                    {col.label} {sortIndicator(col.key)}
                  </button>
                </th>
              ))}
              <th>Failing Resources</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td className="rd-empty" colSpan={columns.length + 1}>
                  No controls match your filters.
                </td>
              </tr>
            )}
            {pageRows.map((control) => (
              <tr key={control.id} className="rd-row-clickable" onClick={() => openFlyout(control)}>
                <td>{control.id}</td>
                <td>{control.name}</td>
                <td>
                  <span className={`rd-badge rd-badge--${control.severity.toLowerCase()}`}>{control.severity}</span>
                </td>
                <td>
                  <span
                    className={`ccr-status-icon ccr-status-icon--${control.status}`}
                    title={STATUS_LABEL[control.status]}
                    aria-label={STATUS_LABEL[control.status]}
                  >
                    <i className={STATUS_ICON[control.status]} />
                  </span>
                </td>
                <td>{control.totalFail !== undefined ? control.totalFail : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rd-flyout-overlay${flyoutOpen ? ' rd-flyout-overlay--open' : ''}`} onClick={closeFlyout} />
      <div
        ref={flyoutRef}
        className={`rd-flyout${flyoutOpen ? ' rd-flyout--open' : ''}${
          flyoutControl ? ` rd-flyout--${flyoutControl.severity.toLowerCase()}` : ''
        }`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!flyoutOpen}
        aria-labelledby="ccr-flyout-title"
      >
        <button className="rd-flyout-close" ref={closeButtonRef} onClick={closeFlyout} aria-label="Close">
          <i className="fa fa-times" />
        </button>
        {flyoutControl && (
          <>
            <div className="rd-flyout-header">
              <div className="rd-flyout-eyebrow">{flyoutControl.id}</div>
              <h4 id="ccr-flyout-title">{flyoutControl.name}</h4>
              <div className="rd-flyout-meta">
                <span className={`rd-badge rd-badge--${flyoutControl.severity.toLowerCase()}`}>
                  {flyoutControl.severity}
                </span>
                <span className={`ccr-status-badge ccr-status-badge--${flyoutControl.status}`}>
                  <i className={STATUS_ICON[flyoutControl.status]} />
                  {STATUS_LABEL[flyoutControl.status]}
                </span>
                {flyoutControl.totalFail !== undefined && (
                  <span className="rd-pill">
                    <i className="fas fa-server" />
                    {flyoutControl.totalFail} failing resource{flyoutControl.totalFail === 1 ? '' : 's'}
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
                <p>{flyoutControl.description ?? <em className="rd-muted">Not available</em>}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
