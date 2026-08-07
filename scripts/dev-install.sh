#!/usr/bin/env bash
# Copy the locally built extension straight into the running argocd-server pod(s).
#
# argocd-server re-walks /tmp/extensions on every request to /extensions.js,
# so no restart is needed - just hard-reload the browser afterwards.
# The file lives in the pod's ephemeral /tmp and is lost when the pod restarts.
#
# Usage: ARGOCD_NS=argocd ./scripts/dev-install.sh
set -euo pipefail

NS="${ARGOCD_NS:-argocd}"
BUNDLE="dist/resources/extension-trivy-insights.js"
DEST_DIR="/tmp/extensions/trivy-insights"

if [ ! -f "$BUNDLE" ]; then
  echo "==> $BUNDLE not found, building"
  npm run build
fi

mapfile -t pods < <(kubectl -n "$NS" get pods \
  -l app.kubernetes.io/name=argocd-server \
  --field-selector status.phase=Running \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}')

if [ "${#pods[@]}" -eq 0 ]; then
  echo "No running argocd-server pods found in namespace '$NS'." >&2
  echo "Set ARGOCD_NS, or check: kubectl -n $NS get pods -l app.kubernetes.io/name=argocd-server" >&2
  exit 1
fi

for pod in "${pods[@]}"; do
  kubectl -n "$NS" exec -i "$pod" -c server -- \
    sh -c "mkdir -p $DEST_DIR && cat > $DEST_DIR/extension-trivy-insights.js" < "$BUNDLE"
  echo "==> installed into $pod:$DEST_DIR"
done

echo
echo "Verify what the server is serving:"
echo "  kubectl -n $NS port-forward svc/argocd-server 8080:443 &"
echo "  curl -sk https://localhost:8080/extensions.js | grep -c 'Trivy Insights'"
echo
echo "Then hard-reload the Argo CD UI (Ctrl+Shift+R) - extensions register on page load."
