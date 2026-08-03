import { ageInDays, VulnerabilityRow } from './vulnerabilityReport';
import { Severity, SEVERITIES } from './trivyReport';
import { SbomComponentRow } from './sbomReport';

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  CRITICAL: 10,
  HIGH: 5,
  MEDIUM: 2,
  LOW: 1,
  UNKNOWN: 1,
};

function emptySeverityCounts(): Record<Severity, number> {
  const counts = {} as Record<Severity, number>;
  for (const severity of SEVERITIES) {
    counts[severity] = 0;
  }
  return counts;
}

function normalizeSeverity(severity: string): Severity {
  const upper = severity.toUpperCase();
  return (SEVERITIES as readonly string[]).includes(upper) ? (upper as Severity) : 'UNKNOWN';
}

export function computeSeverityCounts(rows: Array<{ severity: string }>): Record<Severity, number> {
  const counts = emptySeverityCounts();
  for (const row of rows) {
    counts[normalizeSeverity(row.severity)] += 1;
  }
  return counts;
}

export interface ResourceRisk {
  resource: string;
  counts: Record<Severity, number>;
  total: number;
  score: number;
}

export function computeResourceRisk(
  rowGroups: Array<Array<{ severity: string; resource: string; namespace?: string }>>
): ResourceRisk[] {
  const byResource = new Map<string, ResourceRisk>();

  const distinctNamespaces = new Set<string>();
  for (const rows of rowGroups) {
    for (const row of rows) {
      if (row.namespace) {
        distinctNamespaces.add(row.namespace);
      }
    }
  }
  // Only disambiguate by namespace once results actually span more than one -
  // keeps the single-app view's labels unchanged.
  const disambiguate = distinctNamespaces.size > 1;

  for (const rows of rowGroups) {
    for (const row of rows) {
      const key = disambiguate && row.namespace ? `${row.namespace}/${row.resource}` : row.resource;
      let entry = byResource.get(key);
      if (!entry) {
        entry = { resource: key, counts: emptySeverityCounts(), total: 0, score: 0 };
        byResource.set(key, entry);
      }
      const severity = normalizeSeverity(row.severity);
      entry.counts[severity] += 1;
      entry.total += 1;
      entry.score += SEVERITY_WEIGHT[severity];
    }
  }

  return Array.from(byResource.values()).sort((a, b) => b.score - a.score);
}

export function computeFixableSplit(rows: VulnerabilityRow[]): { fixable: number; notFixable: number } {
  let fixable = 0;
  for (const row of rows) {
    if (row.fixedVersion) {
      fixable += 1;
    }
  }
  return { fixable, notFixable: rows.length - fixable };
}

export interface AgeBucket {
  label: string;
  count: number;
}

const AGE_BUCKET_BOUNDS: Array<{ label: string; maxDays: number }> = [
  { label: '<30d', maxDays: 30 },
  { label: '30-90d', maxDays: 90 },
  { label: '90d-1y', maxDays: 365 },
  { label: '1y+', maxDays: Number.POSITIVE_INFINITY },
];

export function computeAgeBuckets(rows: VulnerabilityRow[]): AgeBucket[] {
  const buckets = AGE_BUCKET_BOUNDS.map((bound) => ({ label: bound.label, count: 0 }));
  let unknown = 0;

  for (const row of rows) {
    const age = ageInDays(row.publishedDate);
    if (!Number.isFinite(age)) {
      unknown += 1;
      continue;
    }
    const index = AGE_BUCKET_BOUNDS.findIndex((bound) => age < bound.maxDays);
    buckets[index === -1 ? buckets.length - 1 : index].count += 1;
  }

  if (unknown > 0) {
    buckets.push({ label: 'Unknown', count: unknown });
  }

  return buckets;
}

export interface RankedEntry {
  key: string;
  count: number;
}

export function computeRanked<T>(
  rows: T[],
  keyFn: (row: T) => string | undefined,
  opts: { limit?: number; otherLabel?: string } = {}
): RankedEntry[] {
  const { limit = 5, otherLabel = 'Other' } = opts;
  const counts = new Map<string, number>();

  for (const row of rows) {
    const key = keyFn(row);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  if (sorted.length <= limit) {
    return sorted;
  }

  const top = sorted.slice(0, limit);
  const overflowCount = sorted.slice(limit).reduce((sum, entry) => sum + entry.count, 0);
  top.push({ key: otherLabel, count: overflowCount });
  return top;
}


export function computeLicenseBreakdown(rows: SbomComponentRow[], limit = 4): RankedEntry[] {
  const licenseNames: string[] = [];
  for (const row of rows) {
    if (row.licenses.length === 0) {
      licenseNames.push('Unlicensed');
    } else {
      licenseNames.push(...row.licenses);
    }
  }
  return computeRanked(licenseNames, (name) => name, { limit, otherLabel: 'Other' });
}
