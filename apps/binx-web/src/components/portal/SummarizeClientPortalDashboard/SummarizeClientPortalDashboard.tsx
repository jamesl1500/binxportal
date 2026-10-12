/**
 * SummarizeClientPortalDashboard.tsx - Summarizes the client's portal dashboard
 *
 * Wraps the portal home's dashboard body with a "Summarize" toggle. Switched
 * on, the stat tiles and columns give way to the short version (see
 * buildPortalSummary): one sentence on what's waiting on the client, the few
 * most urgent things to do, and where each open project stands — so a client
 * can get the picture without reading the whole dashboard.
 *
 * The summary is derived from data the page already loaded, so the switch is
 * instant. The choice is remembered in a cookie the page reads, so a client
 * who prefers the summary lands on it next time with no flash.
 *
 * @module components/portal/SummarizeClientPortalDashboard
 * @author Binx Portal
 */
"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  LayoutDashboard,
  ListChecks,
  Receipt,
  type LucideIcon,
} from "lucide-react";

import {
  PORTAL_HOME_VIEW_COOKIE,
  projectStatusLabel,
  type PortalHomeView,
  type PortalSummary,
  type SummaryFact,
} from "@/lib/portal-insights";
import AttentionList from "@/components/portal/AttentionList/AttentionList";
import LocalTime from "@/components/portal/LocalTime/LocalTime";

import styles from "./SummarizeClientPortalDashboard.module.scss";

const FACT_ICONS: Record<SummaryFact["id"], LucideIcon> = {
  money: Receipt,
  meeting: CalendarDays,
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function rememberView(view: PortalHomeView) {
  document.cookie = `${PORTAL_HOME_VIEW_COOKIE}=${view}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

interface SummarizeClientPortalDashboardProps {
  summary: PortalSummary;
  /** The view the client last chose — from the cookie, read by the page. */
  initialView?: PortalHomeView;
  /** The full dashboard body, shown when the summary is off. */
  children: ReactNode;
}

const SummarizeClientPortalDashboard = ({
  summary,
  initialView = "full",
  children,
}: SummarizeClientPortalDashboardProps) => {
  const [view, setView] = useState<PortalHomeView>(initialView);
  const isSummary = view === "summary";

  const switchTo = (next: PortalHomeView) => {
    setView(next);
    rememberView(next);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
        <p className={styles.barText}>
          {isSummary
            ? "You're viewing the short version."
            : "A lot to take in? Get the short version."}
        </p>
        <button
          type="button"
          className={styles.summarizeButton}
          aria-pressed={isSummary}
          onClick={() => switchTo(isSummary ? "full" : "summary")}
        >
          {isSummary ? (
            <LayoutDashboard aria-hidden="true" />
          ) : (
            <ListChecks aria-hidden="true" />
          )}
          {isSummary ? "Show full dashboard" : "Summarize"}
        </button>
      </div>

      {isSummary ? (
        <section className={styles.summary} aria-labelledby="summary-title">
          <header className={styles.lead} data-tone={summary.tone}>
            <h2 id="summary-title" className={styles.eyebrow}>
              Your summary
            </h2>
            <p className={styles.headline}>{summary.headline}</p>
          </header>

          {summary.nextSteps.length > 0 && (
            <div className={styles.block}>
              <h3 className={styles.blockTitle}>What to do next</h3>
              <AttentionList items={summary.nextSteps} />
              {summary.moreSteps > 0 && (
                <button
                  type="button"
                  className={styles.more}
                  onClick={() => switchTo("full")}
                >
                  + {summary.moreSteps} more on the full dashboard
                </button>
              )}
            </div>
          )}

          {(summary.projects.length > 0 || summary.facts.length > 0) && (
            <div className={styles.block}>
              <h3 className={styles.blockTitle}>Where things stand</h3>
              <ul className={styles.rows}>
                {summary.projects.map((project) => (
                  <li key={project.id}>
                    <Link href={project.href} className={styles.row}>
                      <span className={styles.rowMain}>
                        <span className={styles.rowTitle}>{project.name}</span>
                        <span className={styles.rowMeta}>
                          {projectStatusLabel(project.status)}
                          {project.due && (
                            <span data-tone={project.due.tone}>
                              {" · "}
                              {project.due.label}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className={styles.progress}>
                        {/* Decorative — the percentage beside it is the text. */}
                        <span className={styles.progressBar} aria-hidden="true">
                          <span
                            className={styles.progressFill}
                            style={{ width: `${project.percent}%` }}
                          />
                        </span>
                        <span className={styles.percent}>
                          {project.percent}%
                        </span>
                      </span>
                      <ChevronRight
                        className={styles.chevron}
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
                {summary.moreProjects > 0 && (
                  <li>
                    <Link href="/portal/projects" className={styles.row}>
                      <span className={styles.rowMain}>
                        <span className={styles.rowMeta}>
                          + {summary.moreProjects} more project
                          {summary.moreProjects === 1 ? "" : "s"}
                        </span>
                      </span>
                      <ChevronRight
                        className={styles.chevron}
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                )}
                {summary.facts.map((fact) => {
                  const Icon = FACT_ICONS[fact.id];
                  return (
                    <li key={fact.id}>
                      <Link
                        href={fact.href}
                        className={styles.row}
                        data-tone={fact.tone}
                      >
                        <Icon className={styles.factIcon} aria-hidden="true" />
                        <span className={styles.rowMain}>
                          <span className={styles.rowTitle}>{fact.text}</span>
                          {fact.at && (
                            <LocalTime
                              iso={fact.at}
                              className={styles.rowMeta}
                            />
                          )}
                        </span>
                        <ChevronRight
                          className={styles.chevron}
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      ) : (
        children
      )}
    </div>
  );
};

export default SummarizeClientPortalDashboard;
