# Installation Guide

## Prerequisites

- Argo CD 2.6+ (UI extensions support required)
- [Trivy Operator](https://aquasecurity.github.io/trivy-operator/) installed on your cluster
- `kubectl` access to your cluster (for dev/local testing)

## Helm

This is the recommended approach for production deployments. Argo CD's extension installer handles checksums and updates automatically.

### Add to Helm Values

```yaml
server:
  extensions:
    enabled: true
    extensionList:
      - name: trivy-insights
        env:
          - name: EXTENSION_URL
            value: https://github.com/DeWildeDaan/argo-trivy-insights/releases/download/latest/extension-trivy-insights.tar.gz
          - name: EXTENSION_CHECKSUM_URL
            value: https://github.com/DeWildeDaan/argo-trivy-insights/releases/download/latest/extension-trivy-insights_checksums.txt
```

Or replace `latest` with the release version you want. I would recooment to pass a specific version to pin the extention for stability and security purposes.

## Development (Local Testing)

For rapid iteration without cutting a release or local development.

### 1. Build the Extension

```bash
npm install
npm run build
```

### 2. Install to Running Pod

```bash
npm run install:dev
```

Hard-reload the Argo CD UI (Ctrl+Shift+R). The extension should appear.

To install to a non-standard namespace:
```bash
ARGOCD_NS=my-namespace npm run install:dev
```

### 3. Iterate

Each time you change code:
```bash
npm run dev      # Watch mode
npm run install:dev  # Copy to pod
# Ctrl+Shift+R to reload
```

⚠️ **Important:** The extension is written to the pod's `/tmp`, so it's lost on pod restart. For persistent testing, use Helm instead.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Extension doesn't appear in UI | Hard-reload browser (Ctrl+Shift+R), check browser console (F12) for errors |
| Old version still showing | Clear browser cache (Ctrl+Shift+Delete), pod may need to restart if using Helm |
| `/extensions.js` doesn't contain extension | Check pod logs: `kubectl -n argocd logs -f deploy/argocd-server` |
