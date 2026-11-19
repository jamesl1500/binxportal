/**
 * FeedbackProvider.tsx
 *
 * Owns the one "Share feedback" dialog for a shell — mounted by both the
 * (app) and (portal) layouts — so anything inside can open it with
 * `useFeedback().openFeedback()`: the header launcher, the portal sidebar's
 * help card, the "Your feedback" pages, and the check-in pulse's "tell us
 * more". It also carries the surface/agency context every submission needs.
 *
 * @module apps/binx-web/src/components/feedback/FeedbackProvider/FeedbackProvider.tsx
 * @author Binx Portal
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import FeedbackDialog from "@/components/feedback/FeedbackDialog/FeedbackDialog";
import type { FeedbackKind, FeedbackSurface } from "@/lib/feedback-client";

export interface FeedbackContextValue {
  surface: FeedbackSurface;
  agencyId: string | null;
  /** The agency whose portal this is — named in the portal's dialog copy. */
  agencyName: string | null;
  openFeedback: (kind?: FeedbackKind) => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

interface FeedbackProviderProps {
  surface: FeedbackSurface;
  agencyId?: string | null;
  agencyName?: string | null;
  children: React.ReactNode;
}

const FeedbackProvider = ({
  surface,
  agencyId = null,
  agencyName = null,
  children,
}: FeedbackProviderProps) => {
  const [open, setOpen] = useState(false);
  const [initialKind, setInitialKind] = useState<FeedbackKind | undefined>();
  // Bumped on every open (not close, so the exit transition still plays) —
  // the dialog's key, so each session starts with an empty form.
  const [session, setSession] = useState(0);

  const openFeedback = useCallback((kind?: FeedbackKind) => {
    setInitialKind(kind);
    setSession((n) => n + 1);
    setOpen(true);
  }, []);

  const value = useMemo(
    () => ({ surface, agencyId, agencyName, openFeedback }),
    [surface, agencyId, agencyName, openFeedback],
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <FeedbackDialog
        key={session}
        open={open}
        onOpenChange={setOpen}
        initialKind={initialKind}
        surface={surface}
        agencyId={agencyId}
        agencyName={agencyName}
      />
    </FeedbackContext.Provider>
  );
};

export function useFeedback(): FeedbackContextValue {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error("useFeedback must be used within a FeedbackProvider");
  }
  return context;
}

/** For components that also render outside a FeedbackProvider. */
export function useOptionalFeedback(): FeedbackContextValue | null {
  return useContext(FeedbackContext);
}

export default FeedbackProvider;
