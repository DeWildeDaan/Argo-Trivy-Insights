/**
 * Extracts the composite key that uniquely identifies which resource a report CRD belongs to.
 * Multiple CRDs with the same key are duplicate scans of the same resource.
 */
function reportResourceKey(report: any): string {
  const labels = report?.metadata?.labels ?? {};
  const resourceName = labels['trivy-operator.resource.name'];
  const resourceKind = labels['trivy-operator.resource.kind'];
  const containerName = labels['trivy-operator.container.name'];
  const namespace = report?.metadata?.namespace;

  // Cluster-wide reports (e.g. ClusterComplianceReport) aren't scans of a
  // specific workload, so they carry none of the trivy-operator.resource.*
  // labels above - every instance would otherwise collapse to the same
  // empty key. Their metadata.name is a stable per-instance identifier
  // (e.g. k8s-cis-1.23 vs k8s-nsa-1.0), so key on that plus kind instead.
  if (!resourceName && !resourceKind && !containerName) {
    return `${report?.kind ?? ''}/${namespace ?? ''}/${report?.metadata?.name ?? ''}`;
  }

  // Composite key: namespace/kind/name/container
  // Empty fields are preserved to maintain uniqueness
  return `${namespace ?? ''}/${resourceKind ?? ''}/${resourceName ?? ''}/${containerName ?? ''}`;
}

/**
 * Deduplicates an array of report CRDs, keeping only the latest (by creationTimestamp) for each resource.
 * This filters out stale scans that remain in the cluster after deployments are updated.
 */
export function deduplicateReports(reports: unknown[]): unknown[] {
  const latestByKey = new Map<string, { report: unknown; timestamp: number }>();

  for (const report of reports) {
    const key = reportResourceKey(report);
    // Parse creationTimestamp to get milliseconds since epoch
    const createdAt = new Date((report as any)?.metadata?.creationTimestamp ?? 0).getTime();

    const current = latestByKey.get(key);
    // Keep the report with the later timestamp (handle NaN gracefully)
    if (!current || (createdAt > 0 && createdAt > current.timestamp)) {
      latestByKey.set(key, { report, timestamp: createdAt });
    }
  }

  return Array.from(latestByKey.values()).map(({ report }) => report);
}
