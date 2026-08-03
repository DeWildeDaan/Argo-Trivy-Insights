export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const;

export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_ORDER: string[] = [...SEVERITIES];

export function severityRank(severity: string): number {
  const index = SEVERITY_ORDER.indexOf(severity.toUpperCase());
  return index === -1 ? SEVERITY_ORDER.length : index;
}

export const SEVERITY_ICON: Record<Severity, string> = {
  CRITICAL: 'fas fa-times-circle',
  HIGH: 'fas fa-exclamation-triangle',
  MEDIUM: 'fas fa-info-circle',
  LOW: 'far fa-circle',
  UNKNOWN: 'fas fa-question-circle',
};

export const REPORT_KIND_LABEL: Record<
  'Overview' | 'VulnerabilityReport' | 'ExposedSecretReport' | 'ConfigAuditReport' | 'RbacAssessmentReport' | 'SbomReport',
  string
> = {
  Overview: 'Overview',
  VulnerabilityReport: 'Vulnerabilities',
  ExposedSecretReport: 'Exposed Secrets',
  ConfigAuditReport: 'Config Audit',
  RbacAssessmentReport: 'RBAC Assessment',
  SbomReport: 'SBOM',
};

// Set by the cluster-wide system-level extension on each fetched manifest
// before flattening, so rows can be filtered/labelled by owning Argo CD
// Application. Never set by the per-application view.
export const SOURCE_APP_FIELD = '__argocdApplication';

export function applicationFor(report: any): string | undefined {
  return report?.[SOURCE_APP_FIELD];
}

export function resourceLabelFor(report: any): string {
  const labels = report?.metadata?.labels ?? {};
  const containerName = labels['trivy-operator.container.name'];
  const resourceName = labels['trivy-operator.resource.name'];
  const resourceKind = labels['trivy-operator.resource.kind'];

  if (resourceName && containerName) {
    return `${resourceName}/${containerName}`;
  }
  if (containerName) {
    return containerName;
  }
  if (resourceKind && resourceName) {
    return `${resourceKind}/${resourceName}`;
  }
  if (resourceName) {
    return resourceName;
  }
  return report?.metadata?.name ?? 'unknown';
}
