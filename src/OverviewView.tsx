import * as React from 'react';

import './OverviewView.css';
import './ClusterComplianceReportView.css';
import { REPORT_KINDS } from './reportKinds';
import type { FetchState, ReportKind } from './reportKinds';
import { flattenChecksReports } from './checksReport';
import { flattenClusterComplianceReports } from './clusterComplianceReport';
import { flattenExposedSecretReports } from './exposedSecretReport';
import { ReportCleanState, SeverityLegend } from './ReportDashboard';
import { flattenSbomReports } from './sbomReport';
import { REPORT_KIND_LABEL, Severity, SEVERITIES, SEVERITY_ICON } from './trivyReport';
import { flattenVulnerabilityReports } from './vulnerabilityReport';
import {
  computeAgeBuckets,
  computeFixableSplit,
  computeLicenseBreakdown,
  computeRanked,
  computeResourceRisk,
  computeSeverityCounts,
  RankedEntry,
  ResourceRisk,
} from './overviewStats';

const RESOURCE_LEADERBOARD_LIMIT = 8;
const RANKED_LIST_LIMIT = 5;
const ACCENT = '#00a2b3';
const LICENSE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
const OTHER_COLOR = '#9aa7ae';

// Matches the rd-distribution-segment--*/rd-badge--* hex values in
// ReportDashboard.css - duplicated here because a conic-gradient needs an
// actual color value, not a class name.
const SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: '#e0311f',
  HIGH: '#e9a400',
  MEDIUM: '#6366f1',
  LOW: '#0dadea',
  UNKNOWN: '#9aa7ae',
};

const FINDING_KINDS: ReportKind[] = [
  'VulnerabilityReport',
  'ExposedSecretReport',
  'ConfigAuditReport',
  'RbacAssessmentReport',
];

interface OverviewViewProps {
  byKind: Record<ReportKind, FetchState>;
  visibleKinds: Record<ReportKind, boolean>;
  scopeLabel?: string;
  showScope?: boolean;
}

// Treats a kind still streaming in the same as fully loaded so overview
// stats update live as data arrives instead of waiting for every kind to
// finish.
function dataFor(state: FetchState): unknown[] {
  return state.status === 'loaded' || state.status === 'loading' ? state.data : [];
}

const SeverityBar: React.FC<{ counts: Record<Severity, number> }> = ({ counts }) => (
  <div className="rd-distribution-bar">
    {[...SEVERITIES].sort((a, b) => counts[b] - counts[a]).map((severity) =>
      counts[severity] > 0 ? (
        <div
          key={severity}
          className={`rd-distribution-segment rd-distribution-segment--${severity.toLowerCase()}`}
          style={{ flexGrow: counts[severity], flexBasis: 0 }}
          tabIndex={0}
        >
          <span className="rd-distribution-tooltip">
            {severity}: {counts[severity]}
          </span>
        </div>
      ) : null
    )}
  </div>
);

// Reuses the same clean-state green as ReportCleanState (ReportDashboard.css
// .rd-clean-state-icon) so "all clear" reads consistently whether it's a full
// tab or a small tile inside the dashboard.
const PositiveNote: React.FC<{ message: string }> = ({ message }) => (
  <p className="ov-positive">
    <i className="fas fa-check-circle" />
    {message}
  </p>
);

export interface DonutSegment {
  key: string;
  count: number;
  color: string;
}

