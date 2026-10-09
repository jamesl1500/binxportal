/**
 * PageSkeleton.tsx
 *
 * The placeholder every route-level `loading.tsx` renders. With a loading
 * boundary in place, Next.js prefetches each (dynamic) route down to that
 * boundary, so a click swaps the content area for this skeleton immediately
 * instead of leaving the old page on screen until the server responds.
 *
 * Shape-matched rather than pixel-matched: `variant` picks the rough layout
 * of what's coming (a list/table, a stat-and-card dashboard, a settings
 * form, or a two-pane inbox), and `header={false}` drops the
 * eyebrow/title/subtitle bars when the surrounding layout already renders
 * the real header and tabs (client, project, settings, … sections).
 *
 * Fades in after a short delay so a fast navigation never flashes it.
 * A plain Server Component — no client JS.
 *
 * Deliberately not wrapped in a <ViewTransition> for a fade-out: an exit
 * transition on a streamed Suspense fallback crashed the page in WebKit
 * (the portal home, every load). Arriving content animates instead — see
 * components/ui/PageEnter.
 *
 * @module apps/binx-web/src/components/ui/PageSkeleton/PageSkeleton.tsx
 * @author Binx Portal
 */
import { cn } from "@/lib/utils";

import styles from "./PageSkeleton.module.scss";

export type PageSkeletonVariant = "table" | "cards" | "form" | "split";

interface PageSkeletonProps {
  /** Rough shape of the page that's loading. */
  variant?: PageSkeletonVariant;
  /** Render the eyebrow/title/subtitle placeholder. */
  header?: boolean;
  /** Announced to screen readers while the page loads. */
  label?: string;
}

const Bone = ({ className }: { className?: string }) => (
  <span className={cn(styles.bone, className)} aria-hidden="true" />
);

const TableBody = () => (
  <div className={styles.table}>
    <div className={styles.toolbar}>
      <Bone className={styles.search} />
      <Bone className={styles.button} />
    </div>
    {Array.from({ length: 6 }, (_, row) => (
      <div key={row} className={styles.row}>
        <Bone className={styles.cellWide} />
        <Bone className={styles.cell} />
        <Bone className={styles.cell} />
        <Bone className={styles.cellNarrow} />
      </div>
    ))}
  </div>
);

const CardsBody = () => (
  <>
    <div className={styles.stats}>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className={styles.card}>
          <Bone className={styles.statLabel} />
          <Bone className={styles.statValue} />
        </div>
      ))}
    </div>
    <div className={styles.cards}>
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className={cn(styles.card, styles.tallCard)}>
          <Bone className={styles.cardTitle} />
          <Bone className={styles.line} />
          <Bone className={styles.line} />
          <Bone className={styles.lineShort} />
        </div>
      ))}
    </div>
  </>
);

const FormBody = () => (
  <div className={cn(styles.card, styles.form)}>
    {Array.from({ length: 4 }, (_, index) => (
      <div key={index} className={styles.field}>
        <Bone className={styles.fieldLabel} />
        <Bone className={styles.input} />
      </div>
    ))}
    <Bone className={styles.button} />
  </div>
);

const SplitBody = () => (
  <div className={styles.split}>
    <div className={cn(styles.card, styles.list)}>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className={styles.listItem}>
          <Bone className={styles.avatar} />
          <div className={styles.listText}>
            <Bone className={styles.line} />
            <Bone className={styles.lineShort} />
          </div>
        </div>
      ))}
    </div>
    <div className={cn(styles.card, styles.pane)}>
      <Bone className={styles.cardTitle} />
      <Bone className={styles.line} />
      <Bone className={styles.lineShort} />
    </div>
  </div>
);

const BODIES: Record<PageSkeletonVariant, () => React.JSX.Element> = {
  table: TableBody,
  cards: CardsBody,
  form: FormBody,
  split: SplitBody,
};

const PageSkeleton = ({
  variant = "table",
  header = true,
  label = "Loading…",
}: PageSkeletonProps) => {
  const Body = BODIES[variant];

  return (
    <div
      className={styles.root}
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-variant={variant}
    >
      <span className={styles.srOnly}>{label}</span>

      {header && (
        <div className={styles.header}>
          <Bone className={styles.eyebrow} />
          <Bone className={styles.title} />
          <Bone className={styles.subtitle} />
        </div>
      )}

      <Body />
    </div>
  );
};

export default PageSkeleton;
