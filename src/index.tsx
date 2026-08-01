import { AppView } from './AppView';

import './types';

((window: Window) => {
  window.extensionsAPI.registerAppViewExtension(
    AppView,
    'Trivy Insights',
    'fa-shield-alt'
  );
})(window);
