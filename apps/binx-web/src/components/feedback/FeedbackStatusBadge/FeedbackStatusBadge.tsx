/**
 * FeedbackStatusBadge.tsx
 *
 * A feedback item's triage status as a small tinted pill. The submitter sees
 * friendlier wording ("Received", "Closed"); the Binx inbox passes
 * `variant="admin"` for the plain internal names ("New", "Declined").
 *
 * @module apps/binx-web/src/components/feedback/FeedbackStatusBadge/FeedbackStatusBadge.tsx
 * @author Binx Portal
 */
import {
  FEEDBACK_ADMIN_STATUS_LABEL,
  FEEDBACK_STATUS_META,
  type FeedbackStatus,
} from "@/lib/feedback-client";

import styles from "./FeedbackStatusBadge.module.scss";

const FeedbackStatusBadge = ({
  status,
  variant = "submitter",
}: {
  status: FeedbackStatus;
  variant?: "submitter" | "admin";
}) => {
  const meta = FEEDBACK_STATUS_META[status];
  const label =
    variant === "admin" ? FEEDBACK_ADMIN_STATUS_LABEL[status] : meta.label;
  return (
    <span className={styles.badge} data-tone={meta.tone}>
      {label}
    </span>
  );
};

export default FeedbackStatusBadge;
