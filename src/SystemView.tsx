import * as React from 'react';

import './AppView.css';
import { fetchApplications, fetchManifest, fetchResourceTree, invalidateApiCache } from './api';
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
import { REPORT_KIND_LABEL, SOURCE_APP_FIELD } from './trivyReport';
import { deduplicateReports } from './reportDeduplication';
import { SbomReportView } from './SbomReportView';
import { TabBar } from './TabBar';
import { Application, ResourceNode } from './types';
import { getUrlParam, setUrlParam } from './urlState';
import { VulnerabilityReportView } from './VulnerabilityReportView';

const TRIVY_SYS_TAB_PARAM = 'trivySysTab';

function readTabFromUrl(): ReportTab | null {
  const value = getUrlParam(TRIVY_SYS_TAB_PARAM);
  return value && (TABS as string[]).includes(value) ? (value as ReportTab) : null;
}

function writeTabToUrl(tab: ReportTab): void {
  setUrlParam(TRIVY_SYS_TAB_PARAM, tab);
}

type AppsFetchState =
  | { status: 'loading' }
  | { status: 'loaded'; apps: Application[] }
  | { status: 'error'; error: string };

type TreesFetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; treesByApp: Record<string, ResourceNode[]> }
  | { status: 'error'; error: string };

interface FetchTarget {
  appName: string;
  appNamespace: string | undefined;
  node: ResourceNode;
}

/**
 * System Level extension body. Rendered as a standalone sidebar page (no
 * Application/tree props), aggregating the same Trivy Operator report tabs
 * as the per-Application view across every Argo CD Application on the
 * cluster.
 */
