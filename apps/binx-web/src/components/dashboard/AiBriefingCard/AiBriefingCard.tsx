/**
 * AiBriefingCard.tsx
 *
 * A short, AI-written summary of what needs attention today — generated on
 * mount via `getAiBriefingAction`, with a manual "Refresh" button. Renders a
 * clean, static message instead of an error state when AI isn't configured
 * for this environment (a 503 from `check_budget_and_rate`), since that's an
 * expected, permanent state in some deployments rather than a bug.
 *
 * @module apps/binx-web/src/components/dashboard/AiBriefingCard/AiBriefingCard.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { getAiBriefingAction } from "@/app/(app)/dashboard/actions";
import AiMarkdown from "@/components/ai/AiMarkdown/AiMarkdown";

import styles from "./AiBriefingCard.module.scss";

interface AiBriefingCardProps {
  agencyId: string;
}

type Status = "loading" | "ready" | "not-configured" | "error";

const AiBriefingCard = ({ agencyId }: AiBriefingCardProps) => {
  const [status, setStatus] = useState<Status>("loading");
  const [briefing, setBriefing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setStatus("loading");
    setError(null);
    const result = await getAiBriefingAction(agencyId);
    if (result.briefing) {
      setBriefing(result.briefing);
      setStatus("ready");
    } else if (result.notConfigured) {
      setStatus("not-configured");
    } else {
      setError(result.error ?? "Unable to generate a briefing");
      setStatus("error");
    }
  };

  useEffect(() => {
    // Inline the fetch here rather than calling the `load` closure directly —
    // the setState calls at its top need to sit inside this effect's own
    // async boundary (see AiModal.tsx for the same shape) rather than run
    // synchronously in the effect body.
    void (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId]);

  if (status === "not-configured") {
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
        <button type="button" className={styles.refresh} onClick={() => void load()} disabled={status === "loading"}>
          {status === "loading" ? "Thinking…" : "Refresh"}
        </button>
      </div>

      {status === "loading" && briefing === null && <p className={styles.loadingText}>Thinking…</p>}
      {status === "error" && <p className={styles.errorText}>{error}</p>}
      {briefing && <AiMarkdown content={briefing} className={styles.body} />}
    </div>
  );
};

export default AiBriefingCard;
