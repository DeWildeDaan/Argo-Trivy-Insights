import * as React from 'react';

import { downloadBlob, formatTimestampForFilename, slugifyForFilename, toCsv } from './exportUtils';
import './ReportDashboard.css';
import { SEVERITIES, SEVERITY_ICON, severityRank } from './trivyReport';
import { getUrlParam, setUrlParam } from './urlState';

const PAGE_SIZE = 10;

export interface ReportDashboardRow {
  id: string;
  resource: string;
  severity: string;
  namespace?: string;
  application?: string;
}

export const ReportCleanState: React.FC<{ message: string }> = ({ message }) => (
  <div className="rd-clean-state">
    <div className="rd-clean-state-icon">
      <i className="fas fa-check-circle" />
    </div>
    <p>{message}</p>
  </div>
);

export interface ReportDashboardColumn<T> {
  key: string;
  label: string;
  sortValue?: (row: T) => string | number;
  csvValue?: (row: T) => string;
  render: (row: T) => React.ReactNode;
}

interface ReportDashboardProps<T extends ReportDashboardRow> {
  rows: T[];
  columns: Array<ReportDashboardColumn<T>>;
  rowKey: (row: T, index: number) => string;
  searchPlaceholder: string;
  searchPredicate: (row: T, needle: string) => boolean;
  defaultSortKey: string;
  emptyMessage: string;
  distributionLabel: string;
  onRowClick?: (row: T) => void;
  exportFileLabel?: string;
  showNamespaceFilter?: boolean;
}

