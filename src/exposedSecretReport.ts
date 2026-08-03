import { applicationFor, resourceLabelFor } from './trivyReport';

export interface ExposedSecretRow {
  id: string;
  resource: string;
  namespace?: string;
  application?: string;
  severity: string;
  category?: string;
  title?: string;
  target?: string;
  match?: string;
}

export function flattenExposedSecretReports(reports: unknown[]): ExposedSecretRow[] {
  const rows: ExposedSecretRow[] = [];

  for (const report of reports) {
    const resource = resourceLabelFor(report);
    const namespace = (report as any)?.metadata?.namespace;
    const application = applicationFor(report);
    const secrets = (report as any)?.report?.secrets;
    if (!Array.isArray(secrets)) {
      continue;
    }

    for (const secret of secrets) {
      if (!secret?.ruleID) {
        continue;
      }
      rows.push({
        id: secret.ruleID,
        resource,
        namespace,
        application,
        severity: (secret.severity ?? 'UNKNOWN').toUpperCase(),
        category: secret.category,
        title: secret.title,
        target: secret.target,
        match: secret.match,
      });
    }
  }

  return rows;
}
