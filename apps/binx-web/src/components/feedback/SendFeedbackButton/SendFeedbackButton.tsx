/**
 * SendFeedbackButton.tsx
 *
 * A plain button that opens the shell's feedback dialog — for server-rendered
 * pages (the "Your feedback" pages) that can't call `useFeedback` themselves.
 * `appearance="link"` renders it as an inline text link (the portal
 * sidebar's help card).
 *
 * @module apps/binx-web/src/components/feedback/SendFeedbackButton/SendFeedbackButton.tsx
 * @author Binx Portal
 */
"use client";

import { MessageSquarePlus } from "lucide-react";

import { useOptionalFeedback } from "@/components/feedback/FeedbackProvider/FeedbackProvider";
import type { FeedbackKind } from "@/lib/feedback-client";

import styles from "./SendFeedbackButton.module.scss";

interface SendFeedbackButtonProps {
  label?: string;
  kind?: FeedbackKind;
  className?: string;
}

const SendFeedbackButton = ({
  label = "Share feedback",
  kind,
  className,
}: SendFeedbackButtonProps) => {
  const feedback = useOptionalFeedback();
  if (!feedback) return null;

  return (
    <button
      type="button"
      className={className ?? styles.button}
      onClick={() => feedback.openFeedback(kind)}
    >
      {!className && (
        <MessageSquarePlus className={styles.icon} aria-hidden="true" />
      )}
      {label}
    </button>
  );
};

export default SendFeedbackButton;