export const DonutChart: React.FC<{
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerValue?: React.ReactNode;
  centerLabel?: string;
}> = ({ segments, size = 120, thickness = 18, centerValue, centerLabel }) => {
  const [hoveredKey, setHoveredKey] = React.useState<string | null>(null);
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const labelRadius = size / 2 + 6;

  let cursor = 0;
  const arcs = segments
    .filter((segment) => segment.count > 0 && total > 0)
    .map((segment) => {
      const dash = (segment.count / total) * circumference;
      const offset = (cursor / total) * circumference;
      const midAngleDeg = ((cursor + segment.count / 2) / total) * 360 - 90;
      cursor += segment.count;
      const midAngleRad = (midAngleDeg * Math.PI) / 180;
      return {
        segment,
        dash,
        offset,
        x: size / 2 + labelRadius * Math.cos(midAngleRad),
        y: size / 2 + labelRadius * Math.sin(midAngleRad),
      };
    });

  const hovered = arcs.find((arc) => arc.segment.key === hoveredKey);

  return (
    <div className="ov-donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          style={{ stroke: 'var(--tv-border-soft)' }}
          strokeWidth={thickness}
        />
        {arcs.map(({ segment, dash, offset }) => (
          <circle
            key={segment.key}
            className="ov-donut-arc"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth={thickness}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            tabIndex={0}
            role="img"
            aria-label={`${segment.key}: ${segment.count}`}
            onMouseEnter={() => setHoveredKey(segment.key)}
            onMouseLeave={() => setHoveredKey((prev) => (prev === segment.key ? null : prev))}
            onFocus={() => setHoveredKey(segment.key)}
            onBlur={() => setHoveredKey((prev) => (prev === segment.key ? null : prev))}
            onClick={() => setHoveredKey((prev) => (prev === segment.key ? null : segment.key))}
          />
        ))}
      </svg>
      <div className="ov-donut-hole" style={{ inset: thickness }}>
        {centerValue !== undefined && <div className="ov-donut-value">{centerValue}</div>}
        {centerLabel && <div className="ov-donut-label">{centerLabel}</div>}
      </div>
      {hovered && (
        <div className="ov-donut-tooltip" style={{ left: hovered.x, top: hovered.y }}>
          {hovered.segment.key}: {hovered.segment.count}
        </div>
      )}
    </div>
  );
};

const RankedList: React.FC<{ entries: RankedEntry[]; color?: string }> = ({ entries, color = ACCENT }) => {
  const max = Math.max(...entries.map((entry) => entry.count));
  return (
    <div className="ov-ranked-list">
      {entries.map((entry) => (
        <div key={entry.key} className="ov-ranked-row">
          <span className="ov-ranked-label" tabIndex={0} title={entry.key}>
            {entry.key}
            <span className="ov-label-tooltip">{entry.key}</span>
          </span>
          <span className="ov-ranked-track">
            <span
              className="ov-ranked-bar"
              style={{ width: `${(entry.count / max) * 100}%`, background: color }}
            />
          </span>
          <span className="ov-ranked-count">{entry.count}</span>
        </div>
      ))}
    </div>
  );
};

const ResourceLeaderboard: React.FC<{ rows: ResourceRisk[] }> = ({ rows }) => {
  const top = rows.slice(0, RESOURCE_LEADERBOARD_LIMIT);
  const remaining = rows.length - top.length;
  return (
    <div className="ov-leaderboard">
      {top.map((row) => (
        <div key={row.resource} className="ov-leaderboard-row">
          <span className="ov-leaderboard-label" tabIndex={0} title={row.resource}>
            {row.resource}
            <span className="ov-label-tooltip">{row.resource}</span>
          </span>
          <span className="ov-leaderboard-bar">
            <SeverityBar counts={row.counts} />
          </span>
          <span className="ov-leaderboard-count">{row.total}</span>
        </div>
      ))}
      {remaining > 0 && <p className="rd-muted ov-leaderboard-more">+{remaining} more resources with findings</p>}
    </div>
  );
};

