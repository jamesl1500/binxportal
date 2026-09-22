/**
 * DashboardWidgetGrid.tsx
 *
 * The dashboard Overview's customizable widget grid — "Needs attention",
 * "Recent activity", "Upcoming meetings", "My tasks", and "Quick actions".
 * Staff can reorder widgets (native HTML5 drag-and-drop, same pattern as
 * KanbanBoard's column/card dragging) and hide the ones they don't use,
 * persisted per-user via `updateDashboardLayoutAction`. All widget data is
 * passed in already-fetched from the page's single dashboard-overview
 * request — this component only decides which widgets show and in what
 * order, it never fetches on its own.
 *
 * @module apps/binx-web/src/components/dashboard/DashboardWidgetGrid/DashboardWidgetGrid.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Eye, EyeOff, GripVertical, Settings2 } from "lucide-react";

import { updateDashboardLayoutAction } from "@/app/(app)/dashboard/actions";
import {
  DASHBOARD_WIDGET_IDS,
  DASHBOARD_WIDGET_META,
  type DashboardWidgetId,
  normalizeWidgetOrder,
} from "@/components/dashboard/widgets";
import ActivityTeaser from "@/components/dashboard/ActivityTeaser/ActivityTeaser";
import AttentionCard from "@/components/dashboard/AttentionCard/AttentionCard";
import MyTasksCard from "@/components/dashboard/MyTasksCard/MyTasksCard";
import QuickActionsCard from "@/components/dashboard/QuickActionsCard/QuickActionsCard";
import UpcomingMeetingsCard from "@/components/meetings/UpcomingMeetingsCard/UpcomingMeetingsCard";
import type { ActivityEntry } from "@/lib/activity";
import type { MyTask } from "@/lib/dashboard";
import type { Invoice } from "@/lib/invoicing";
import type { Meeting } from "@/lib/meetings";
import type { Project } from "@/lib/projects";

import styles from "./DashboardWidgetGrid.module.scss";

interface DashboardWidgetGridProps {
  initialOrder: string[];
  initialHidden: string[];
  overdueInvoices: Invoice[];
  overdueTaskCount: number;
  onHoldProjects: Project[];
  activity: ActivityEntry[];
  meetings: Meeting[];
  myTasks: MyTask[];
}

const DashboardWidgetGrid = ({
  initialOrder,
  initialHidden,
  overdueInvoices,
  overdueTaskCount,
  onHoldProjects,
  activity,
  meetings,
  myTasks,
}: DashboardWidgetGridProps) => {
  const [, startTransition] = useTransition();
  const [order, setOrder] = useState<DashboardWidgetId[]>(() => normalizeWidgetOrder(initialOrder));
  const [hidden, setHidden] = useState<Set<DashboardWidgetId>>(
    () => new Set(initialHidden.filter((id): id is DashboardWidgetId => (DASHBOARD_WIDGET_IDS as readonly string[]).includes(id))),
  );
  const [customizing, setCustomizing] = useState(false);
  const [draggedId, setDraggedId] = useState<DashboardWidgetId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const persist = (nextOrder: DashboardWidgetId[], nextHidden: Set<DashboardWidgetId>) => {
    setError(null);
    startTransition(async () => {
      const result = await updateDashboardLayoutAction(nextOrder, Array.from(nextHidden));
      if (result.error) setError(result.error);
    });
  };

  const toggleHidden = (id: DashboardWidgetId) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHidden(next);
    persist(order, next);
  };

  const reset = () => {
    setOrder([...DASHBOARD_WIDGET_IDS]);
    setHidden(new Set());
    persist([...DASHBOARD_WIDGET_IDS], new Set());
  };

  const handleDrop = (targetId: DashboardWidgetId) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    const next = order.filter((id) => id !== draggedId);
    const targetIndex = next.indexOf(targetId);
    next.splice(targetIndex, 0, draggedId);
    setOrder(next);
    setDraggedId(null);
    persist(next, hidden);
  };

  const widgetBody = (id: DashboardWidgetId) => {
    switch (id) {
      case "my_tasks":
        return <MyTasksCard tasks={myTasks} limit={5} />;
      case "needs_attention":
        return (
          <AttentionCard
            overdueInvoices={overdueInvoices}
            overdueTaskCount={overdueTaskCount}
            onHoldProjects={onHoldProjects}
          />
        );
      case "quick_actions":
        return <QuickActionsCard />;
      case "recent_activity":
        return <ActivityTeaser entries={activity} />;
      case "upcoming_meetings":
        return <UpcomingMeetingsCard meetings={meetings} limit={5} moreHref="/meetings" showClient showProject />;
    }
  };

  const visibleOrder = customizing ? order : order.filter((id) => !hidden.has(id));

  return (
    <div>
      <div className={styles.toolbar}>
        {error && <span className={styles.error}>{error}</span>}
        {customizing && (
          <button type="button" className={styles.resetButton} onClick={reset}>
            Reset to default
          </button>
        )}
        <button
          type="button"
          className={styles.customizeButton}
          onClick={() => setCustomizing((value) => !value)}
          aria-pressed={customizing}
        >
          {customizing ? <Check aria-hidden="true" /> : <Settings2 aria-hidden="true" />}
          {customizing ? "Done" : "Customize"}
        </button>
      </div>

      <div className={styles.grid}>
        {visibleOrder.map((id) => {
          const meta = DASHBOARD_WIDGET_META[id];
          const isHidden = hidden.has(id);
          return (
            <section
              key={id}
              className={styles.section}
              data-dragging={draggedId === id}
              draggable={customizing}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", id);
                setDraggedId(id);
              }}
              onDragOver={(event) => {
                if (!draggedId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop(id);
              }}
              onDragEnd={() => setDraggedId(null)}
            >
              <div className={styles.sectionHead}>
                {customizing && (
                  <span className={styles.dragHandle} aria-hidden="true">
                    <GripVertical />
                  </span>
                )}
                <h2 className={styles.sectionTitle}>{meta.title}</h2>
                {customizing ? (
                  <button
                    type="button"
                    className={styles.visibilityToggle}
                    onClick={() => toggleHidden(id)}
                    aria-label={isHidden ? `Show ${meta.title}` : `Hide ${meta.title}`}
                    aria-pressed={isHidden}
                  >
                    {isHidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                ) : (
                  meta.viewAllHref && (
                    <Link href={meta.viewAllHref} className={styles.link}>
                      View all
                    </Link>
                  )
                )}
              </div>

              {isHidden && customizing ? (
                <p className={styles.hiddenNotice}>Hidden from your dashboard.</p>
              ) : (
                widgetBody(id)
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default DashboardWidgetGrid;
