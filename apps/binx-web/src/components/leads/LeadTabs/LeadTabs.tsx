/**
 * LeadTabs.tsx
 *
 * Tab strip + panels for the lead detail page's main column: Details,
 * Timeline, and AI analysis. The panels' content is server-rendered by the
 * page and passed in as slots; this component only owns which one is showing.
 *
 * Every panel stays mounted (inactive ones are just `hidden`) so half-edited
 * details form state survives a trip to another tab. The active tab is mirrored
 * to the URL hash (`#timeline`, `#ai`) so it survives a refresh and can be
 * linked to; an unknown or absent hash falls back to Details.
 *
 * @module apps/binx-web/src/components/leads/LeadTabs/LeadTabs.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useState, type ReactNode } from "react";

import styles from "./LeadTabs.module.scss";

type TabId = "details" | "timeline" | "ai";

interface LeadTabsProps {
  details: ReactNode;
  timeline: ReactNode;
  analysis: ReactNode;
  /** Badge on the Timeline tab — how many events the lead has. */
  eventCount?: number;
}

const LeadTabs = ({ details, timeline, analysis, eventCount = 0 }: LeadTabsProps) => {
  const tabs: { id: TabId; label: string; panel: ReactNode; count?: number }[] = [
    { id: "details", label: "Details", panel: details },
    { id: "timeline", label: "Timeline", panel: timeline, count: eventCount },
    { id: "ai", label: "AI analysis", panel: analysis },
  ];

  const [active, setActive] = useState<TabId>("details");

  // Read the initial tab from the URL hash on mount, and follow hash history.
  useEffect(() => {
    const sync = () => {
      const fromHash = window.location.hash.replace("#", "");
      if (tabs.some((tab) => tab.id === fromHash)) setActive(fromHash as TabId);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tab ids are static
  }, []);

  const select = (id: TabId) => {
    setActive(id);
    // replaceState, not a real navigation — no scroll jump, no history spam.
    window.history.replaceState(null, "", id === "details" ? window.location.pathname : `#${id}`);
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.tabs} role="tablist" aria-label="Lead sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`lead-tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`lead-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            className={styles.tab}
            data-active={active === tab.id}
            onClick={() => select(tab.id)}
          >
            {tab.label}
            {tab.count ? <span className={styles.badge}>{tab.count}</span> : null}
          </button>
        ))}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`lead-panel-${tab.id}`}
          aria-labelledby={`lead-tab-${tab.id}`}
          className={styles.panel}
          hidden={active !== tab.id}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
};

export default LeadTabs;
