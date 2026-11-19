/**
 * page.tsx - Your feedback
 *
 * The signed-in staff member's own product feedback, its triage status, and
 * any reply from the Binx team — where the "we replied" notification and
 * email link to. Sending happens in the shell's FeedbackDialog.
 *
 * @module apps/binx-web/src/app/(app)/feedback/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";

import { getMyFeedback } from "@/lib/feedback";
import FeedbackHistory from "@/components/feedback/FeedbackHistory/FeedbackHistory";
import SendFeedbackButton from "@/components/feedback/SendFeedbackButton/SendFeedbackButton";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Your feedback" };

const FeedbackPage = async () => {
  const items = await getMyFeedback().catch(() => []);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Feedback</span>
          <h1 className={styles.title}>Your feedback</h1>
          <p className={styles.subtitle}>
            Everything you&apos;ve sent the Binx team, where it stands, and our
            replies. Your clients can send feedback from their portal too — it
            comes to us, not to your inbox.
          </p>
        </div>
        {items.length > 0 && <SendFeedbackButton />}
      </div>

      <div className={styles.body}>
        <FeedbackHistory items={items} />
      </div>
    </div>
  );
};

export default FeedbackPage;