export function ReportDashboard<T extends ReportDashboardRow>({
  rows: allRows,
  columns,
  rowKey,
  searchPlaceholder,
  searchPredicate,
  defaultSortKey,
  emptyMessage,
  distributionLabel,
  onRowClick,
  exportFileLabel,
  showNamespaceFilter = false,
}: ReportDashboardProps<T>) {
  const namespaces = React.useMemo(
    () => Array.from(new Set(allRows.map((row) => row.namespace).filter((v): v is string => !!v))).sort(),
    [allRows]
  );

  // exportFileLabel is already a unique, stable identifier per report view
  // (e.g. "vulnerabilities", "config-audit-checks") - reuse it as the prefix
  // for deep-linked filter/sort query params so multiple dashboards don't
  // clash.
  const urlKey = exportFileLabel;

  const isValidSortKey = (key: string | null): key is string =>
    key !== null && (key === 'severity' || columns.some((col) => col.key === key));

  const [namespaceFilter, setNamespaceFilter] = React.useState(() => {
    const value = urlKey ? getUrlParam(`${urlKey}-namespace`) : null;
    return value && namespaces.includes(value) ? value : 'all';
  });

  const namespaceScopedRows = React.useMemo(
    () => (namespaceFilter === 'all' ? allRows : allRows.filter((row) => row.namespace === namespaceFilter)),
    [allRows, namespaceFilter]
  );

  // Scoped to the selected namespace so picking a namespace narrows which
  // resources show up as options here too.
  const resources = React.useMemo(
    () => Array.from(new Set(namespaceScopedRows.map((row) => row.resource))).sort(),
    [namespaceScopedRows]
  );

  const [resourceFilter, setResourceFilter] = React.useState(() => {
    const value = urlKey ? getUrlParam(`${urlKey}-resource`) : null;
    return value && resources.includes(value) ? value : 'all';
  });
  const [severityFilter, setSeverityFilter] = React.useState(() => {
    const value = urlKey ? getUrlParam(`${urlKey}-severity`) : null;
    return value && (SEVERITIES as readonly string[]).includes(value) ? value : 'all';
  });
  const [search, setSearch] = React.useState(() => (urlKey ? getUrlParam(`${urlKey}-search`) ?? '' : ''));
  const [sortKey, setSortKey] = React.useState(() => {
    const value = urlKey ? getUrlParam(`${urlKey}-sort`) : null;
    return isValidSortKey(value) ? value : defaultSortKey;
  });
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>(() => {
    const value = urlKey ? getUrlParam(`${urlKey}-dir`) : null;
    return value === 'desc' ? 'desc' : 'asc';
  });
  const [page, setPage] = React.useState(0);
  const [resourceFilterResetNotice, setResourceFilterResetNotice] = React.useState(false);

  React.useEffect(() => {
    setPage(0);
  }, [namespaceFilter, resourceFilter, severityFilter, search]);

  React.useEffect(() => {
    if (resourceFilter !== 'all' && !resources.includes(resourceFilter)) {
      setResourceFilter('all');
      setResourceFilterResetNotice(true);
    }
  }, [resources, resourceFilter]);

  React.useEffect(() => {
    if (namespaceFilter !== 'all' && !namespaces.includes(namespaceFilter)) {
      setNamespaceFilter('all');
    }
  }, [namespaces, namespaceFilter]);

  React.useEffect(() => {
    if (!resourceFilterResetNotice) {
      return;
    }
    const timer = setTimeout(() => setResourceFilterResetNotice(false), 5000);
    return () => clearTimeout(timer);
  }, [resourceFilterResetNotice]);

  React.useEffect(() => {
    if (!urlKey) return;
    setUrlParam(`${urlKey}-search`, search || null);
  }, [search, urlKey]);

  React.useEffect(() => {
    if (!urlKey) return;
    setUrlParam(`${urlKey}-resource`, resourceFilter === 'all' ? null : resourceFilter);
  }, [resourceFilter, urlKey]);

  React.useEffect(() => {
    if (!urlKey) return;
    setUrlParam(`${urlKey}-namespace`, namespaceFilter === 'all' ? null : namespaceFilter);
  }, [namespaceFilter, urlKey]);

  React.useEffect(() => {
    if (!urlKey) return;
    setUrlParam(`${urlKey}-severity`, severityFilter === 'all' ? null : severityFilter);
  }, [severityFilter, urlKey]);

  React.useEffect(() => {
    if (!urlKey) return;
    setUrlParam(`${urlKey}-sort`, sortKey === defaultSortKey ? null : sortKey);
  }, [sortKey, urlKey, defaultSortKey]);

  React.useEffect(() => {
    if (!urlKey) return;
    setUrlParam(`${urlKey}-dir`, sortDir === 'asc' ? null : sortDir);
  }, [sortDir, urlKey]);

  const scopedRows = React.useMemo(
    () =>
      resourceFilter === 'all' ? namespaceScopedRows : namespaceScopedRows.filter((row) => row.resource === resourceFilter),
    [namespaceScopedRows, resourceFilter]
  );

  const severityScopedRows = React.useMemo(
    () => (severityFilter === 'all' ? scopedRows : scopedRows.filter((row) => row.severity === severityFilter)),
    [scopedRows, severityFilter]
  );

  const searchedRows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return severityScopedRows;
    }
    return severityScopedRows.filter((row) => searchPredicate(row, needle));
  }, [severityScopedRows, search, searchPredicate]);

  const counts = React.useMemo(() => {
    const result: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    for (const row of searchedRows) {
      if (row.severity in result) {
        result[row.severity] += 1;
      } else {
        result.UNKNOWN += 1;
      }
    }
    return result;
  }, [searchedRows]);

  const compareRows = React.useCallback(
    (a: T, b: T): number => {
      if (sortKey === 'severity') {
        return severityRank(a.severity) - severityRank(b.severity);
      }
      const column = columns.find((col) => col.key === sortKey);
      if (column?.sortValue) {
        const av = column.sortValue(a);
        const bv = column.sortValue(b);
        if (typeof av === 'number' && typeof bv === 'number') {
          return av - bv;
        }
        return av.toString().toLowerCase().localeCompare(bv.toString().toLowerCase());
      }
      const av = ((a as any)[sortKey] ?? '').toString().toLowerCase();
      const bv = ((b as any)[sortKey] ?? '').toString().toLowerCase();
      return av.localeCompare(bv);
    },
    [columns, sortKey]
  );

  const sortedRows = React.useMemo(() => {
    const sorted = [...searchedRows].sort(compareRows);
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [searchedRows, compareRows, sortDir]);

  const total = sortedRows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const rangeStart = total === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, rangeStart + PAGE_SIZE - 1);
  const pageRows = sortedRows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const toggleSort = (key: string) => {
    if (key !== sortKey) {
      setSortKey(key);
      setSortDir('asc');
      return;
    }
    if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortKey(defaultSortKey);
      setSortDir('asc');
    }
  };

  const sortIndicator = (key: string) => {
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

  const scopedTotal = searchedRows.length || 1;

  const sortedSeverities = React.useMemo(
    () => [...SEVERITIES].sort((a, b) => counts[b] - counts[a]),
    [counts]
  );

  const cellToCsvValue = (col: ReportDashboardColumn<T>, row: T): string => {
    if (col.csvValue) {
      return col.csvValue(row);
    }
    if (col.sortValue) {
      return String(col.sortValue(row));
    }
    const raw = (row as any)[col.key];
    return raw === undefined || raw === null ? '' : String(raw);
  };

  const handleExportCsv = () => {
    const headers = columns.map((col) => col.label);
    const rows = sortedRows.map((row) => columns.map((col) => cellToCsvValue(col, row)));
    const csv = toCsv(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const label = slugifyForFilename(exportFileLabel ?? 'report');
    downloadBlob(blob, `${label}-${formatTimestampForFilename(new Date())}.csv`);
  };

  return (
    <div className="rd-dashboard">
      <div className="rd-cards">
        {SEVERITIES.map((severity) => (
          <div key={severity} className={`rd-card rd-card--${severity.toLowerCase()}`}>
            <span className={`rd-card-icon rd-card-icon--${severity.toLowerCase()}`}>
              <i className={SEVERITY_ICON[severity]} />
            </span>
            <div>
              <div className="rd-card-label">{severity}</div>
              <div className="rd-card-count">{counts[severity]}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rd-panel">
        <h5>{distributionLabel}</h5>
        <div className="rd-distribution-bar">
          {sortedSeverities.map((severity) =>
            counts[severity] > 0 ? (
              <div
                key={severity}
                className={`rd-distribution-segment rd-distribution-segment--${severity.toLowerCase()}`}
                style={{ flexGrow: counts[severity], flexBasis: 0 }}
              >
                <span className="rd-distribution-value-wrap">
                  <span className="rd-distribution-value">
                    {Math.round((counts[severity] / scopedTotal) * 100)}%
                  </span>
                </span>
                <span className="rd-distribution-tooltip">{severity}</span>
              </div>
            ) : null
          )}
        </div>
      </div>

      <div className="rd-toolbar">
        <div className="rd-search-wrap">
          <input
            className="rd-search"
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="rd-search-clear"
              aria-label="Clear search"
              onClick={() => setSearch('')}
            >
              ×
            </button>
          )}
        </div>
        {showNamespaceFilter && (
          <select
            className="rd-select"
            value={namespaceFilter}
            onChange={(e) => setNamespaceFilter(e.target.value)}
          >
            <option value="all">All Namespaces</option>
            {namespaces.map((namespace) => (
              <option key={namespace} value={namespace}>
                {namespace}
              </option>
            ))}
          </select>
        )}
        <select className="rd-select" value={resourceFilter} onChange={(e) => setResourceFilter(e.target.value)}>
          <option value="all">All Resources</option>
          {resources.map((resource) => (
            <option key={resource} value={resource}>
              {resource}
            </option>
          ))}
        </select>
        <select className="rd-select" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
          <option value="all">All Severities</option>
          {SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>
        {exportFileLabel && (
          <button type="button" className="rd-export-btn" onClick={handleExportCsv} disabled={total === 0}>
            <i className="fas fa-download" /> Export CSV
          </button>
        )}
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

      {resourceFilterResetNotice && (
        <p className="rd-filter-notice">
          <i className="fas fa-info-circle" /> Resource filter reset — previous selection no longer present.
        </p>
      )}

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
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td className="rd-empty" colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            )}
            {pageRows.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                className={onRowClick ? 'rd-row-clickable' : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key}>{col.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
