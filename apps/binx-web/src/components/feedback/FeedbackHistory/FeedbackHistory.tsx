/**
 * FeedbackHistory.tsx
 *
 * The submitter's own feedback, newest first — what they sent, where it is
 * in triage, and any written reply from the Binx team. Closing the loop is
 * the point: feedback that disappears into a void stops getting sent.
 * Shared by `/feedback` (staff) and `/portal/feedback` (clients).
 *
 * @module apps/binx-web/src/components/feedback/FeedbackHistory/FeedbackHistory.tsx
 * @author Binx Portal
 */
import { Star } from "lucide-react";

import FeedbackDate from "@/components/feedback/FeedbackDate/FeedbackDate";
import FeedbackStatusBadge from "@/components/feedback/FeedbackStatusBadge/FeedbackStatusBadge";
import SendFeedbackButton from "@/components/feedback/SendFeedbackButton/SendFeedbackButton";
import { FEEDBACK_KIND_SHORT, type FeedbackItem } from "@/lib/feedback-client";

import styles from "./FeedbackHistory.module.scss";

const FeedbackHistory = ({ items }: { items: FeedbackItem[] }) => {
  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>Nothing here yet</p>
        <p className={styles.emptyBody}>
          Spotted something broken, or wish something worked differently? Tell
          us — every message is read by the people who build Binx, and replies
          show up right here.
        </p>
        <SendFeedbackButton />
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.id} className={styles.item}>
          <div className={styles.meta}>
            <span className={styles.kind}>
              {FEEDBACK_KIND_SHORT[item.kind]}
            </span>
            <FeedbackStatusBadge status={item.status} />
            {item.rating !== null && (
              <span
                className={styles.rating}
                aria-label={`Rated ${item.rating} of 5`}
              >
                <Star aria-hidden="true" />
                {item.rating}/5
              </span>
            )}
            <FeedbackDate iso={item.created_at} className={styles.date} />
          </div>

          <p className={styles.message}>{item.message}</p>
          {item.page_path && (
            <p className={styles.page}>
              Sent from <code>{item.page_path}</code>
            </p>
          )}

          {item.response && (
            <div className={styles.reply}>
              <p className={styles.replyLabel}>
                Reply from the Binx team
                {item.responded_at && (
                  <>
                    {" · "}
                    <FeedbackDate iso={item.responded_at} />
                  </>
                )}
              </p>
              <p className={styles.replyBody}>{item.response}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
};

export default FeedbackHistory;
