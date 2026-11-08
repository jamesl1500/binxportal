/**
 * ColumnCard.tsx
 *
 * A Milanote column: a titled vertical stack that other cards snap into.
 * Children render in `position` order; while a card is dragged over the
 * column an insertion bar shows where it will land (the drop target is
 * computed by BoardCanvas from the pointer). The header carries the column's
 * review roll-up — "2 of 4 approved" — since a column can be sent to the
 * client for review as a whole.
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/cards/ColumnCard.tsx
 * @author Binx Portal
 */
"use client";

import { Fragment, useMemo } from "react";

import {
  cardTitle,
  columnApprovalSummary,
  type BoardItem,
} from "@/lib/boards-client";
import { useBoardStore } from "@/stores/use-board-store";
import { useBoardCanvas } from "@/components/boards/BoardCanvas/BoardCanvasContext";

import EditableTitle from "./EditableTitle";
import styles from "./BoardCards.module.scss";

interface ColumnCardProps {
  item: BoardItem;
  autoEdit: boolean;
  canEdit: boolean;
  onSaveTitle: (title: string) => void;
  renderChild: (child: BoardItem) => React.ReactNode;
}

export function useColumnChildren(columnId: string): BoardItem[] {
  const itemsById = useBoardStore((s) => s.itemsById);
  return useMemo(
    () =>
      Object.values(itemsById)
        .filter((i) => i.parent_id === columnId)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.z - b.z),
    [itemsById, columnId],
  );
}

const ColumnCard = ({
  item,
  autoEdit,
  canEdit,
  onSaveTitle,
  renderChild,
}: ColumnCardProps) => {
  const { dropTarget } = useBoardCanvas();
  const children = useColumnChildren(item.id);
  const summary = columnApprovalSummary(children);
  const dropIndex =
    dropTarget?.kind === "column" && dropTarget.id === item.id
      ? dropTarget.index
      : null;

  return (
    <div className={styles.column} data-dropping={dropIndex !== null}>
      <header className={styles.columnHeader}>
        <EditableTitle
          value={cardTitle(item)}
          placeholder="Untitled column"
          canEdit={canEdit}
          autoEdit={autoEdit}
          onSave={onSaveTitle}
        />
        <span className={styles.columnCount}>{children.length}</span>
      </header>
      {summary.total > 0 &&
        (summary.pending > 0 || summary.approved > 0 || summary.changes > 0) && (
          <p className={styles.columnReview}>
            {summary.approved > 0 && (
              <span data-status="approved">
                {summary.approved} of {summary.total} approved
              </span>
            )}
            {summary.pending > 0 && (
              <span data-status="pending">{summary.pending} awaiting review</span>
            )}
            {summary.changes > 0 && (
              <span data-status="changes_requested">
                {summary.changes} need changes
              </span>
            )}
          </p>
        )}
      <div className={styles.columnBody} data-column-body>
        {children.map((child, index) => (
          <Fragment key={child.id}>
            {dropIndex === index && <span className={styles.dropBar} aria-hidden="true" />}
            {renderChild(child)}
          </Fragment>
        ))}
        {dropIndex !== null && dropIndex >= children.length && (
          <span className={styles.dropBar} aria-hidden="true" />
        )}
        {children.length === 0 && dropIndex === null && (
          <p className={styles.columnEmpty}>Drag cards here</p>
        )}
      </div>
    </div>
  );
};

export default ColumnCard;
