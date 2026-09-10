/**
 * LeadScoreBadge.tsx
 *
 * The AI score (0–100) as a small coloured chip. Server component — static
 * markup. `null` renders a muted "not scored" chip.
 *
 * @module apps/binx-web/src/components/leads/LeadScoreBadge/LeadScoreBadge.tsx
 * @author Binx.io
 */
import styles from "./LeadScoreBadge.module.scss";

interface LeadScoreBadgeProps {
  score: number | null;
}

function tone(score: number): "low" | "mid" | "high" {
  if (score >= 70) return "high";
  if (score >= 40) return "mid";
  return "low";
}

const LeadScoreBadge = ({ score }: LeadScoreBadgeProps) => {
  if (score == null) {
    return <span className={styles.badge} data-tone="none">Not scored</span>;
  }
  return (
    <span className={styles.badge} data-tone={tone(score)}>
      Score {score}
    </span>
  );
};

export default LeadScoreBadge;
