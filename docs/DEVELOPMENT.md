# Development Guide

## Setup

```bash
git clone https://github.com/DeWildeDaan/argo-trivy-insights.git
cd argo-trivy-insights
npm install
```

## Build Commands

| Command | Output | Purpose |
|---------|--------|---------|
| `npm run build` | `dist/resources/extension-trivy-insights.js` | Production build |
| `npm run dev` | Watch mode | Development with auto-rebuild |
| `npm run typecheck` | Type errors | Check TypeScript (separate from webpack) |
| `npm run package` | `dist/extension-trivy-insights.tar.gz` | Create release artifact |
| `npm run install:dev` | — | Build + copy to running argocd-server pod |

## Development Workflow

**Terminal 1: Watch for changes**
```bash
npm run dev
```

**Terminal 2: Install to running pod**
```bash
npm run install:dev
```

Then hard-reload the Argo CD UI (Ctrl+Shift+R) each time you want to test.

To install to a non-standard namespace:
```bash
ARGOCD_NS=my-namespace npm run install:dev
```

## Project Structure

```
src/
  index.tsx              # Registers both extensions with window.extensionsAPI
  AppView.tsx            # Per-application security view
  SystemView.tsx         # Cluster-wide security dashboard
  
  # Shared components
  TabBar.tsx             # Tab navigation shared by AppView and SystemView
  ReportDashboard.tsx    # Main report container
  
  # Report views (one per Trivy Operator report type)
  OverviewView.tsx       # Summary stats
  VulnerabilityReportView.tsx
  ExposedSecretReportView.tsx
  ChecksReportView.tsx   # Config audit + RBAC assessment
  SbomReportView.tsx     # Software bill of materials
  
  # Report data models
  trivyReport.ts         # Shared types and constants
  reportKinds.ts         # Report type definitions
  vulnerabilityReport.ts # Vulnerability parsing logic
  exposedSecretReport.ts
  checksReport.ts
  sbomReport.ts
  
  # Utilities
  api.ts                 # fetchManifest, fetchApplications (Argo API helpers)
  urlState.ts            # URL search params (filter/sorting state)
  overviewStats.ts       # Summary calculations
  reportFetchQueue.ts    # Batch fetch with concurrency control
  exportUtils.ts         # CSV/JSON export helpers
  
  # Styling
  AppView.css
  OverviewView.css
  ReportDashboard.css
  SbomReportView.css
  css.d.ts               # CSS module types
  
  types.ts               # Argo CD extension API types

scripts/
  dev-install.sh         # kubectl cp replacement: builds + pipes to pod
  
webpack.config.js        # React configured as external (provided by Argo CD)
```

## Adding a New Report Type

1. **Create a report model** (e.g., `src/newReport.ts`)
   - Define types matching the Trivy Operator CRD
   - Export parsing/aggregation logic

2. **Create a view** (e.g., `src/NewReportView.tsx`)
   - Accept `reports` and filter props
   - Render table or summary

3. **Add to TabBar**
   - Register in `reportKinds.ts`
   - Add tab to `TabBar.tsx` switch statement

4. **Update both views**
   - `AppView.tsx`: fetch and display
   - `SystemView.tsx`: same, with namespace/app columns


## Testing the Build Output

Verify your build is valid:
```bash
# Check filename matches pattern
ls -la dist/resources/ | grep extension

# Check tarball structure
tar -tzf dist/extension-trivy-insights.tar.gz | head -5
# Should show: resources/extension-trivy-insights.js ...
```

## Release

`release.yaml` is manual (`workflow_dispatch`). It tags from the `version` field
in `package.json`, so bump that first — the workflow fails early if a release for
that version already exists.

It publishes two assets:

- `extension-trivy-insights.tar.gz`
- `extension-trivy-insights_checksums.txt`

The checksum file lists the bare filename, because the installer looks entries up
by exact basename match when `EXTENSION_CHECKSUM_URL` is set.

Release notes are generated with `gh release create --generate-notes`. To use a
hand-written changelog instead, add a `CHANGELOG.md` and swap that flag for
`-F CHANGELOG.md`.

## Known Issues

### 1. Argo CD 3.5+: system-level extension silently missing from sidebar
#### Issue
On Argo CD 3.5.0+, `registerSystemLevelExtension` can be a no-op with **zero
console errors**, no sidebar item, no route, nothing. You can follow progress in the created [ArgoCD GitHub issue](https://github.com/argoproj/argo-cd/issues/29095)
#### Sustpected root cause 
3.5.0 switched the UI shell's mount from `ReactDOM.render()` (synchronous, React 16)
to `ReactDOM.createRoot().render()` (React 18/19). If your extension's
`<script defer>` runs before Argo CD's `App` component has finished mounting
and subscribed its internal `'systemLevel'` event listener, the registration
event fires into a void and is dropped, nothing replays it later.
`registerAppViewExtension` is unaffected because it's read from a plain array
on demand rather than delivered via a one-shot event.
#### Workaround 
Applied in `src/index.tsx`: `registerSystemLevelExtension` is
called via `setTimeout(..., 0)` so it runs on the next macrotask, after the
shell's initial mount has had a chance to complete. Tracked upstream at