import { AppView } from './AppView';
import { SystemView } from './SystemView';

import './types';

((window: Window) => {
  window.extensionsAPI.registerAppViewExtension(
    AppView,
    'Trivy Insights',
    'fa-shield-alt'
  );
  window.extensionsAPI.registerSystemLevelExtension(
    SystemView,
    'Trivy Insights',
    '/trivy-insights',
    'fa-shield-alt'
  );
})(window);
