/**
 * BoardReviewBar.tsx
 *
 * A client-portal-only banner that turns "approve the cards on this board"
 * into a guided flow: it names how many cards are waiting on the client and
 * lets them step through exactly those cards (BoardCanvas pans/zooms to and
 * selects each one), rather than hunting across a large canvas for the
 * handful that need a decision.
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/BoardReviewBar.tsx
 * @author Binx Portal
 */
"use client";

import { ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";

import type { BoardItem } from "@/lib/boards-client";

import styles from "./BoardReviewBar.module.scss";

interface BoardReviewBarProps {
  pendingItems: BoardItem[];
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
}

const BoardReviewBar = ({
  pendingItems,
  currentIndex,
  onPrev,
  onNext,
}: BoardReviewBarProps) => {
  if (pendingItems.length === 0) return null;
  const index = Math.min(currentIndex, pendingItems.length - 1);

  return (
    <div className={styles.bar} role="status">
      <ClipboardCheck aria-hidden="true" className={styles.icon} />
      <span className={styles.label}>
        {pendingItems.length === 1
          ? "1 card is awaiting your review"
          : `${pendingItems.length} cards are awaiting your review`}
      </span>
      <div className={styles.nav}>
        <button
          type="button"
          className={styles.navButton}
          onClick={onPrev}
          aria-label="Previous pending card"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <span className={styles.count}>
          {index + 1} / {pendingItems.length}
        </span>
        <button
          type="button"
          className={styles.navButton}
          onClick={onNext}
          aria-label="Next pending card"
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default BoardReviewBar;
