import { applicationFor, resourceLabelFor } from './trivyReport';

export interface SbomComponentRow {
  id: string;
  resource: string;
  namespace?: string;
  application?: string;
  name: string;
  version: string;
  type: string;
  purl?: string;
  licenses: string[];
  supplier?: string;
}

function licenseNamesFor(component: any): string[] {
  const licenses = component?.licenses;
  if (!Array.isArray(licenses)) {
    return [];
  }
  const names: string[] = [];
  for (const entry of licenses) {
    const name = entry?.license?.id ?? entry?.license?.name ?? entry?.expression;
    if (name) {
      names.push(name);
    }
  }
  return names;
}

export function buildCycloneDxBom(rows: SbomComponentRow[], appName: string): Record<string, unknown> {
  const bomRefCounts = new Map<string, number>();

  const components = rows.map((row) => {
    const seenCount = bomRefCounts.get(row.id) ?? 0;
    bomRefCounts.set(row.id, seenCount + 1);
    const bomRef = seenCount === 0 ? row.id : `${row.id}-${seenCount}`;

    const component: Record<string, unknown> = {
      type: row.type,
      'bom-ref': bomRef,
      name: row.name,
      version: row.version,
      properties: [{ name: 'trivy:resource', value: row.resource }],
    };
    if (row.purl) {
      component.purl = row.purl;
    }
    if (row.licenses.length > 0) {
      component.licenses = row.licenses.map((license) => ({ license: { id: license } }));
    }
    if (row.supplier) {
      component.supplier = { name: row.supplier };
    }
    return component;
  });

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: {
        type: 'application',
        name: appName || 'application',
      },
    },
    components,
  };
}

export function flattenSbomReports(reports: unknown[]): SbomComponentRow[] {
  const rows: SbomComponentRow[] = [];

  for (const report of reports) {
    const resource = resourceLabelFor(report);
    const namespace = (report as any)?.metadata?.namespace;
    const application = applicationFor(report);
    const components = (report as any)?.report?.components?.components;
    if (!Array.isArray(components)) {
      continue;
    }

    for (const component of components) {
      if (!component?.name) {
        continue;
      }
      rows.push({
        id: component['bom-ref'] ?? `${component.name}@${component.version ?? 'unknown'}`,
        resource,
        namespace,
        application,
        name: component.name,
        version: component.version ?? 'unknown',
        type: (component.type ?? 'unknown').toLowerCase(),
        purl: component.purl,
        licenses: licenseNamesFor(component),
        supplier: component.supplier?.name,
      });
    }
  }

  return rows;
}
