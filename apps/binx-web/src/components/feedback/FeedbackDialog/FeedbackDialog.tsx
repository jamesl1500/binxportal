/**
 * FeedbackDialog.tsx
 *
 * The "Share feedback" form: what kind of feedback (broken / idea / love /
 * other), the message, an optional 1–5 overall rating, and an "okay to
 * follow up" checkbox. The page path, browser and viewport are attached
 * automatically (and the dialog says so) — the details a bug report needs
 * and nobody remembers to type.
 *
 * Controlled by FeedbackProvider, which remounts it (a fresh `key`) on each
 * open so every session starts clean on the kind the opener asked for.
 * After sending it swaps to a thank-you view
 * that points at the submitter's history page, where the Binx team's replies
 * show up. In the portal the copy is explicit that this goes to Binx, not the
 * agency, and points project questions at Messages instead.
 *
 * @module apps/binx-web/src/components/feedback/FeedbackDialog/FeedbackDialog.tsx
 * @author Binx Portal
 */
"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import {
  Bug,
  CheckCircle2,
  Heart,
  Lightbulb,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";

import { submitFeedbackAction } from "@/app/(app)/feedback/actions";
import {
  FEEDBACK_KIND_META,
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX,
  RATING_LABELS,
  captureFeedbackContext,
  feedbackHistoryPath,
  type FeedbackKind,
  type FeedbackSurface,
} from "@/lib/feedback-client";

import styles from "./FeedbackDialog.module.scss";

const KIND_ICON: Record<FeedbackKind, LucideIcon> = {
  bug: Bug,
  idea: Lightbulb,
  praise: Heart,
  other: MessageCircle,
};

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surface: FeedbackSurface;
  agencyId?: string | null;
  agencyName?: string | null;
  initialKind?: FeedbackKind;
}

const FeedbackDialog = ({
  open,
  onOpenChange,
  surface,
  agencyId = null,
  agencyName = null,
  initialKind,
}: FeedbackDialogProps) => {
  const pathname = usePathname();
  const formId = useId();
  const [isPending, startTransition] = useTransition();

  const [kind, setKind] = useState<FeedbackKind>(initialKind ?? "idea");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [allowContact, setAllowContact] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const meta = FEEDBACK_KIND_META[kind];
  const historyPath = feedbackHistoryPath(surface);
  const remaining = FEEDBACK_MESSAGE_MAX - message.length;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) {
      setError("Tell us a little about it");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitFeedbackAction({
        surface,
        agencyId,
        kind,
        rating,
        message: message.trim(),
        allowContact,
        ...captureFeedbackContext(pathname),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSent(true);
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.dialog}>
          {sent ? (
            <div className={styles.thanks}>
              <CheckCircle2 className={styles.thanksIcon} aria-hidden="true" />
              <Dialog.Title className={styles.title}>
                Thanks, we&apos;ve got it
              </Dialog.Title>
              <Dialog.Description className={styles.description}>
                A real person on the Binx team reads every message.
                {allowContact
                  ? " If we reply, you'll get an email and see it under Your feedback."
                  : " Any reply will show up under Your feedback."}
              </Dialog.Description>
              <div className={styles.actions}>
                <Link
                  href={historyPath}
                  className={styles.secondary}
                  onClick={() => onOpenChange(false)}
                >
                  Your feedback
                </Link>
                <Dialog.Close className={styles.primary}>Done</Dialog.Close>
              </div>
            </div>
          ) : (
            <form id={formId} className={styles.form} onSubmit={handleSubmit}>
              <div>
                <Dialog.Title className={styles.title}>
                  Share feedback
                </Dialog.Title>
                <Dialog.Description className={styles.description}>
                  {surface === "portal" ? (
                    <>
                      This goes to Binx, the team that builds this portal
                      {agencyName ? <>, not to {agencyName}</> : null}. For
                      questions about your project,{" "}
                      <Link
                        href="/portal/messages"
                        className={styles.inlineLink}
                        onClick={() => onOpenChange(false)}
                      >
                        message {agencyName ?? "your team"}
                      </Link>{" "}
                      instead.
                    </>
                  ) : (
                    "Goes straight to the team that builds Binx. We read every message."
                  )}
                </Dialog.Description>
              </div>

              <fieldset className={styles.kinds}>
                <legend className={styles.label}>
                  What&apos;s this about?
                </legend>
                <div className={styles.kindGrid}>
                  {FEEDBACK_KINDS.map((option) => {
                    const Icon = KIND_ICON[option];
                    return (
                      <label
                        key={option}
                        className={styles.kind}
                        data-selected={kind === option}
                      >
                        <input
                          type="radio"
                          name={`${formId}-kind`}
                          value={option}
                          checked={kind === option}
                          onChange={() => setKind(option)}
                          className={styles.kindInput}
                        />
                        <Icon className={styles.kindIcon} aria-hidden="true" />
                        <span>{FEEDBACK_KIND_META[option].label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <label className={styles.field}>
                <span className={styles.label}>{meta.prompt}</span>
                <textarea
                  className={styles.textarea}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={meta.placeholder}
                  maxLength={FEEDBACK_MESSAGE_MAX}
                  rows={5}
                  required
                  aria-invalid={error ? true : undefined}
                />
                {remaining < 500 && (
                  <span className={styles.counter}>
                    {remaining} characters left
                  </span>
                )}
              </label>

              <fieldset className={styles.ratingField}>
                <legend className={styles.label}>
                  Overall, how&apos;s Binx working for you?{" "}
                  <span className={styles.optional}>(optional)</span>
                </legend>
                <div className={styles.ratingRow}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={styles.ratingButton}
                      aria-pressed={rating === value}
                      aria-label={`${value} of 5: ${RATING_LABELS[value]}`}
                      title={RATING_LABELS[value]}
                      onClick={() =>
                        setRating((current) =>
                          current === value ? null : value,
                        )
                      }
                    >
                      {value}
                    </button>
                  ))}
                  <span className={styles.ratingHint} aria-live="polite">
                    {rating ? RATING_LABELS[rating] : ""}
                  </span>
                </div>
              </fieldset>

              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={allowContact}
                  onChange={(event) => setAllowContact(event.target.checked)}
                />
                <span>It&apos;s okay to email me about this</span>
              </label>

              <p className={styles.fineprint}>
                We&apos;ll attach the page you&apos;re on
                {pathname ? (
                  <>
                    {" "}
                    (<code>{pathname}</code>)
                  </>
                ) : null}{" "}
                and your browser details to help us reproduce any issue.
              </p>

              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}

              <div className={styles.actions}>
                <Dialog.Close className={styles.secondary} type="button">
                  Cancel
                </Dialog.Close>
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={isPending}
                >
                  {isPending ? "Sending…" : "Send feedback"}
                </button>
              </div>
            </form>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default FeedbackDialog;
