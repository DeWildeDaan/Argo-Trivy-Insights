import { Severity } from './trivyReport';

export type ComplianceStatus = 'pass' | 'fail' | 'manual';

export interface ComplianceControlRow {
  id: string;
  name: string;
  severity: Severity;
  status: ComplianceStatus;
  totalFail?: number;
  description?: string;
}

export interface ComplianceInstance {
  name: string;
  typeId: string;
  title: string;
  version?: string;
  passCount: number;
  failCount: number;
  updateTimestamp?: string;
  controls: ComplianceControlRow[];
}

function normalizeSeverity(value: unknown): Severity {
  const upper = typeof value === 'string' ? value.toUpperCase() : '';
  return upper === 'CRITICAL' || upper === 'HIGH' || upper === 'MEDIUM' || upper === 'LOW' ? upper : 'UNKNOWN';
}

export function flattenClusterComplianceReports(reports: unknown[]): ComplianceInstance[] {
  const instances: ComplianceInstance[] = [];

  for (const report of reports) {
    const compliance = (report as any)?.spec?.compliance;
    if (!compliance?.type) {
      continue;
    }

    const specControls = Array.isArray(compliance.controls) ? compliance.controls : [];
    const descriptionById = new Map<string, string | undefined>();
    for (const control of specControls) {
      if (control?.id) {
        descriptionById.set(String(control.id), control.description);
      }
    }

    const controlChecks = (report as any)?.status?.summaryReport?.controlCheck;
    const checksById = new Map<string, any>();
    if (Array.isArray(controlChecks)) {
      for (const check of controlChecks) {
        if (check?.id) {
          checksById.set(String(check.id), check);
        }
      }
    }

    // Merge spec controls (catalog) with status controlCheck (results) - a
    // control can appear in either or both, and one may be missing entirely
    // in older reports, so union the ids instead of iterating just one side.
    const allIds = new Set<string>([...descriptionById.keys(), ...checksById.keys()]);

    const controls: ComplianceControlRow[] = Array.from(allIds).map((id) => {
      const check = checksById.get(id);
      const specControl = specControls.find((control: any) => String(control?.id) === id);
      const name = check?.name ?? specControl?.name ?? id;
      const severity = normalizeSeverity(check?.severity ?? specControl?.severity);
      const hasTotalFail = check && typeof check.totalFail === 'number';
      const status: ComplianceStatus = !hasTotalFail ? 'manual' : check.totalFail > 0 ? 'fail' : 'pass';

      return {
        id,
        name,
        severity,
        status,
        totalFail: hasTotalFail ? check.totalFail : undefined,
        description: descriptionById.get(id),
      };
    });

    instances.push({
      name: (report as any)?.metadata?.name ?? compliance.id ?? compliance.type,
      typeId: compliance.type,
      title: compliance.title ?? compliance.type,
      version: compliance.version,
      passCount: (report as any)?.status?.summary?.passCount ?? 0,
      failCount: (report as any)?.status?.summary?.failCount ?? 0,
      updateTimestamp: (report as any)?.status?.updateTimestamp,
      controls,
    });
  }

  return instances;
}
