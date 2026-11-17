/**
 * useTouchRowGestures.ts
 *
 * Tap and long-press for a list row on the board canvas, for touch and pen
 * only. Mouse input is ignored entirely, so desktop keeps its own affordances
 * (checkbox click, double-click to rename, the "⋯" button).
 *
 * The canvas makes this fiddly in three ways:
 * - A press on a card's plain area also starts a (thresholded) card drag, and
 *   the browser still fires `click` after the drag ends. So a "tap" only
 *   counts if the release point is within TAP_SLOP_PX of the press: the
 *   canvas's own drag threshold, so anything that moved the card is never a
 *   tap.
 * - Presses that start on an interactive element (the checkbox, menu
 *   controls, the rename input) belong to that element and are ignored here,
 *   so a tap on the checkbox doesn't toggle twice.
 * - A long press opens a menu. The `click` that follows lifting the finger
 *   must not also count as a tap, and the platform's own long-press context
 *   menu / text-selection callout is suppressed.
 *
 * @module apps/binx-web/src/hooks/useTouchRowGestures.ts
 */
import { useEffect, useRef } from "react";

import { isInteractiveTarget } from "@/components/boards/BoardCanvas/BoardCanvasContext";

/** Matches BoardCanvas's DRAG_THRESHOLD: past this, the press moved a card. */
export const TAP_SLOP_PX = 4;
/** Long enough not to fire during a normal tap, short enough to feel instant. */
export const LONG_PRESS_MS = 500;

interface Press {
  x: number;
  y: number;
  timer: ReturnType<typeof setTimeout> | null;
  long: boolean;
  moved: boolean;
  /** Removes the window-level move listener. */
  stopTracking: () => void;
}

export interface TouchRowGestureOptions {
  /** False disables both gestures (e.g. a read-only viewer). */
  enabled: boolean;
  onTap: () => void;
  onLongPress: () => void;
}

export interface TouchRowGestureHandlers {
  /** Spread onto the row element. */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onClick: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
  };
  /** Whether the most recent press on the row was touch/pen — lets mouse-only
   * affordances (double-click to rename) opt out on touch. */
  isTouchInput: () => boolean;
}

const far = (a: { x: number; y: number }, x: number, y: number) =>
  Math.hypot(x - a.x, y - a.y) > TAP_SLOP_PX;

export function useTouchRowGestures({
  enabled,
  onTap,
  onLongPress,
}: TouchRowGestureOptions): TouchRowGestureHandlers {
  const press = useRef<Press | null>(null);
  // Latest callbacks without re-creating the timer closure on every render.
  const callbacks = useRef({ onTap, onLongPress });
  useEffect(() => {
    callbacks.current = { onTap, onLongPress };
  });

  // Ends the timer and the move tracking; the press itself is kept so the
  // `click` that follows can still be judged.
  const settle = () => {
    const p = press.current;
    if (!p) return;
    if (p.timer) clearTimeout(p.timer);
    p.timer = null;
    p.stopTracking();
  };

  useEffect(() => settle, []);

  const lastPointerType = useRef<string | null>(null);

  const handlers: TouchRowGestureHandlers["handlers"] = {
    onPointerDown: (e) => {
      lastPointerType.current = e.pointerType;
      settle();
      press.current = null;
      if (!enabled || e.pointerType === "mouse" || isInteractiveTarget(e.target)) return;
      // Tracked on window, not the row: once the card starts dragging, the
      // row isn't guaranteed to receive the moves.
      const onMove = (m: PointerEvent) => {
        if (m.pointerId !== e.pointerId || p.moved || !far(p, m.clientX, m.clientY)) return;
        p.moved = true;
        settle();
      };
      const p: Press = {
        x: e.clientX,
        y: e.clientY,
        timer: null,
        long: false,
        moved: false,
        stopTracking: () => window.removeEventListener("pointermove", onMove),
      };
      window.addEventListener("pointermove", onMove);
      p.timer = setTimeout(() => {
        p.timer = null;
        p.long = true;
        p.stopTracking();
        callbacks.current.onLongPress();
      }, LONG_PRESS_MS);
      press.current = p;
    },
    onPointerUp: settle,
    onPointerCancel: () => {
      settle();
      press.current = null;
    },
    onClick: (e) => {
      const p = press.current;
      press.current = null;
      if (!p || p.long || p.moved || far(p, e.clientX, e.clientY)) return;
      if (isInteractiveTarget(e.target)) return;
      callbacks.current.onTap();
    },
    onContextMenu: (e) => {
      // Android fires contextmenu on long press; that's our gesture now.
      if (press.current) e.preventDefault();
    },
  };

  return {
    handlers,
    isTouchInput: () => lastPointerType.current === "touch" || lastPointerType.current === "pen",
  };
}
