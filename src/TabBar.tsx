import * as React from 'react';

import { REPORT_KIND_LABEL } from './trivyReport';
import { ReportTab, TAB_ICON } from './reportKinds';

interface TabBarProps {
  tabs: ReportTab[];
  activeTab: ReportTab;
  onSelect: (tab: ReportTab) => void;
}

/**
 * Tab row shared by the per-application and cluster-wide Trivy Insights
 * screens - same buttons, sliding indicator and roving-tabindex keyboard nav
 * in both places.
 */
export const TabBar: React.FC<TabBarProps> = ({ tabs, activeTab, onSelect }) => {
  const tabRefs = React.useRef<Partial<Record<ReportTab, HTMLButtonElement | null>>>({});
  const [indicatorStyle, setIndicatorStyle] = React.useState<{ left: number; width: number }>({
    left: 0,
    width: 0,
  });

  const updateIndicator = React.useCallback(() => {
    const activeEl = tabRefs.current[activeTab];
    if (!activeEl) {
      return;
    }
    setIndicatorStyle({ left: activeEl.offsetLeft, width: activeEl.offsetWidth });
  }, [activeTab]);

  // tabs is also a dependency because the underlying data loads asynchronously -
  // tabs can go from unrendered to rendered without activeTab ever changing,
  // and updateIndicator alone wouldn't otherwise be re-invoked once refs exist.
  React.useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator, tabs]);

  React.useEffect(() => {
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator]);

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
    }
    if (nextIndex !== null) {
      e.preventDefault();
      const nextTab = tabs[nextIndex];
      onSelect(nextTab);
      tabRefs.current[nextTab]?.focus();
    }
  };

  return (
    <div className="tv-nav" role="tablist" aria-label="Trivy report tabs">
      {tabs.map((tab, index) => (
        <button
          key={tab}
          type="button"
          ref={(el) => {
            tabRefs.current[tab] = el;
          }}
          id={`tv-tab-${tab}`}
          role="tab"
          aria-selected={activeTab === tab}
          aria-controls={`tv-tabpanel-${tab}`}
          tabIndex={activeTab === tab ? 0 : -1}
          className={`tv-nav-item${activeTab === tab ? ' tv-nav-item--active' : ''}`}
          onClick={() => onSelect(tab)}
          onKeyDown={(e) => handleTabKeyDown(e, index)}
        >
          <i className={`fa ${TAB_ICON[tab]} tv-nav-icon`} />
          {REPORT_KIND_LABEL[tab]}
        </button>
      ))}
      <div className="tv-nav-divider" />
      <div className="tv-nav-indicator" style={{ left: indicatorStyle.left, width: indicatorStyle.width }} />
    </div>
  );
};
