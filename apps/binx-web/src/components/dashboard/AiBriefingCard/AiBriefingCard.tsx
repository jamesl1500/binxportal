/**
 * AiBriefingCard.tsx
 *
 * A short, AI-written summary of what needs attention today. The API caches
 * it per (agency, member, day); the "Refresh" button passes `force: true` to
 * actually regenerate it. Renders a clean, static message instead of an
 * error state when AI isn't configured for this environment (a 503 from
 * `check_budget_and_rate`), since that's an expected, permanent state in some
 * deployments rather than a bug.
 *
 * Two ways in:
 * - `initial` (the dashboard): a promise the page starts during its server
 *   render. The card streams in with the page's HTML under Suspense, so a
 *   cached briefing paints with everything else instead of waiting for the
 *   JS to hydrate and then a second round trip.
 * - no `initial`: the card fetches on mount, as before.
 *
 * The Markdown renderer is code-split out of the dashboard's initial JS (it
 * server-renders with the streamed briefing either way).
 *
 * @module apps/binx-web/src/components/dashboard/AiBriefingCard/AiBriefingCard.tsx
 * @author Binx Portal
 */
"use client";

import { Suspense, use, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Sparkles } from "lucide-react";

import { getAiBriefingAction, type AiBriefingActionResult } from "@/app/(app)/dashboard/actions";

import styles from "./AiBriefingCard.module.scss";

const loadAiMarkdown = () => import("@/components/ai/AiMarkdown/AiMarkdown");

const AiMarkdown = dynamic(loadAiMarkdown);

interface AiBriefingCardProps {
  agencyId: string;
  /** The first (cache-first) result, started by the server render. */
  initial?: Promise<AiBriefingActionResult>;
}

type Status = "loading" | "ready" | "not-configured" | "error";

interface BriefingState {
  status: Status;
  briefing: string | null;
  error: string | null;
}

const LOADING: BriefingState = { status: "loading", briefing: null, error: null };

function fromResult(result: AiBriefingActionResult, previous: string | null = null): BriefingState {
  if (result.briefing) return { status: "ready", briefing: result.briefing, error: null };
  if (result.notConfigured) return { status: "not-configured", briefing: null, error: null };
  return { status: "error", briefing: previous, error: result.error ?? "Unable to generate a briefing" };
}

const BriefingView = ({ state, onRefresh }: { state: BriefingState; onRefresh?: () => void }) => {
  if (state.status === "not-configured") {
    return (
      <div className={styles.card} data-empty="true">
        <Sparkles className={styles.icon} aria-hidden="true" />
        <p className={styles.emptyText}>AI isn&apos;t configured for this environment yet.</p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.eyebrow}>
          <Sparkles className={styles.eyebrowIcon} aria-hidden="true" />
          AI briefing
        </span>
        <button
          type="button"
          className={styles.refresh}
          onClick={onRefresh}
          disabled={state.status === "loading" || !onRefresh}
        >
          {state.status === "loading" ? "Thinking…" : "Refresh"}
        </button>
      </div>

      {state.status === "loading" && state.briefing === null && <p className={styles.loadingText}>Thinking…</p>}
      {state.status === "error" && <p className={styles.errorText}>{state.error}</p>}
      {state.briefing && <AiMarkdown content={state.briefing} className={styles.body} />}
    </div>
  );
};

/** Holds the card's state; loads on mount only when there's no `first` result. */
const Briefing = ({ agencyId, first }: { agencyId: string; first: AiBriefingActionResult | null }) => {
  const [state, setState] = useState<BriefingState>(() => (first ? fromResult(first) : LOADING));

  const load = async (force: boolean) => {
    setState((current) => ({ ...current, status: "loading", error: null }));
    void loadAiMarkdown();
    let result: AiBriefingActionResult;
    try {
      result = await getAiBriefingAction(agencyId, force);
    } catch {
      // The request never reached the server (offline, tab waking from
      // sleep) — without this the card would sit on "Thinking…" forever.
      setState((current) => ({
        status: "error",
        briefing: current.briefing,
        error: "Couldn't reach the server. Try refreshing.",
      }));
      return;
    }
    setState((current) => fromResult(result, current.briefing));
  };

  useEffect(() => {
    if (first) return;
    // Inline the fetch here rather than calling the `load` closure directly —
    // the setState calls at its top need to sit inside this effect's own
    // async boundary (see AiModal.tsx for the same shape) rather than run
    // synchronously in the effect body.
    void (async () => {
      await load(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId]);

  return <BriefingView state={state} onRefresh={() => void load(true)} />;
};

const StreamedBriefing = ({ agencyId, initial }: { agencyId: string; initial: Promise<AiBriefingActionResult> }) => (
  <Briefing agencyId={agencyId} first={use(initial)} />
);

const AiBriefingCard = ({ agencyId, initial }: AiBriefingCardProps) =>
  initial ? (
    <Suspense fallback={<BriefingView state={LOADING} />}>
      <StreamedBriefing agencyId={agencyId} initial={initial} />
    </Suspense>
  ) : (
    <Briefing agencyId={agencyId} first={null} />
  );

export default AiBriefingCard;
