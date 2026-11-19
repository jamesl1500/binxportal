/**
 * FeedbackPulse.tsx
 *
 * The new-account check-in: a small, non-modal card in the bottom-left
 * corner (the toasts own bottom-right) asking "how's it going?" on a 1–5
 * scale, with an optional comment once a score is picked. binx-api decides
 * *when* (`GET /feedback/pulse` — a few days in, then a month in; see
 * feedback/service.py::get_due_pulse) and the layout passes the due
 * milestone in as `pulseKey`.
 *
 * Polite by design: it waits a few seconds after the page settles, never
 * shows while a welcome tour is open, and closing it records a dismissal so
 * that milestone never comes back.
 *
 * @module apps/binx-web/src/components/feedback/FeedbackPulse/FeedbackPulse.tsx
 * @author Binx Portal
 */
"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

import {
  answerPulseAction,
  dismissPulseAction,
} from "@/app/(app)/feedback/actions";
import { useOptionalFeedback } from "@/components/feedback/FeedbackProvider/FeedbackProvider";
import { useOptionalPortalOnboarding } from "@/components/portal/PortalOnboardingProvider/PortalOnboardingProvider";
import { useOptionalTutorial } from "@/components/tutorial/TutorialProvider/TutorialProvider";
import {
  FEEDBACK_MESSAGE_MAX,
  RATING_LABELS,
  captureFeedbackContext,
} from "@/lib/feedback-client";

import styles from "./FeedbackPulse.module.scss";

/** How long to let the page settle before asking. */
export const PULSE_DELAY_MS = 4000;

const QUESTION: Record<string, string> = {
  "first-week": "How's your first week going?",
  "first-month": "A month in — how's it going?",
};

interface FeedbackPulseProps {
  pulseKey: string | null;
}

type Phase = "waiting" | "asking" | "thanks" | "gone";

const FeedbackPulse = ({ pulseKey }: FeedbackPulseProps) => {
  const feedback = useOptionalFeedback();
  const tutorial = useOptionalTutorial();
  const portalOnboarding = useOptionalPortalOnboarding();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [phase, setPhase] = useState<Phase>("waiting");
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const tourOpen = Boolean(
    tutorial?.isTourOpen || portalOnboarding?.isTourOpen,
  );

  useEffect(() => {
    if (!pulseKey || phase !== "waiting" || tourOpen) return;
    const timer = window.setTimeout(() => setPhase("asking"), PULSE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pulseKey, phase, tourOpen]);

  useEffect(() => {
    if (phase !== "thanks") return;
    const timer = window.setTimeout(() => setPhase("gone"), 3500);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (!pulseKey || !feedback || phase === "waiting" || phase === "gone") {
    return null;
  }
  // A tour that opens after the card appeared takes precedence.
  if (tourOpen && phase === "asking") return null;

  const surface = feedback.surface;
  const question =
    QUESTION[pulseKey] ??
    (surface === "portal"
      ? "How's the portal working for you?"
      : "How's Binx working for you?");

  const dismiss = () => {
    setPhase("gone");
    // Fire and forget: worst case it asks once more on a later visit.
    void dismissPulseAction(pulseKey);
  };

  const send = () => {
    if (!rating) return;
    setError(null);
    startTransition(async () => {
      const result = await answerPulseAction(pulseKey, {
        surface,
        agencyId: feedback.agencyId,
        rating,
        message: message.trim(),
        ...captureFeedbackContext(pathname),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setPhase("thanks");
    });
  };

  return (
    <section className={styles.card} aria-label="Quick check-in">
      {phase === "thanks" ? (
        <p className={styles.thanks} role="status">
          Thank you — that genuinely helps.
        </p>
      ) : (
        <>
          <div className={styles.header}>
            <span className={styles.eyebrow}>Quick check-in</span>
            <button
              type="button"
              className={styles.close}
              onClick={dismiss}
              aria-label="Dismiss check-in"
              title="Not now"
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <p className={styles.question} id={`pulse-${pulseKey}`}>
            {question}
          </p>
          <div
            className={styles.scale}
            role="group"
            aria-labelledby={`pulse-${pulseKey}`}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={styles.score}
                aria-pressed={rating === value}
                aria-label={`${value} of 5: ${RATING_LABELS[value]}`}
                title={RATING_LABELS[value]}
                onClick={() => setRating(value)}
              >
                {value}
              </button>
            ))}
          </div>
          <div className={styles.ends} aria-hidden="true">
            <span>{RATING_LABELS[1]}</span>
            <span>{RATING_LABELS[5]}</span>
          </div>

          {rating !== null && (
            <div className={styles.followUp}>
              <label className={styles.label}>
                {rating <= 3
                  ? "What would make it better?"
                  : "What's working well?"}{" "}
                <span className={styles.optional}>(optional)</span>
                <textarea
                  className={styles.textarea}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={FEEDBACK_MESSAGE_MAX}
                  rows={3}
                />
              </label>
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={send}
                  disabled={isPending}
                >
                  {isPending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default FeedbackPulse;