export const OverviewView: React.FC<OverviewViewProps> = ({
  byKind,
  visibleKinds,
  scopeLabel = 'this application',
  showScope = false,
}) => {
  const rows = React.useMemo(
    () => ({
      vuln: flattenVulnerabilityReports(dataFor(byKind.VulnerabilityReport)),
      secret: flattenExposedSecretReports(dataFor(byKind.ExposedSecretReport)),
      config: flattenChecksReports(dataFor(byKind.ConfigAuditReport)),
      rbac: flattenChecksReports(dataFor(byKind.RbacAssessmentReport)),
      sbom: flattenSbomReports(dataFor(byKind.SbomReport)),
      compliance: flattenClusterComplianceReports(dataFor(byKind.ClusterComplianceReport)),
    }),
    [byKind]
  );

  // Blocks the dashboard only until at least one finding kind has produced
  // data. Once the first batch arrives from any kind, the dashboard renders
  // immediately and stats update live as more data arrives, rather than
  // waiting for all kinds to produce initial results.
  const anyKindHasData = FINDING_KINDS.some((kind) => {
    const state = byKind[kind];
    return state.status !== 'idle' && state.status !== 'error' && state.data.length > 0;
  });
  const anyKindLoading = FINDING_KINDS.some((kind) => byKind[kind].status === 'loading' || byKind[kind].status === 'idle');
  const isLoading = !anyKindHasData && anyKindLoading;
  const isStillStreaming = REPORT_KINDS.some((kind) => byKind[kind].status === 'loading');

  const findingRowsByKind: Partial<Record<ReportKind, Array<{ severity: string }>>> = {
    VulnerabilityReport: rows.vuln,
    ExposedSecretReport: rows.secret,
    ConfigAuditReport: rows.config,
    RbacAssessmentReport: rows.rbac,
  };

  const anyFindingKindVisible = FINDING_KINDS.some((kind) => visibleKinds[kind]);

  const combinedSeverityCounts = React.useMemo(
    () => computeSeverityCounts([...rows.vuln, ...rows.secret, ...rows.config, ...rows.rbac]),
    [rows]
  );

  const totalFindings = rows.vuln.length + rows.secret.length + rows.config.length + rows.rbac.length;

  const allFindingRows = React.useMemo(
    () => [...rows.vuln, ...rows.secret, ...rows.config, ...rows.rbac],
    [rows]
  );
  const uniqueResourceCount = React.useMemo(
    () => new Set(allFindingRows.map((row) => row.resource)).size,
    [allFindingRows]
  );
  const uniqueApplicationCount = React.useMemo(
    () => new Set(allFindingRows.map((row) => row.application).filter((v): v is string => !!v)).size,
    [allFindingRows]
  );
  const totalSubtitle = showScope
    ? `across ${uniqueApplicationCount} application${uniqueApplicationCount === 1 ? '' : 's'}`
    : `across ${uniqueResourceCount} resource${uniqueResourceCount === 1 ? '' : 's'}`;

  const topPackages = React.useMemo(
    () => computeRanked(rows.vuln, (row) => row.packageName, { limit: RANKED_LIST_LIMIT }),
    [rows.vuln]
  );
  const topCves = React.useMemo(
    () => computeRanked(rows.vuln, (row) => row.id, { limit: RANKED_LIST_LIMIT }),
    [rows.vuln]
  );

  const leaderboard = React.useMemo(
    () => computeResourceRisk([rows.vuln, rows.secret, rows.config, rows.rbac]),
    [rows]
  );

  const fixableSplit = React.useMemo(() => computeFixableSplit(rows.vuln), [rows.vuln]);
  const fixablePct = rows.vuln.length > 0 ? Math.round((fixableSplit.fixable / rows.vuln.length) * 100) : 0;

  const ageBuckets = React.useMemo(() => computeAgeBuckets(rows.vuln), [rows.vuln]);
  const ageBucketEntries: RankedEntry[] = ageBuckets
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => ({ key: bucket.label, count: bucket.count }));

  const configCategories = React.useMemo(
    () => computeRanked(rows.config, (row) => row.category, { limit: RANKED_LIST_LIMIT }),
    [rows.config]
  );
  const rbacCategories = React.useMemo(
    () => computeRanked(rows.rbac, (row) => row.category, { limit: RANKED_LIST_LIMIT }),
    [rows.rbac]
  );
  const secretCategories = React.useMemo(
    () => computeRanked(rows.secret, (row) => row.category, { limit: RANKED_LIST_LIMIT }),
    [rows.secret]
  );
  const licenseBreakdown = React.useMemo(() => computeLicenseBreakdown(rows.sbom), [rows.sbom]);
  const uniqueLicenseCount = React.useMemo(
    () => new Set(rows.sbom.flatMap((row) => (row.licenses.length > 0 ? row.licenses : ['Unlicensed']))).size,
    [rows.sbom]
  );

  const complianceStats = React.useMemo(() => {
    let pass = 0;
    let fail = 0;
    let manual = 0;
    for (const instance of rows.compliance) {
      for (const control of instance.controls) {
        if (control.status === 'pass') pass += 1;
        else if (control.status === 'fail') fail += 1;
        else manual += 1;
      }
    }
    const passRate = pass + fail > 0 ? Math.round((pass / (pass + fail)) * 100) : 0;
    return { frameworks: rows.compliance.length, pass, fail, manual, passRate };
  }, [rows.compliance]);

  const totalRows =
    rows.vuln.length + rows.secret.length + rows.config.length + rows.rbac.length + rows.sbom.length + rows.compliance.length;

  if (isLoading) {
    return (
      <div className="tv-loading">
        <div className="tv-spinner" />
        <p>Loading dashboard…</p>
      </div>
    );
  }

  if (totalRows === 0) {
    return <ReportCleanState message={`No Trivy Operator findings for ${scopeLabel}.`} />;
  }

  return (
    <div className="rd-dashboard">
      {isStillStreaming && (
        <p className="rd-muted ov-streaming-note">
          <i className="fas fa-rotate-right fa-spin" /> Still loading more results - numbers below will keep
          updating.
        </p>
      )}
      {anyFindingKindVisible && (
        <div className="rd-panel">
          <h5>Risk Overview</h5>
          <div className="rd-cards rd-cards--overview">
            <div className="rd-card rd-card--total">
              <span className="rd-card-icon rd-card-icon--total">
                <i className="fas fa-layer-group" />
              </span>
              <div>
                <div className="rd-card-label">Total</div>
                <div className="rd-card-subtitle">{totalSubtitle}</div>
                <div className="rd-card-count">{totalFindings}</div>
              </div>
            </div>
            {SEVERITIES.map((severity) => (
              <div key={severity} className={`rd-card rd-card--${severity.toLowerCase()}`}>
                <span className={`rd-card-icon rd-card-icon--${severity.toLowerCase()}`}>
                  <i className={SEVERITY_ICON[severity]} />
                </span>
                <div>
                  <div className="rd-card-label">{severity}</div>
                  <div className="rd-card-count">{combinedSeverityCounts[severity]}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {anyFindingKindVisible && (
        <div className="rd-panel">
          <h5>Top Resources by Risk</h5>
          {leaderboard.length > 0 ? (
            <>
              <SeverityLegend />
              <ResourceLeaderboard rows={leaderboard} />
            </>
          ) : (
            <PositiveNote message="No resources with findings - nothing to rank." />
          )}
        </div>
      )}

      {anyFindingKindVisible && (
        <div className="rd-panel">
          <h5>Findings by Report Type</h5>
          <SeverityLegend />
          <div className="ov-kind-grid">
            {FINDING_KINDS.filter((kind) => visibleKinds[kind]).map((kind) => {
              const kindRows = findingRowsByKind[kind] ?? [];
              const kindCounts = computeSeverityCounts(kindRows);
              return (
                <div key={kind} className="ov-kind-tile">
                  <DonutChart
                    size={100}
                    thickness={14}
                    segments={SEVERITIES.map((severity) => ({
                      key: severity,
                      count: kindCounts[severity],
                      color: SEVERITY_COLOR[severity],
                    }))}
                    centerValue={kindRows.length}
                  />
                  <span className="ov-kind-tile-title">{REPORT_KIND_LABEL[kind]}</span>
                  {kindRows.length === 0 && <PositiveNote message="No findings" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {visibleKinds.ClusterComplianceReport && rows.compliance.length > 0 && (
        <div className="rd-panel">
          <h5>Compliance</h5>
          <div className="rd-cards ccr-stat-cards">
            <div className="rd-card">
              <span className="rd-card-icon ccr-card-icon--pass">
                <i className="fas fa-percentage" />
              </span>
              <div>
                <div className="rd-card-label">Pass Rate</div>
                <div className="rd-card-count">{complianceStats.passRate}%</div>
              </div>
            </div>
            <div className="rd-card">
              <span className="rd-card-icon rd-card-icon--total">
                <i className="fas fa-balance-scale" />
              </span>
              <div>
                <div className="rd-card-label">Frameworks</div>
                <div className="rd-card-count">{complianceStats.frameworks}</div>
              </div>
            </div>
            <div className="rd-card">
              <span className="rd-card-icon ccr-card-icon--pass">
                <i className="fas fa-check-circle" />
              </span>
              <div>
                <div className="rd-card-label">Passed</div>
                <div className="rd-card-count">{complianceStats.pass}</div>
              </div>
            </div>
            <div className="rd-card">
              <span className="rd-card-icon ccr-card-icon--fail">
                <i className="fas fa-times-circle" />
              </span>
              <div>
                <div className="rd-card-label">Failed</div>
                <div className="rd-card-count">{complianceStats.fail}</div>
              </div>
            </div>
            <div className="rd-card">
              <span className="rd-card-icon ccr-card-icon--manual">
                <i className="fas fa-hand-paper" />
              </span>
              <div>
                <div className="rd-card-label">Manual</div>
                <div className="rd-card-count">{complianceStats.manual}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {visibleKinds.VulnerabilityReport && (
        <div className="ov-stat-row">
          {rows.vuln.length > 0 ? (
            <>
              <div className="rd-panel ov-stat-tile">
                <h5>Fixable Vulnerabilities</h5>
                <div className="ov-progress-value">{fixablePct}%</div>
                <div
                  className="ov-progress"
                  role="progressbar"
                  aria-valuenow={fixablePct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Fixable vulnerabilities"
                >
                  <div className="ov-progress-fill" style={{ width: `${fixablePct}%` }} />
                </div>
                <p className="rd-muted">
                  {fixableSplit.fixable} of {rows.vuln.length} have a fix available
                </p>
              </div>

              <div className="rd-panel ov-stat-tile">
                <h5>Vulnerability Age</h5>
                <RankedList entries={ageBucketEntries} />
              </div>
            </>
          ) : (
            <div className="rd-panel ov-stat-tile">
              <h5>Vulnerabilities</h5>
              <PositiveNote message={`No vulnerabilities found for ${scopeLabel}.`} />
            </div>
          )}
        </div>
      )}

      {(topPackages.length > 0 || topCves.length > 0) && (
        <div className="ov-two-col">
          {topPackages.length > 0 && (
            <div className="rd-panel">
              <h5>Top Vulnerable Packages</h5>
              <RankedList entries={topPackages} />
            </div>
          )}
          {topCves.length > 0 && (
            <div className="rd-panel">
              <h5>Most Frequent CVEs</h5>
              <RankedList entries={topCves} />
            </div>
          )}
        </div>
      )}

      {(visibleKinds.SbomReport ||
        visibleKinds.ConfigAuditReport ||
        visibleKinds.RbacAssessmentReport ||
        visibleKinds.ExposedSecretReport) && (
        <div className="ov-two-col">
          {visibleKinds.SbomReport && (
            <div className="rd-panel">
              <h5>SBOM Footprint</h5>
              {rows.sbom.length > 0 ? (
                <div className="ov-sbom-panel">
                  <div className="ov-sbom-stats">
                    <div>
                      <div className="rd-card-count">{rows.sbom.length}</div>
                      <div className="rd-card-label">Components</div>
                    </div>
                    <div>
                      <div className="rd-card-count">{uniqueLicenseCount}</div>
                      <div className="rd-card-label">Licenses</div>
                    </div>
                  </div>
                  <div className="ov-license-row">
                    <DonutChart
                      segments={licenseBreakdown.map((entry, index) => ({
                        key: entry.key,
                        count: entry.count,
                        color: entry.key === 'Other' ? OTHER_COLOR : LICENSE_COLORS[index % LICENSE_COLORS.length],
                      }))}
                      centerValue={rows.sbom.length}
                      centerLabel="components"
                    />
                    <div className="ov-legend">
                      {licenseBreakdown.map((entry, index) => (
                        <div key={entry.key} className="ov-legend-item">
                          <span
                            className="ov-legend-swatch"
                            style={{
                              background:
                                entry.key === 'Other' ? OTHER_COLOR : LICENSE_COLORS[index % LICENSE_COLORS.length],
                            }}
                          />
                          <span>{entry.key}</span>
                          <span className="rd-muted">{entry.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <PositiveNote message={`No SBOM components found for ${scopeLabel}.`} />
              )}
            </div>
          )}

          {(visibleKinds.ConfigAuditReport || visibleKinds.RbacAssessmentReport || visibleKinds.ExposedSecretReport) && (
            <div className="ov-stacked-col">
              {visibleKinds.ConfigAuditReport && (
                <div className="rd-panel">
                  <h5>Top Failed Config Audit Categories</h5>
                  {configCategories.length > 0 ? (
                    <RankedList entries={configCategories} />
                  ) : (
                    <PositiveNote message="No failed config audit checks found." />
                  )}
                </div>
              )}
              {visibleKinds.RbacAssessmentReport && (
                <div className="rd-panel">
                  <h5>Top Failed RBAC Categories</h5>
                  {rbacCategories.length > 0 ? (
                    <RankedList entries={rbacCategories} />
                  ) : (
                    <PositiveNote message="No failed RBAC checks found." />
                  )}
                </div>
              )}
              {visibleKinds.ExposedSecretReport && (
                <div className="rd-panel">
                  <h5>Exposed Secrets by Category</h5>
                  {secretCategories.length > 0 ? (
                    <RankedList entries={secretCategories} />
                  ) : (
                    <PositiveNote message="No exposed secrets found." />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
