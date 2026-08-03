import { applicationFor, resourceLabelFor } from './trivyReport';

export interface ChecksRow {
  id: string;
  resource: string;
  namespace?: string;
  application?: string;
  severity: string;
  category?: string;
  title?: string;
  description?: string;
  messages?: string[];
  remediation?: string;
}

export function flattenChecksReports(reports: unknown[]): ChecksRow[] {
  const rows: ChecksRow[] = [];

  for (const report of reports) {
    const resource = resourceLabelFor(report);
    const namespace = (report as any)?.metadata?.namespace;
    const application = applicationFor(report);
    const checks = (report as any)?.report?.checks;
    if (!Array.isArray(checks)) {
      continue;
    }

    for (const check of checks) {
      if (!check?.checkID || check.success) {
        continue;
      }
      rows.push({
        id: check.checkID,
        resource,
        namespace,
        application,
        severity: (check.severity ?? 'UNKNOWN').toUpperCase(),
        category: check.category,
        title: check.title,
        description: check.description,
        messages: Array.isArray(check.messages) ? check.messages : undefined,
        remediation: check.remediation,
      });
    }
  }

  return rows;
}
