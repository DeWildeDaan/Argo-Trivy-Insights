# Argo-Trivy-Insights

An Argo CD [App View UI extension](https://argo-cd.readthedocs.io/en/stable/developer-guide/extensions/ui-extensions/#app-view-extensions)
that adds a **Trivy Insights** view to the Application Details page, next to the
Tree / Pods / Network views.

Currently a placeholder — the view renders an empty page.

## Layout

```
src/
  index.tsx    # registers the extension with window.extensionsAPI
  AppView.tsx  # the view component (empty page for now)
  types.ts     # local typings for the Argo CD extensions API
webpack.config.js
```

React is **not** bundled — Argo CD provides it as the `React` global, so it is
declared as a webpack `external`.

## Build

```bash
npm install
npm run build      # -> dist/resources/extension-trivy-insights.js
npm run dev        # watch mode
npm run typecheck
npm run package    # -> dist/extension-trivy-insights.tar.gz
```

The output filename must match `^extension(.*)\.js$`, otherwise Argo CD will
not load it.

## Install into Argo CD

Argo CD loads every matching `.js` file it finds under `/tmp/extensions` in the
`argocd-server` pods.

### Quick local test

```bash
kubectl cp dist/resources/extension-trivy-insights.js \
  argocd/<argocd-server-pod>:/tmp/extensions/trivy-insights/extension-trivy-insights.js
```

Then hard-reload the Argo CD UI (extensions are loaded on initial page render).

### Proper install

Publish `dist/extension-trivy-insights.tar.gz` (e.g. as a GitHub release asset)
and use the [argocd-extension-installer](https://github.com/argoproj-labs/argocd-extension-installer)
init container on the `argocd-server` deployment:

```yaml
initContainers:
  - name: trivy-insights-extension
    image: quay.io/argoprojlabs/argocd-extension-installer:v0.0.8
    env:
      - name: EXTENSION_URL
        value: https://github.com/<org>/Argo-Trivy-Insights/releases/download/v0.1.0/extension-trivy-insights.tar.gz
    volumeMounts:
      - name: extensions
        mountPath: /tmp/extensions/
    securityContext:
      runAsUser: 1000
      allowPrivilegeEscalation: false
```

with a shared `extensions` `emptyDir` volume mounted at `/tmp/extensions/` in
the `argocd-server` container.

## Registration

```ts
window.extensionsAPI.registerAppViewExtension(
  AppView,            // component
  'Trivy Insights',   // title
  'fa-shield-alt'     // FontAwesome icon class for the tab
  // optional 4th arg: (app) => boolean — gate which apps show the view
);
```
