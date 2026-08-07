import { AppView } from './AppView';
import { SystemView } from './SystemView';

import './types';

const EXTENSION_NAME = 'trivy-insights';
const REGISTER_RETRY_MS = 50;
const REGISTER_TIMEOUT_MS = 10000;

function registerExtensions(): void {
  const api = window.extensionsAPI;

  try {
    api.registerAppViewExtension(
      AppView,
      'Trivy Insights',
      'fa-shield-alt'
    );
  } catch (err) {
    console.error(`[${EXTENSION_NAME}] registerAppViewExtension failed:`, err);
  }

  // Deferred: on Argo CD 3.5+ the shell mounts via ReactDOM.createRoot(), and
  // if this fires before App's constructor has subscribed its 'systemLevel'
  // listener, the registration event is emitted into a void and silently
  // dropped - no exception, no sidebar item. A macrotask delay lets the
  // initial mount finish first.
  window.setTimeout(() => {
    try {
      api.registerSystemLevelExtension(
        SystemView,
        'Trivy Insights',
        '/trivy-insights',
        'fa-shield-alt'
      );
    } catch (err) {
      console.error(`[${EXTENSION_NAME}] registerSystemLevelExtension failed:`, err);
    }
  }, 0);
}

((window: Window) => {
  if (window.extensionsAPI) {
    registerExtensions();
    return;
  }

  const start = Date.now();
  const interval = window.setInterval(() => {
    if (window.extensionsAPI) {
      window.clearInterval(interval);
      registerExtensions();
      return;
    }
    if (Date.now() - start > REGISTER_TIMEOUT_MS) {
      window.clearInterval(interval);
      console.error(`[${EXTENSION_NAME}] window.extensionsAPI never became available, giving up.`);
    }
  }, REGISTER_RETRY_MS);
})(window);
