/**
 * TutorialProvider.tsx
 *
 * Holds the signed-in user's tutorial state (welcome-tour completion + which
 * page popups have been dismissed) for the whole authenticated tree, seeded
 * server-side by (app)/layout.tsx via getTutorialProgress() — no localStorage
 * involved, so there's no hydration-mismatch risk and the initial value can
 * just be plain useState. A plain React Context, not one of this app's
 * zustand stores (those are reserved for live-syncing domain data like
 * boards/messaging) — this is static per-user preference state, so a
 * context is the simpler, right-sized tool.
 *
 * Every change persists in the background via updateTutorialProgressAction
 * (see the useEffect below) — no loading state, since a failed save just
 * means the hint reappears next load, an acceptably low-stakes failure mode.
 *
 * @module apps/binx-web/src/components/tutorial/TutorialProvider/TutorialProvider.tsx
 * @author Binx.io
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { updateTutorialProgressAction } from "@/app/(app)/actions";
import type { TutorialProgress } from "@/lib/users";

interface TutorialState {
  tourCompleted: boolean;
  dismissedPopups: string[];
}

interface TutorialContextValue {
  isTourOpen: boolean;
  openTour: () => void;
  closeTour: () => void;
  tourCompleted: boolean;
  markTourComplete: () => void;
  isPopupDismissed: (id: string) => boolean;
  dismissPopup: (id: string) => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

interface TutorialProviderProps {
  initialProgress: TutorialProgress;
  children: React.ReactNode;
}

const TutorialProvider = ({ initialProgress, children }: TutorialProviderProps) => {
  // Auto-opens on the first render for anyone who hasn't finished the tour
  // yet — safe as a plain initial value (not an effect) since it's seeded
  // server-side and matches the very first client render exactly, same as
  // the rest of this provider's state.
  const [isTourOpen, setIsTourOpen] = useState(() => !initialProgress.tour_completed);
  const [state, setState] = useState<TutorialState>({
    tourCompleted: initialProgress.tour_completed,
    dismissedPopups: initialProgress.dismissed_popups,
  });

  // Skip the first run — that's just the server-seeded initial value, not a
  // change that needs saving back.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    void updateTutorialProgressAction({
      tour_completed: state.tourCompleted,
      dismissed_popups: state.dismissedPopups,
    });
  }, [state]);

  const openTour = useCallback(() => setIsTourOpen(true), []);
  const closeTour = useCallback(() => setIsTourOpen(false), []);

  const markTourComplete = useCallback(() => {
    setState((prev) => (prev.tourCompleted ? prev : { ...prev, tourCompleted: true }));
  }, []);

  const dismissPopup = useCallback((id: string) => {
    setState((prev) =>
      prev.dismissedPopups.includes(id) ? prev : { ...prev, dismissedPopups: [...prev.dismissedPopups, id] },
    );
  }, []);

  const isPopupDismissed = useCallback((id: string) => state.dismissedPopups.includes(id), [state.dismissedPopups]);

  const value: TutorialContextValue = {
    isTourOpen,
    openTour,
    closeTour,
    tourCompleted: state.tourCompleted,
    markTourComplete,
    isPopupDismissed,
    dismissPopup,
  };

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
};

export function useTutorial(): TutorialContextValue {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error("useTutorial must be used within a TutorialProvider");
  }
  return context;
}

export default TutorialProvider;
