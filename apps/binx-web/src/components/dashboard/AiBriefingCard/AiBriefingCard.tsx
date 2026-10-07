/**
 * AiBriefingCard.tsx
 *
 * A short, AI-written summary of what needs attention today — loaded on
 * mount via `getAiBriefingAction`. The API caches this per (agency, member,
 * day), so mounting the card again later the same day is free and instant;
 * the "Refresh" button passes `force: true` to actually regenerate it.
 * Renders a clean, static message instead of an error state when AI isn't
 * configured for this environment (a 503 from `check_budget_and_rate`),
 * since that's an expected, permanent state in some deployments rather than
 * a bug.
 *
 * The Markdown renderer is code-split out of the dashboard's initial JS; its
 * chunk starts loading alongside the briefing request, so it's ready well
 * before the (much slower) AI response arrives.
 *
 * @module apps/binx-web/src/components/dashboard/AiBriefingCard/AiBriefingCard.tsx
 * @author Binx Portal
 */
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Sparkles } from "lucide-react";

import { getAiBriefingAction } from "@/app/(app)/dashboard/actions";

import styles from "./AiBriefingCard.module.scss";

const loadAiMarkdown = () => import("@/components/ai/AiMarkdown/AiMarkdown");

const AiMarkdown = dynamic(loadAiMarkdown);

interface AiBriefingCardProps {
  agencyId: string;
}

type Status = "loading" | "ready" | "not-configured" | "error";

const AiBriefingCard = ({ agencyId }: AiBriefingCardProps) => {
  const [status, setStatus] = useState<Status>("loading");
  const [briefing, setBriefing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (force = false) => {
    setStatus("loading");
    setError(null);
    void loadAiMarkdown();
    const result = await getAiBriefingAction(agencyId, force);
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
        <p className={styles.emptyText}>
          AI isn&apos;t configured for this environment yet.
        </p>
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
          onClick={() => void load(true)}
          disabled={status === "loading"}
        >
          {status === "loading" ? "Thinking…" : "Refresh"}
        </button>
      </div>

      {status === "loading" && briefing === null && (
        <p className={styles.loadingText}>Thinking…</p>
      )}
      {status === "error" && <p className={styles.errorText}>{error}</p>}
      {briefing && <AiMarkdown content={briefing} className={styles.body} />}
    </div>
  );
};

export default AiBriefingCard;
