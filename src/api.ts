import { Application, ResourceNode } from './types';

// Module-scoped (not React state) so fetched data survives component
// unmount/remount - Argo CD unmounts extensions when you navigate away from
// their tab/page, which would otherwise force a full, slow refetch every
// time you come back. Cleared only by invalidateApiCache() (the manual
// Refresh action) or a full page reload.
let applicationsCache: Application[] | null = null;
const resourceTreeCache = new Map<string, ResourceNode[]>();

interface ManifestCacheEntry {
  resourceVersion: string | undefined;
  manifest: unknown;
}
const manifestCache = new Map<string, ManifestCacheEntry>();

// Refresh only needs to invalidate the cheap calls (the app list and each
// app's resource tree) - re-fetching those gives us each resource's current
// `resourceVersion`, which `fetchManifest` compares against the cache to
// decide whether a manifest actually needs re-fetching. Manifests
// themselves are left in place so unchanged CRDs are never re-fetched.
export function invalidateApiCache(): void {
  applicationsCache = null;
  resourceTreeCache.clear();
}

// Argo CD's API returns a JSON body like `{"error": "...", "code": ...}` on
// failure - `res.statusText` alone (e.g. plain "Unauthorized") hides that
// detail, so pull the body in too when a request fails.
async function describeError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) {
      return `${res.status} ${res.statusText}`;
    }
    try {
      const body = JSON.parse(text);
      return `${res.status} ${res.statusText}: ${body.error ?? text}`;
    } catch {
      return `${res.status} ${res.statusText}: ${text}`;
    }
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

export async function fetchManifest(
  appName: string,
  appNamespace: string | undefined,
  node: ResourceNode
): Promise<unknown> {
  const cacheKey = `${appName}/${node.group ?? ''}/${node.version ?? ''}/${node.kind ?? ''}/${node.namespace ?? ''}/${node.name ?? ''}`;
  const cached = manifestCache.get(cacheKey);
  if (cached && node.resourceVersion && cached.resourceVersion === node.resourceVersion) {
    return cached.manifest;
  }

  const params = new URLSearchParams({
    resourceName: node.name ?? '',
    namespace: node.namespace ?? '',
    version: node.version ?? '',
    kind: node.kind ?? '',
    group: node.group ?? '',
  });
  if (appNamespace) {
    params.set('appNamespace', appNamespace);
  }

  const res = await fetch(
    `/api/v1/applications/${encodeURIComponent(appName)}/resource?${params.toString()}`
  );
  if (!res.ok) {
    throw new Error(await describeError(res));
  }
  const body = await res.json();
  const manifest = JSON.parse(body.manifest);
  manifestCache.set(cacheKey, { resourceVersion: node.resourceVersion, manifest });
  return manifest;
}

export async function fetchApplications(): Promise<Application[]> {
  if (applicationsCache) {
    return applicationsCache;
  }
  const res = await fetch('/api/v1/applications');
  if (!res.ok) {
    throw new Error(await describeError(res));
  }
  const body = await res.json();
  const items: Application[] = body.items ?? [];
  applicationsCache = items;
  return items;
}

/**
 * Fetches the full resource tree for an Application - unlike
 * `status.resources` (the flat sync/diff-target list), this walks
 * ownerReferences and includes resources like Trivy Operator report CRDs
 * that are only attached to underlying workloads (ReplicaSets/Pods), not
 * part of the app's own rendered manifests.
 */
export async function fetchResourceTree(
  appName: string,
  appNamespace: string | undefined
): Promise<ResourceNode[]> {
  const cached = resourceTreeCache.get(appName);
  if (cached) {
    return cached;
  }

  const params = new URLSearchParams();
  if (appNamespace) {
    params.set('appNamespace', appNamespace);
  }
  const res = await fetch(
    `/api/v1/applications/${encodeURIComponent(appName)}/resource-tree?${params.toString()}`
  );
  if (!res.ok) {
    throw new Error(await describeError(res));
  }
  const body = await res.json();
  const nodes: ResourceNode[] = body.nodes ?? [];
  const orphanedNodes: ResourceNode[] = body.orphanedNodes ?? [];
  const combined = [...nodes, ...orphanedNodes];
  resourceTreeCache.set(appName, combined);
  return combined;
}
