export type ReportKind =
  | 'VulnerabilityReport'
  | 'ExposedSecretReport'
  | 'ConfigAuditReport'
  | 'RbacAssessmentReport'
  | 'SbomReport';

export type ReportTab = 'Overview' | ReportKind;

export const REPORT_KINDS: ReportKind[] = [
  'VulnerabilityReport',
  'ExposedSecretReport',
  'ConfigAuditReport',
  'RbacAssessmentReport',
  'SbomReport',
];

export const TABS: ReportTab[] = ['Overview', ...REPORT_KINDS];

export const TAB_ICON: Record<ReportTab, string> = {
  Overview: 'fa-chart-pie',
  VulnerabilityReport: 'fa-bug',
  ExposedSecretReport: 'fa-key',
  ConfigAuditReport: 'fa-clipboard-check',
  RbacAssessmentReport: 'fa-user-shield',
  SbomReport: 'fa-cubes',
};

// Some report kinds have a cluster-scoped counterpart CRD that shares the
// same report schema - fold those into the same tab.
export const KINDS_FOR_TAB: Record<ReportKind, string[]> = {
  VulnerabilityReport: ['VulnerabilityReport'],
  ExposedSecretReport: ['ExposedSecretReport'],
  ConfigAuditReport: ['ConfigAuditReport'],
  RbacAssessmentReport: ['RbacAssessmentReport', 'ClusterRbacAssessmentReport'],
  SbomReport: ['SbomReport'],
};

export type FetchState =
  | { status: 'idle' }
  // `data` accumulates as resources stream in - consumers can render it
  // before the kind finishes loading instead of waiting for `settled` to
  // reach `total`.
  | { status: 'loading'; data: unknown[]; settled: number; total: number }
  // `failedCount` counts individual resources that failed to fetch without
  // failing the whole kind - only every target failing produces `'error'`.
  | { status: 'loaded'; data: unknown[]; failedCount: number }
  | { status: 'error'; error: string };

export const initialByKind: Record<ReportKind, FetchState> = {
  VulnerabilityReport: { status: 'idle' },
  ExposedSecretReport: { status: 'idle' },
  ConfigAuditReport: { status: 'idle' },
  RbacAssessmentReport: { status: 'idle' },
  SbomReport: { status: 'idle' },
};
