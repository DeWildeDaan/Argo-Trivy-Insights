import * as React from 'react';

import { downloadBlob, formatTimestampForFilename, slugifyForFilename } from './exportUtils';
import './ReportDashboard.css';
import './SbomReportView.css';
import { buildCycloneDxBom, flattenSbomReports, SbomComponentRow } from './sbomReport';
import { getUrlParam, setUrlParam } from './urlState';

const PAGE_SIZE = 10;

const TYPE_PALETTE = ['#0dadea', '#16a085', '#8e44ad', '#2ecc71', '#f39c12', '#34495e', '#e67e22', '#1abc9c'];

type SortKey = 'name' | 'version' | 'type' | 'resource' | 'license' | 'namespace';
type SortDir = 'asc' | 'desc';

const DEFAULT_SORT_KEY: SortKey = 'name';
const SORT_KEYS: SortKey[] = ['name', 'version', 'type', 'resource', 'license', 'namespace'];

function isValidSortKey(value: string | null): value is SortKey {
  return value !== null && (SORT_KEYS as string[]).includes(value);
}

interface SbomReportViewProps {
  reports: unknown[];
  appName: string;
  showScope?: boolean;
  urlKey?: string;
}

function colorForValue(value: string, values: string[]): string {
  const index = Math.max(0, values.indexOf(value));
  return TYPE_PALETTE[index % TYPE_PALETTE.length];
}

function compareRows(a: SbomComponentRow, b: SbomComponentRow, key: SortKey): number {
  const av = (key === 'license' ? a.licenses[0] ?? '' : a[key] ?? '').toString().toLowerCase();
  const bv = (key === 'license' ? b.licenses[0] ?? '' : b[key] ?? '').toString().toLowerCase();
  return av.localeCompare(bv);
}

function rowKey(row: SbomComponentRow, index: number): string {
  return `${row.id}-${row.resource}-${index}`;
}

