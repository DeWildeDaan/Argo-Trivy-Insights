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
            value: https://github.com/DeWildeDaan/argo-trivy-insights/releases/latest/download/extension-trivy-insights.tar.gz
          - name: EXTENSION_CHECKSUM_URL
            value: https://github.com/DeWildeDaan/argo-trivy-insights/releases/latest/download/extension-trivy-insights_checksums.txt
```

Or replace `latest` with the release version you want. I would recommend to pass a specific version to pin the extention for stability and security purposes.

## Init container

If you deploy and manage ArgoCD via the official Helm chart and ArgoCD manages itself i would recommend the approach above since the helm chart wil do the steps we are doing here for you.
If you deployed ArgoCD once with the helm chart and ArgoCD does **not** manage itself, you can take this approach.

### 1. Create a patch yaml file

```yaml
spec:
  template:
    spec:
      initContainers:
        - name: extension-trivy-insights
          image: quay.io/argoprojlabs/argocd-extension-installer:v0.0.1
          env:
            - name: EXTENSION_URL
              value: https://github.com/DeWildeDaan/argo-trivy-insights/releases/latest/download/extension-trivy-insights.tar.gz
            - name: EXTENSION_CHECKSUM_URL
              value: https://github.com/DeWildeDaan/argo-trivy-insights/releases/latest/download/extension-trivy-insights_checksums.txt
          volumeMounts:
            - name: extensions
              mountPath: /tmp/extensions/
          securityContext:
            runAsUser: 1000
            allowPrivilegeEscalation: false
      containers:
        - name: argocd-server
          volumeMounts:
            - name: extensions
              mountPath: /tmp/extensions/
      volumes:
        - name: extensions
          emptyDir: {}
```

Or replace `latest` with the release version you want. I would recommend to pass a specific version to pin the extention for stability and security purposes.

### 2. Apply the changes to your ArgoCD server dpeloyment

```bash
kubectl patch deployment {argocd-server-pod} -n {argocd-server-namespace} \
  --type merge \
  --patch-file argocd-extensions-patch.yaml
```

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
