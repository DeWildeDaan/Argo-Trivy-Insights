import * as React from 'react';

import './AppView.css';
import { fetchManifest, invalidateApiCache } from './api';
import { ChecksReportView } from './ChecksReportView';
import { ExposedSecretReportView } from './ExposedSecretReportView';
import { OverviewView } from './OverviewView';
import {
  Batcher,
  createBatcher,
  createFetchQueue,
  FetchQueue,
  QueueTarget,
  REPORT_FETCH_BATCH_INTERVAL_MS,
  REPORT_FETCH_CONCURRENCY,
} from './reportFetchQueue';
import {
  FetchState,
  initialByKind,
  KINDS_FOR_TAB,
  REPORT_KINDS,
  ReportKind,
  ReportTab,
  TABS,
} from './reportKinds';
import { REPORT_KIND_LABEL } from './trivyReport';
import { deduplicateReports } from './reportDeduplication';
import { SbomReportView } from './SbomReportView';
import { TabBar } from './TabBar';
import { AppViewProps, ResourceNode } from './types';
import { getUrlParam, setUrlParam } from './urlState';
import { VulnerabilityReportView } from './VulnerabilityReportView';

const TRIVY_TAB_PARAM = 'trivyTab';

function readTabFromUrl(): ReportTab | null {
  const value = getUrlParam(TRIVY_TAB_PARAM);
  return value && (TABS as string[]).includes(value) ? (value as ReportTab) : null;
}

function writeTabToUrl(tab: ReportTab): void {
  setUrlParam(TRIVY_TAB_PARAM, tab);
}

/**
 * App View extension body. Rendered as the main content of the Application
 * Details view when the user selects the Trivy Insights tab.
 *
 * Shows a tab per Trivy Operator report kind, each dumping the raw manifest
 * of matching report resources found in the application's resource tree.
 */