export const SystemView: React.FC = () => {
  const [appsState, setAppsState] = React.useState<AppsFetchState>({ status: 'loading' });
  const [appsRetryTick, setAppsRetryTick] = React.useState(0);
  const [activeTab, setActiveTab] = React.useState<ReportTab>(() => readTabFromUrl() ?? TABS[0]);

  const selectTab = React.useCallback((tab: ReportTab) => {
    setActiveTab(tab);
    writeTabToUrl(tab);
  }, []);

  const [byKind, setByKind] = React.useState(initialByKind);
  const [retryTick, setRetryTick] = React.useState(0);
  const lastFetchKeyRef = React.useRef<Partial<Record<ReportKind, string>>>({});
  const queueRef = React.useRef<FetchQueue<unknown> | null>(null);

  const [treesState, setTreesState] = React.useState<TreesFetchState>({ status: 'idle' });
  const [treesRetryTick, setTreesRetryTick] = React.useState(0);

  React.useEffect(() => {
    setAppsState({ status: 'loading' });
    fetchApplications()
      .then((apps) => setAppsState({ status: 'loaded', apps }))
      .catch((err) =>
        setAppsState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
      );
  }, [appsRetryTick]);

  const apps = appsState.status === 'loaded' ? appsState.apps : [];

  React.useEffect(() => {
    if (appsState.status !== 'loaded') {
      return;
    }
    setTreesState({ status: 'loading' });
    Promise.allSettled(
      appsState.apps.map((app) => {
        const appName = app.metadata?.name;
        if (!appName) {
          return Promise.resolve<[string, ResourceNode[]] | null>(null);
        }
        return fetchResourceTree(appName, app.metadata?.namespace).then(
          (nodes): [string, ResourceNode[]] => [appName, nodes]
        );
      })
    ).then((results) => {
      const treesByApp: Record<string, ResourceNode[]> = {};
      const failures: string[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          const [appName, nodes] = result.value;
          treesByApp[appName] = nodes;
        } else if (result.status === 'rejected') {
          failures.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
        }
      }
      if (appsState.apps.length > 0 && failures.length === appsState.apps.length) {
        setTreesState({ status: 'error', error: failures[0] });
        return;
      }
      setTreesState({ status: 'loaded', treesByApp });
    });
  }, [appsState, treesRetryTick]);

  const treesByApp = treesState.status === 'loaded' ? treesState.treesByApp : {};

  const nodeKinds = React.useMemo(() => {
    const kinds = new Set<string>();
    for (const nodes of Object.values(treesByApp)) {
      for (const node of nodes) {
        if (node.kind) {
          kinds.add(node.kind);
        }
      }
    }
    return kinds;
  }, [treesByApp]);

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
    if (appsState.status !== 'loaded' || treesState.status !== 'loaded') {
      return;
    }

    // Fetch every report kind eagerly (not just the active tab) so the
    // Overview tab can aggregate across all of them - but the active tab's
    // resources are ordered first in the shared queue below so it isn't
    // stuck competing equally with tabs nobody's looking at.
    const targetsByKind: Partial<Record<ReportKind, FetchTarget[]>> = {};
    const kindsToFetch: ReportKind[] = [];
    const emptyKinds: ReportKind[] = [];

    for (const kind of REPORT_KINDS) {
      const kinds = KINDS_FOR_TAB[kind];
      const targets: FetchTarget[] = [];
      for (const app of apps) {
        const appName = app.metadata?.name;
        if (!appName) {
          continue;
        }
        for (const node of treesState.treesByApp[appName] ?? []) {
          if (node.kind && kinds.includes(node.kind)) {
            targets.push({ appName, appNamespace: app.metadata?.namespace, node });
          }
        }
      }

      // Keyed on the actual (app, node, resourceVersion) set so newly-synced
      // apps/resources - or resources that changed since the last load -
      // trigger a refetch instead of being skipped as "already loaded".
      // fetchManifest itself still skips the network call for any individual
      // resource whose resourceVersion hasn't actually changed.
      const fetchKey = targets
        .map((t) => `${t.appName}/${t.node.kind}/${t.node.namespace}/${t.node.name}/${t.node.resourceVersion ?? ''}`)
        .sort()
        .join('|');
      if (lastFetchKeyRef.current[kind] === fetchKey) {
        continue;
      }
      lastFetchKeyRef.current[kind] = fetchKey;
      targetsByKind[kind] = targets;
      if (targets.length > 0) {
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
      for (const target of targetsByKind[kind]!) {
        queueTargets.push({
          key: `${kind}/${target.appName}/${target.node.kind}/${target.node.namespace}/${target.node.name}`,
          kind,
          run: () =>
            fetchManifest(target.appName, target.appNamespace, target.node).then((manifest) => ({
              ...(manifest as Record<string, unknown>),
              [SOURCE_APP_FIELD]: target.appName,
            })),
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
  }, [apps, appsState.status, treesState, retryTick]);

  const retryFetch = React.useCallback((kind: ReportKind) => {
    invalidateApiCache();
    delete lastFetchKeyRef.current[kind];
    setRetryTick((tick) => tick + 1);
  }, []);

  const refreshAll = React.useCallback(() => {
    invalidateApiCache();
    lastFetchKeyRef.current = {};
    setAppsRetryTick((tick) => tick + 1);
    setTreesRetryTick((tick) => tick + 1);
  }, []);

  const state = activeTab === 'Overview' ? undefined : (byKind as Record<ReportTab, FetchState>)[activeTab];

  if (appsState.status === 'loading') {
    return (
      <div className="tv-app">
        <div className="tv-loading">
          <div className="tv-spinner" />
          <p>Loading applications…</p>
        </div>
      </div>
    );
  }

  if (appsState.status === 'error') {
    return (
      <div className="tv-app">
        <div className="rd-panel tv-error">
          <h5>Failed to load applications</h5>
          <p className="rd-muted">{appsState.error}</p>
          <button type="button" className="rd-export-btn" onClick={() => setAppsRetryTick((tick) => tick + 1)}>
            <i className="fas fa-rotate-right" /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (treesState.status === 'idle' || treesState.status === 'loading') {
    return (
      <div className="tv-app">
        <div className="tv-loading">
          <div className="tv-spinner" />
          <p>Scanning {apps.length} application resource trees…</p>
        </div>
      </div>
    );
  }

  if (treesState.status === 'error') {
    return (
      <div className="tv-app">
        <div className="rd-panel tv-error">
          <h5>Failed to load application resource trees</h5>
          <p className="rd-muted">{treesState.error}</p>
          <button type="button" className="rd-export-btn" onClick={() => setTreesRetryTick((tick) => tick + 1)}>
            <i className="fas fa-rotate-right" /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (visibleTabs.length === 0) {
    return (
      <div className="tv-app">
        <p>No Trivy Operator reports found across any of the {apps.length} Argo CD Applications.</p>
      </div>
    );
  }

  const streamedData = state && (state.status === 'loaded' || state.status === 'loading') ? state.data : [];

  return (
    <div className="tv-app">
      <div className="tv-toolbar">
        <TabBar tabs={visibleTabs} activeTab={activeTab} onSelect={selectTab} />
        <button type="button" className="rd-export-btn tv-refresh-btn" onClick={refreshAll} title="Reload data from the cluster">
          <i className="fas fa-rotate-right" /> Refresh
        </button>
      </div>
      <div id={`tv-tabpanel-${activeTab}`} role="tabpanel" aria-labelledby={`tv-tab-${activeTab}`}>
        {activeTab === 'Overview' && (
          <OverviewView byKind={byKind} visibleKinds={visibleKinds} scopeLabel="the cluster" showScope />
        )}
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
          <p>No {activeTab} resources found across the cluster.</p>
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
            {activeTab === 'VulnerabilityReport' && (
              <VulnerabilityReportView
                reports={streamedData}
                showScope
                cleanMessage="No vulnerabilities found across the cluster."
                exportFileLabel="sys-vulnerabilities"
              />
            )}
            {activeTab === 'ExposedSecretReport' && (
              <ExposedSecretReportView
                reports={streamedData}
                showScope
                cleanMessage="No exposed secrets found across the cluster."
                exportFileLabel="sys-exposed-secrets"
              />
            )}
            {activeTab === 'ConfigAuditReport' && (
              <ChecksReportView
                reports={streamedData}
                searchPlaceholder="Filter by check, resource, category or severity..."
                emptyMessage="No failed config audit checks match your filters."
                cleanMessage="No failed config audit checks found across the cluster."
                distributionLabel="Config Audit Distribution"
                exportFileLabel="sys-config-audit-checks"
                showScope
              />
            )}
            {activeTab === 'RbacAssessmentReport' && (
              <ChecksReportView
                reports={streamedData}
                searchPlaceholder="Filter by check, resource, category or severity..."
                emptyMessage="No failed RBAC checks match your filters."
                cleanMessage="No failed RBAC checks found across the cluster."
                distributionLabel="RBAC Assessment Distribution"
                exportFileLabel="sys-rbac-assessment-checks"
                showScope
              />
            )}
            {activeTab === 'SbomReport' && <SbomReportView reports={streamedData} appName="cluster" showScope urlKey="sys-sbom" />}
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
