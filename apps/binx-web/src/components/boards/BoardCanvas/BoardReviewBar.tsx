/**
 * BoardReviewBar.tsx
 *
 * A client-portal-only banner that turns "approve the cards on this board"
 * into a guided flow: it names how many cards are waiting on the client and
 * lets them step through exactly those cards (BoardCanvas pans/zooms to and
 * selects each one — including cards stacked inside columns), rather than
 * hunting across a large canvas. When the waiting cards live on nested
 * boards instead, it points the client at the board that holds them.
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/BoardReviewBar.tsx
 * @author Binx Portal
 */
"use client";

import { ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";

import type { BoardItem } from "@/lib/boards-client";

import styles from "./BoardReviewBar.module.scss";

interface SubBoardPending {
  id: string;
  title: string;
  count: number;
  boardId: string;
}

interface BoardReviewBarProps {
  pendingItems: BoardItem[];
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
  /** Board cards on this board with cards awaiting review beneath them. */
  subBoards?: SubBoardPending[];
  onOpenBoard?: (boardId: string) => void;
}

const BoardReviewBar = ({
  pendingItems,
  currentIndex,
  onPrev,
  onNext,
  subBoards = [],
  onOpenBoard,
}: BoardReviewBarProps) => {
  if (pendingItems.length === 0) {
    const first = subBoards.find((b) => b.boardId);
    if (!first || !onOpenBoard) return null;
    const total = subBoards.reduce((sum, b) => sum + b.count, 0);
    return (
      <div className={styles.bar} role="status">
        <ClipboardCheck aria-hidden="true" className={styles.icon} />
        <span className={styles.label}>
          {total === 1 ? "1 card awaits" : `${total} cards await`} your review
          in “{first.title}”
        </span>
        <div className={styles.nav}>
          <button
            type="button"
            className={styles.openButton}
            onClick={() => onOpenBoard(first.boardId)}
          >
            Open board
          </button>
        </div>
      </div>
    );
  }
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
