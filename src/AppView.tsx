import * as React from 'react';

import { AppViewProps } from './types';

/**
 * App View extension body. Rendered as the main content of the Application
 * Details view when the user selects the Trivy Insights tab.
 *
 * Intentionally empty for now - this is the placeholder the real report
 * will be built into.
 */
export const AppView: React.FC<AppViewProps> = ({ application }) => {
  const name = application?.metadata?.name ?? 'unknown';

  return (
    <div style={{ padding: '1em' }}>
      <h4>Trivy Insights</h4>
      <p>No insights yet for application "{name}".</p>
    </div>
  );
};
