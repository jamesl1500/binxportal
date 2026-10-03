/**
 * PortalOnboardingProvider.tsx
 *
 * The client portal's onboarding state — whether the welcome tour is open,
 * and which one-time hints/checklist steps the client has already seen —
 * seeded server-side by (portal)/layout.tsx from getTutorialProgress().
 *
 * Deliberately separate from the staff TutorialProvider: that one's
 * `tour_completed` flag is the *staff* welcome tour. The portal keys its own
 * state as ids in the shared `dismissed_popups` list (see PORTAL_TOUR_ID and
 * friends in lib/portal-insights.ts) and passes `tour_completed` straight
 * back through untouched, so the two never trample each other.
 *
 * Changes persist in the background via updateTutorialProgressAction — no
 * loading state, since a failed save only means a hint shows again next
 * visit.
 *
 * @module apps/binx-web/src/components/portal/PortalOnboardingProvider/PortalOnboardingProvider.tsx
 * @author Binx Portal
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { updateTutorialProgressAction } from "@/app/(app)/actions";
import { PORTAL_TOUR_ID } from "@/lib/portal-insights";
import type { TutorialProgress } from "@/lib/users";

interface PortalOnboardingContextValue {
  isTourOpen: boolean;
  openTour: () => void;
  /** Closes the tour and records it as seen. */
  finishTour: () => void;
  dismissed: string[];
  isDismissed: (id: string) => boolean;
  dismiss: (id: string) => void;
}

const PortalOnboardingContext =
  createContext<PortalOnboardingContextValue | null>(null);

interface PortalOnboardingProviderProps {
  initialProgress: TutorialProgress;
  children: React.ReactNode;
}

const PortalOnboardingProvider = ({
  initialProgress,
  children,
}: PortalOnboardingProviderProps) => {
  const [dismissed, setDismissed] = useState<string[]>(
    initialProgress.dismissed_popups,
  );
  // Opens on the very first render for a client who's never seen it —
  // server-seeded, so it matches the first client render with no effect.
  const [isTourOpen, setIsTourOpen] = useState(
    () => !initialProgress.dismissed_popups.includes(PORTAL_TOUR_ID),
  );

  // Skip the first run — that's the server-seeded value, not a change.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    void updateTutorialProgressAction({
      tour_completed: initialProgress.tour_completed,
      dismissed_popups: dismissed,
    });
  }, [dismissed, initialProgress.tour_completed]);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const value = useMemo<PortalOnboardingContextValue>(
    () => ({
      isTourOpen,
      openTour: () => setIsTourOpen(true),
      finishTour: () => {
        setIsTourOpen(false);
        dismiss(PORTAL_TOUR_ID);
      },
      dismissed,
      isDismissed: (id: string) => dismissed.includes(id),
      dismiss,
    }),
    [isTourOpen, dismissed, dismiss],
  );

  return (
    <PortalOnboardingContext.Provider value={value}>
      {children}
    </PortalOnboardingContext.Provider>
  );
};

export function usePortalOnboarding(): PortalOnboardingContextValue {
  const context = useContext(PortalOnboardingContext);
  if (!context) {
    throw new Error(
      "usePortalOnboarding must be used within a PortalOnboardingProvider",
    );
  }
  return context;
}

/** For components that also render outside the portal shell (and in tests). */
export function useOptionalPortalOnboarding(): PortalOnboardingContextValue | null {
  return useContext(PortalOnboardingContext);
}

export default PortalOnboardingProvider;
