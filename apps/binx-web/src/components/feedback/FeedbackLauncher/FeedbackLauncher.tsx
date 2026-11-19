/**
 * FeedbackLauncher.tsx
 *
 * The app header's "Share feedback" trigger — a small icon button beside the
 * guided-tour and AI launchers (same shape and styles) that opens the
 * FeedbackProvider's dialog. Always visible so feedback is one click away on
 * every page.
 *
 * @module apps/binx-web/src/components/feedback/FeedbackLauncher/FeedbackLauncher.tsx
 * @author Binx Portal
 */
"use client";

import { MessageSquareHeart } from "lucide-react";

import { useOptionalFeedback } from "@/components/feedback/FeedbackProvider/FeedbackProvider";

import styles from "./FeedbackLauncher.module.scss";

const FeedbackLauncher = () => {
  const feedback = useOptionalFeedback();
  if (!feedback) return null;

  return (
    <button
      type="button"
      className={styles.trigger}
      onClick={() => feedback.openFeedback()}
      aria-label="Share feedback"
      title="Share feedback"
    >
      <MessageSquareHeart className={styles.icon} aria-hidden="true" />
    </button>
  );
};

export default FeedbackLauncher;
