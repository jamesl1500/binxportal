/**
 * ProjectDashboardGrid.tsx
 *
 * The project dashboard's customizable widget grid. Each staff member picks
 * which widgets show, in what order (drag-and-drop, or the arrow buttons for
 * keyboard users), and whether each spans one column or the full width —
 * persisted per-user via `updateProjectDashboardLayoutAction`, so the same
 * layout follows them to every project.
 *
 * Widget bodies are rendered by the (server) page and passed in as slots;
 * the page only builds bodies for visible widgets, so un-hiding one
 * refreshes the route to fetch it. This component never fetches on its own.
 *
 * @module apps/binx-web/src/components/projects/ProjectDashboardGrid/ProjectDashboardGrid.tsx
 * @author Binx.io
 */
"use client";

import { type ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  GripVertical,
  Maximize2,
  Minimize2,
  Settings2,
} from "lucide-react";

import { updateProjectDashboardLayoutAction } from "@/app/(app)/projects/[projectId]/actions";
import {
  DEFAULT_HIDDEN_PROJECT_WIDGETS,
  DEFAULT_WIDE_PROJECT_WIDGETS,
  knownProjectWidgetIds,
  normalizeProjectWidgetOrder,
  PROJECT_WIDGET_IDS,
  PROJECT_WIDGET_META,
  type ProjectWidgetId,
} from "./widgets";

import styles from "./ProjectDashboardGrid.module.scss";

interface ProjectDashboardGridProps {
  initialOrder: string[];
  initialHidden: string[];
  initialWide: string[];
  /** Rendered bodies, keyed by widget id — only the visible ones need to be present. */
  widgets: Partial<Record<ProjectWidgetId, ReactNode>>;
  /** Optional header slot per widget (e.g. an "Open board" link or a Schedule button). */
  headerActions?: Partial<Record<ProjectWidgetId, ReactNode>>;
}

const ProjectDashboardGrid = ({
  initialOrder,
  initialHidden,
  initialWide,
  widgets,
  headerActions = {},
}: ProjectDashboardGridProps) => {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [order, setOrder] = useState<ProjectWidgetId[]>(() => normalizeProjectWidgetOrder(initialOrder));
  const [hidden, setHidden] = useState<Set<ProjectWidgetId>>(() => new Set(knownProjectWidgetIds(initialHidden)));
  const [wide, setWide] = useState<Set<ProjectWidgetId>>(() => new Set(knownProjectWidgetIds(initialWide)));
  const [customizing, setCustomizing] = useState(false);
  const [draggedId, setDraggedId] = useState<ProjectWidgetId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const persist = (
    nextOrder: ProjectWidgetId[],
    nextHidden: Set<ProjectWidgetId>,
    nextWide: Set<ProjectWidgetId>,
    { refresh = false } = {},
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await updateProjectDashboardLayoutAction(nextOrder, Array.from(nextHidden), Array.from(nextWide));
      if (result.error) {
        setError(result.error);
        return;
      }
      // A widget that was hidden on the last server render has no body yet.
      if (refresh) router.refresh();
    });
  };

  const toggleHidden = (id: ProjectWidgetId) => {
    const next = new Set(hidden);
    const showing = next.has(id);
    if (showing) next.delete(id);
    else next.add(id);
    setHidden(next);
    persist(order, next, wide, { refresh: showing && widgets[id] === undefined });
  };

  const toggleWide = (id: ProjectWidgetId) => {
    const next = new Set(wide);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setWide(next);
    persist(order, hidden, next);
  };

  const move = (id: ProjectWidgetId, delta: -1 | 1) => {
    const from = order.indexOf(id);
    const to = from + delta;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    setOrder(next);
    persist(next, hidden, wide);
  };

  const reset = () => {
    const nextOrder = [...PROJECT_WIDGET_IDS];
    const nextHidden = new Set(DEFAULT_HIDDEN_PROJECT_WIDGETS);
    const nextWide = new Set(DEFAULT_WIDE_PROJECT_WIDGETS);
    setOrder(nextOrder);
    setHidden(nextHidden);
    setWide(nextWide);
    persist(nextOrder, nextHidden, nextWide, {
      refresh: nextOrder.some((id) => !nextHidden.has(id) && widgets[id] === undefined),
    });
  };

  const handleDrop = (targetId: ProjectWidgetId) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    const next = order.filter((id) => id !== draggedId);
    next.splice(next.indexOf(targetId), 0, draggedId);
    setOrder(next);
    setDraggedId(null);
    persist(next, hidden, wide);
  };

  const visibleOrder = customizing ? order : order.filter((id) => !hidden.has(id));

  return (
    <div>
      <div className={styles.toolbar}>
        {error && (
          <span className={styles.error} role="alert">
            {error}
          </span>
        )}
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

      {customizing && (
        <p className={styles.customizeHint}>
          Drag cards (or use the arrows) to reorder, resize them, and hide what you don&apos;t need. Your layout
          applies to every project you open.
        </p>
      )}

      {visibleOrder.length === 0 ? (
        <p className={styles.emptyNotice}>Every widget is hidden. Use Customize to bring some back.</p>
      ) : (
        <div className={styles.grid} data-customizing={customizing}>
          {visibleOrder.map((id, index) => {
            const meta = PROJECT_WIDGET_META[id];
            const isHidden = hidden.has(id);
            const isWide = wide.has(id);
            return (
              <section
                key={id}
                aria-label={meta.title}
                className={styles.card}
                data-wide={isWide}
                data-hidden={isHidden}
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
                <div className={styles.cardHead}>
                  {customizing && (
                    <span className={styles.dragHandle} aria-hidden="true">
                      <GripVertical />
                    </span>
                  )}
                  <h2 className={styles.cardTitle}>{meta.title}</h2>
                  {customizing ? (
                    <div className={styles.controls}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => move(id, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${meta.title} earlier`}
                      >
                        <ArrowUp aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => move(id, 1)}
                        disabled={index === visibleOrder.length - 1}
                        aria-label={`Move ${meta.title} later`}
                      >
                        <ArrowDown aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => toggleWide(id)}
                        aria-label={isWide ? `Make ${meta.title} half width` : `Make ${meta.title} full width`}
                        aria-pressed={isWide}
                      >
                        {isWide ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => toggleHidden(id)}
                        aria-label={isHidden ? `Show ${meta.title}` : `Hide ${meta.title}`}
                        aria-pressed={isHidden}
                      >
                        {isHidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </button>
                    </div>
                  ) : (
                    headerActions[id]
                  )}
                </div>

                {customizing ? (
                  <p className={styles.customizeDescription}>
                    {isHidden ? "Hidden — " : ""}
                    {meta.description}
                  </p>
                ) : (
                  (widgets[id] ?? <p className={styles.loading}>Loading…</p>)
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProjectDashboardGrid;