export const AppView: React.FC<AppViewProps> = ({ application, tree }) => {
  const appName = application?.metadata?.name ?? '';
  const appNamespace = application?.metadata?.namespace;
  const [activeTab, setActiveTab] = React.useState<ReportTab>(() => readTabFromUrl() ?? TABS[0]);

  const selectTab = React.useCallback((tab: ReportTab) => {
    setActiveTab(tab);
    writeTabToUrl(tab);
  }, []);
  const [byKind, setByKind] = React.useState(initialByKind);
  const [retryTick, setRetryTick] = React.useState(0);
  const lastFetchKeyRef = React.useRef<Partial<Record<ReportKind, string>>>({});
  const queueRef = React.useRef<FetchQueue<unknown> | null>(null);

  const nodeKinds = React.useMemo(() => {
    const kinds = new Set<string>();
    for (const node of tree?.nodes ?? []) {
      if (node.kind) {
        kinds.add(node.kind);
      }
    }
    return kinds;
  }, [tree]);

  const isKindVisible = React.useCallback(
    (kind: ReportKind) => KINDS_FOR_TAB[kind].some((k) => nodeKinds.has(k)),
    [nodeKinds]
  );

  const visibleTabs = React.useMemo(
    () =>
      TABS.filter((tab) => (tab === 'Overview' ? REPORT_KINDS.some(isKindVisible) : isKindVisible(tab))),
    [isKindVisible]
  );

  const visibleKinds = React.useMemo(
    () =>
      REPORT_KINDS.reduce((acc, kind) => {
        acc[kind] = isKindVisible(kind);
        return acc;
      }, {} as Record<ReportKind, boolean>),
    [isKindVisible]
  );

  React.useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.includes(activeTab)) {
      selectTab(visibleTabs[0]);
    }
  }, [visibleTabs, activeTab, selectTab]);

  // Re-prioritizes whatever's still queued (but not yet started) so the tab
  // the user just switched to gets the next free fetch slots, without
  // restarting anything already in flight.
  React.useEffect(() => {
    queueRef.current?.prioritize(activeTab);
  }, [activeTab]);

  React.useEffect(() => {
    if (!appName) {
      return;
    }

    // Fetch every report kind eagerly (not just the active tab) so the
    // Overview tab can aggregate across all of them - but the active tab's
    // resources are ordered first in the shared queue below so it isn't
    // stuck competing equally with tabs nobody's looking at.
    const targetsByKind: Partial<Record<ReportKind, ResourceNode[]>> = {};
    const kindsToFetch: ReportKind[] = [];
    const emptyKinds: ReportKind[] = [];

    for (const kind of REPORT_KINDS) {
      const kinds = KINDS_FOR_TAB[kind];
      const nodes = (tree?.nodes ?? []).filter((node) => node.kind && kinds.includes(node.kind));
      // Argo CD populates `tree` asynchronously after mount, and resources
      // can change between refreshes - key the fetch on the actual node set
      // (including resourceVersion) so either transition triggers a refetch
      // instead of being skipped as "already loaded". fetchManifest itself
      // still skips the network call for any individual resource whose
      // resourceVersion hasn't actually changed.
      const fetchKey = nodes
        .map((node) => `${node.kind}/${node.namespace}/${node.name}/${node.resourceVersion ?? ''}`)
        .sort()
        .join('|');
      if (lastFetchKeyRef.current[kind] === fetchKey) {
        continue;
      }
      lastFetchKeyRef.current[kind] = fetchKey;
      targetsByKind[kind] = nodes;
      if (nodes.length > 0) {
        kindsToFetch.push(kind);
      } else {
        emptyKinds.push(kind);
      }
    }

    if (kindsToFetch.length === 0 && emptyKinds.length === 0) {
      return;
    }

    setByKind((prev) => {
      const next = { ...prev };
      for (const kind of kindsToFetch) {
        next[kind] = { status: 'loading', data: [], settled: 0, total: targetsByKind[kind]!.length };
      }
      for (const kind of emptyKinds) {
        next[kind] = { status: 'loaded', data: [], failedCount: 0 };
      }
      return next;
    });

    if (kindsToFetch.length === 0) {
      return;
    }

    const orderedKinds = [...kindsToFetch];
    const activeIdx = orderedKinds.indexOf(activeTab as ReportKind);
    if (activeIdx > 0) {
      orderedKinds.unshift(...orderedKinds.splice(activeIdx, 1));
    }

    const queueTargets: QueueTarget<unknown>[] = [];
    for (const kind of orderedKinds) {
      for (const node of targetsByKind[kind]!) {
        queueTargets.push({
          key: `${kind}/${node.namespace}/${node.name}`,
          kind,
          run: () => fetchManifest(appName, appNamespace, node),
        });
      }
    }

    const queue = createFetchQueue(queueTargets);
    queueRef.current = queue;

    let cancelled = false;
    const settledCounts: Partial<Record<ReportKind, number>> = {};
    const failedCounts: Partial<Record<ReportKind, number>> = {};
    const batchers: Partial<Record<ReportKind, Batcher<unknown>>> = {};

    for (const kind of kindsToFetch) {
      settledCounts[kind] = 0;
      failedCounts[kind] = 0;
      batchers[kind] = createBatcher<unknown>((items) => {
        if (cancelled) {
          return;
        }
        setByKind((prev) => {
          const prevState = prev[kind];
          const prevData = prevState.status === 'loading' ? prevState.data : [];
          const allData = [...prevData, ...items];
          const dedupData = deduplicateReports(allData);
          return {
            ...prev,
            [kind]: {
              status: 'loading',
              data: dedupData,
              settled: settledCounts[kind] ?? 0,
              total: targetsByKind[kind]!.length,
            },
          };
        });
      }, REPORT_FETCH_BATCH_INTERVAL_MS);
    }

    queue
      .start(REPORT_FETCH_CONCURRENCY, (target, result) => {
        if (cancelled) {
          return;
        }
        const kind = target.kind;
        settledCounts[kind] = (settledCounts[kind] ?? 0) + 1;
        if (result.ok) {
          batchers[kind]!.push(result.value);
        } else {
          failedCounts[kind] = (failedCounts[kind] ?? 0) + 1;
        }

        const total = targetsByKind[kind]!.length;
        if (settledCounts[kind] === total) {
          const remaining = batchers[kind]!.drain();
          setByKind((prev) => {
            const prevState = prev[kind];
            const prevData = prevState.status === 'loading' ? prevState.data : [];
            const allData = [...prevData, ...remaining];
            const dedupData = deduplicateReports(allData);
            const failed = failedCounts[kind] ?? 0;
            if (total > 0 && failed === total) {
              return {
                ...prev,
                [kind]: { status: 'error', error: 'All resources of this kind failed to load' },
              };
            }
            return {
              ...prev,
              [kind]: { status: 'loaded', data: dedupData, failedCount: failed },
            };
          });
        }
      })
      .catch(() => {
        // Per-target failures are handled in onSettle above; start() itself
        // only rejects on a bug in the queue, not a fetch failure.
      });

    return () => {
      cancelled = true;
    };
  }, [appName, appNamespace, tree, retryTick]);

  const retryFetch = React.useCallback((kind: ReportKind) => {
    invalidateApiCache();
    delete lastFetchKeyRef.current[kind];
    setRetryTick((tick) => tick + 1);
  }, []);

  const refreshAll = React.useCallback(() => {
    invalidateApiCache();
    lastFetchKeyRef.current = {};
    setRetryTick((tick) => tick + 1);
  }, []);

  const state = activeTab === 'Overview' ? undefined : (byKind as Record<ReportTab, FetchState>)[activeTab];
  const streamedData = state && (state.status === 'loaded' || state.status === 'loading') ? state.data : [];

  if (visibleTabs.length === 0) {
    return (
      <div className="tv-app">
        <p>No Trivy Operator reports found for this application.</p>
      </div>
    );
  }

  return (
    <div className="tv-app">
      <div className="tv-toolbar">
        <TabBar tabs={visibleTabs} activeTab={activeTab} onSelect={selectTab} />
        <button type="button" className="rd-export-btn tv-refresh-btn" onClick={refreshAll} title="Reload data from the cluster">
          <i className="fas fa-rotate-right" /> Refresh
        </button>
      </div>
      <div id={`tv-tabpanel-${activeTab}`} role="tabpanel" aria-labelledby={`tv-tab-${activeTab}`}>
      {activeTab === 'Overview' && <OverviewView byKind={byKind} visibleKinds={visibleKinds} />}
      {state && state.status === 'loading' && state.data.length === 0 && (
        <div className="tv-loading">
          <div className="tv-spinner" />
          <p>Loading {REPORT_KIND_LABEL[activeTab]}…</p>
        </div>
      )}
      {state && state.status === 'error' && (
        <div className="rd-panel tv-error">
          <h5>Failed to load {REPORT_KIND_LABEL[activeTab]}</h5>
          <p className="rd-muted">{state.error}</p>
          <button type="button" className="rd-export-btn" onClick={() => retryFetch(activeTab as ReportKind)}>
            <i className="fas fa-rotate-right" /> Retry
          </button>
        </div>
      )}
      {state && state.status === 'loaded' && state.data.length === 0 && (
        <p>No {activeTab} resources found for this application.</p>
      )}
      {state && streamedData.length > 0 && (state.status === 'loaded' || state.status === 'loading') && (
        <>
          {state.status === 'loading' && (
            <div className="tv-inline-progress">
              <div className="tv-inline-progress-bar">
                <div
                  className="tv-inline-progress-fill"
                  style={{ width: `${Math.round((state.settled / Math.max(state.total, 1)) * 100)}%` }}
                />
              </div>
              <span className="rd-muted">
                Loading… {state.settled} / {state.total}
              </span>
            </div>
          )}
          {state.status === 'loaded' && state.failedCount > 0 && (
            <p className="rd-muted tv-partial-note">
              <i className="fas fa-triangle-exclamation" /> {state.failedCount} of{' '}
              {state.data.length + state.failedCount} resources failed to load.
            </p>
          )}
          {activeTab === 'VulnerabilityReport' && <VulnerabilityReportView reports={streamedData} />}
          {activeTab === 'ExposedSecretReport' && <ExposedSecretReportView reports={streamedData} />}
          {activeTab === 'ConfigAuditReport' && (
            <ChecksReportView
              reports={streamedData}
              searchPlaceholder="Filter by check, resource, category or severity..."
              emptyMessage="No failed config audit checks match your filters."
              cleanMessage="No failed config audit checks found for this application."
              distributionLabel="Config Audit Distribution"
              exportFileLabel="config-audit-checks"
            />
          )}
          {activeTab === 'RbacAssessmentReport' && (
            <ChecksReportView
              reports={streamedData}
              searchPlaceholder="Filter by check, resource, category or severity..."
              emptyMessage="No failed RBAC checks match your filters."
              cleanMessage="No failed RBAC checks found for this application."
              distributionLabel="RBAC Assessment Distribution"
              exportFileLabel="rbac-assessment-checks"
            />
          )}
          {activeTab === 'SbomReport' && <SbomReportView reports={streamedData} appName={appName} />}
          {activeTab !== 'VulnerabilityReport' &&
            activeTab !== 'ExposedSecretReport' &&
            activeTab !== 'ConfigAuditReport' &&
            activeTab !== 'RbacAssessmentReport' &&
            activeTab !== 'SbomReport' && (
              <div className="rd-panel tv-fallback">
                <h5>Raw {activeTab} data</h5>
                <p className="rd-muted">
                  This report kind doesn't have a dedicated view yet - showing the raw manifest data below.
                </p>
                <pre className="tv-fallback-pre">{JSON.stringify(streamedData, null, 2)}</pre>
              </div>
            )}
        </>
      )}
      </div>
    </div>
  );
};