export const SbomReportView: React.FC<SbomReportViewProps> = ({
  reports,
  appName,
  showScope = false,
  urlKey = 'sbom',
}) => {
  const allRows = React.useMemo(() => flattenSbomReports(reports), [reports]);

  const types = React.useMemo(() => Array.from(new Set(allRows.map((row) => row.type))).sort(), [allRows]);
  const namespaces = React.useMemo(
    () => Array.from(new Set(allRows.map((row) => row.namespace).filter((v): v is string => !!v))).sort(),
    [allRows]
  );

  const [typeFilter, setTypeFilter] = React.useState(() => {
    const value = getUrlParam(`${urlKey}-type`);
    return value && types.includes(value) ? value : 'all';
  });
  const [namespaceFilter, setNamespaceFilter] = React.useState(() => {
    const value = getUrlParam(`${urlKey}-namespace`);
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
    const value = getUrlParam(`${urlKey}-resource`);
    return value && resources.includes(value) ? value : 'all';
  });
  const [search, setSearch] = React.useState(() => getUrlParam(`${urlKey}-search`) ?? '');
  const [sortKey, setSortKey] = React.useState<SortKey>(() => {
    const value = getUrlParam(`${urlKey}-sort`);
    return isValidSortKey(value) ? value : DEFAULT_SORT_KEY;
  });
  const [sortDir, setSortDir] = React.useState<SortDir>(() =>
    getUrlParam(`${urlKey}-dir`) === 'desc' ? 'desc' : 'asc'
  );
  const [page, setPage] = React.useState(0);

  React.useEffect(() => {
    setPage(0);
  }, [resourceFilter, typeFilter, namespaceFilter, search]);

  React.useEffect(() => {
    setUrlParam(`${urlKey}-search`, search || null);
  }, [search, urlKey]);

  React.useEffect(() => {
    setUrlParam(`${urlKey}-resource`, resourceFilter === 'all' ? null : resourceFilter);
  }, [resourceFilter, urlKey]);

  React.useEffect(() => {
    setUrlParam(`${urlKey}-type`, typeFilter === 'all' ? null : typeFilter);
  }, [typeFilter, urlKey]);

  React.useEffect(() => {
    setUrlParam(`${urlKey}-namespace`, namespaceFilter === 'all' ? null : namespaceFilter);
  }, [namespaceFilter, urlKey]);

  React.useEffect(() => {
    setUrlParam(`${urlKey}-sort`, sortKey === DEFAULT_SORT_KEY ? null : sortKey);
  }, [sortKey, urlKey]);

  React.useEffect(() => {
    setUrlParam(`${urlKey}-dir`, sortDir === 'asc' ? null : sortDir);
  }, [sortDir, urlKey]);

  React.useEffect(() => {
    if (namespaceFilter !== 'all' && !namespaces.includes(namespaceFilter)) {
      setNamespaceFilter('all');
    }
  }, [namespaces, namespaceFilter]);

  React.useEffect(() => {
    if (resourceFilter !== 'all' && !resources.includes(resourceFilter)) {
      setResourceFilter('all');
    }
  }, [resources, resourceFilter]);

  const scopedRows = React.useMemo(
    () => (resourceFilter === 'all' ? namespaceScopedRows : namespaceScopedRows.filter((row) => row.resource === resourceFilter)),
    [namespaceScopedRows, resourceFilter]
  );

  const typeScopedRows = React.useMemo(
    () => (typeFilter === 'all' ? scopedRows : scopedRows.filter((row) => row.type === typeFilter)),
    [scopedRows, typeFilter]
  );

  const searchedRows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return typeScopedRows;
    }
    return typeScopedRows.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        row.resource.toLowerCase().includes(needle) ||
        row.type.toLowerCase().includes(needle) ||
        row.version.toLowerCase().includes(needle) ||
        (row.purl ?? '').toLowerCase().includes(needle) ||
        (row.namespace ?? '').toLowerCase().includes(needle) ||
        row.licenses.some((license) => license.toLowerCase().includes(needle))
    );
  }, [typeScopedRows, search]);

  const typeCounts = React.useMemo(() => {
    const result: Record<string, number> = {};
    for (const row of searchedRows) {
      result[row.type] = (result[row.type] ?? 0) + 1;
    }
    return result;
  }, [searchedRows]);

  const stats = React.useMemo(() => {
    const uniqueLicenses = new Set<string>();
    const uniqueResources = new Set<string>();
    for (const row of searchedRows) {
      row.licenses.forEach((license) => uniqueLicenses.add(license));
      uniqueResources.add(row.resource);
    }
    return {
      total: searchedRows.length,
      types: Object.keys(typeCounts).length,
      licenses: uniqueLicenses.size,
      resources: uniqueResources.size,
    };
  }, [searchedRows, typeCounts]);

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
    const bom = buildCycloneDxBom(sortedRows, appName);
    const blob = new Blob([JSON.stringify(bom, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${slugifyForFilename(appName)}-sbom-${formatTimestampForFilename(new Date())}.json`);
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
    { key: 'name', label: 'Component' },
    ...(showScope ? ([{ key: 'namespace', label: 'Namespace' }] as Array<{ key: SortKey; label: string }>) : []),
    { key: 'resource', label: 'Resource' },
    { key: 'version', label: 'Version' },
    { key: 'type', label: 'Type' },
    { key: 'license', label: 'License' },
  ];

  return (
    <div className="rd-dashboard">
      <div className="sbom-cards">
        <div className="rd-card">
          <span className="rd-card-icon sbom-card-icon--total">
            <i className="fas fa-cubes" />
          </span>
          <div>
            <div className="rd-card-label">COMPONENTS</div>
            <div className="rd-card-count">{stats.total}</div>
          </div>
        </div>
        <div className="rd-card">
          <span className="rd-card-icon sbom-card-icon--types">
            <i className="fas fa-layer-group" />
          </span>
          <div>
            <div className="rd-card-label">TYPES</div>
            <div className="rd-card-count">{stats.types}</div>
          </div>
        </div>
        <div className="rd-card">
          <span className="rd-card-icon sbom-card-icon--licenses">
            <i className="fas fa-file-contract" />
          </span>
          <div>
            <div className="rd-card-label">LICENSES</div>
            <div className="rd-card-count">{stats.licenses}</div>
          </div>
        </div>
        <div className="rd-card">
          <span className="rd-card-icon sbom-card-icon--resources">
            <i className="fas fa-server" />
          </span>
          <div>
            <div className="rd-card-label">RESOURCES</div>
            <div className="rd-card-count">{stats.resources}</div>
          </div>
        </div>
      </div>

      <div className="rd-toolbar">
        <div className="rd-search-wrap">
          <input
            className="rd-search"
            type="text"
            placeholder="Filter by component, version, license or purl..."
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
        {showScope && (
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
        <select className="rd-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <button
          className="rd-export-btn"
          disabled={sortedRows.length === 0}
          onClick={handleExport}
          title="Export the filtered components below as a CycloneDX SBOM"
        >
          <i className="fas fa-download" />
          Export SBOM
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
                <th
                  key={col.key}
                  aria-sort={col.key !== sortKey ? 'none' : sortDir === 'asc' ? 'ascending' : 'descending'}
                >
                  <button type="button" className="rd-th-btn" onClick={() => toggleSort(col.key)}>
                    {col.label} {sortIndicator(col.key)}
                  </button>
                </th>
              ))}
              <th>
                <span className="rd-th-btn rd-th-btn--static">Package URL</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td className="rd-empty" colSpan={columns.length + 1}>
                  No components match your filters.
                </td>
              </tr>
            )}
            {pageRows.map((row, index) => (
              <tr key={rowKey(row, index)}>
                <td>{row.name}</td>
                {showScope && <td>{row.namespace ?? '-'}</td>}
                <td>{row.resource}</td>
                <td>{row.version}</td>
                <td>
                  <span className="rd-badge" style={{ backgroundColor: colorForValue(row.type, types) }}>
                    {row.type}
                  </span>
                </td>
                <td>
                  {row.licenses.length > 0 ? (
                    row.licenses.map((license) => (
                      <span key={license} className="rd-pill sbom-license-pill">
                        {license}
                      </span>
                    ))
                  ) : (
                    <em className="rd-muted">Not specified</em>
                  )}
                </td>
                <td className="sbom-purl">{row.purl ? row.purl : <em className="rd-muted">Not available</em>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
