/**
 * EditableTitle.tsx
 *
 * A card heading that turns into an input on double-click (or straight away
 * for a just-created card) and saves on blur / Enter — Milanote's inline
 * title editing, shared by to-do lists, columns and board cards.
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/cards/EditableTitle.tsx
 * @author Binx Portal
 */
"use client";

import { useState } from "react";

import styles from "./BoardCards.module.scss";

interface EditableTitleProps {
  value: string;
  placeholder: string;
  canEdit: boolean;
  autoEdit?: boolean;
  className?: string;
  maxLength?: number;
  onSave: (next: string) => void;
  onEditingChange?: (editing: boolean) => void;
}

const EditableTitle = ({
  value,
  placeholder,
  canEdit,
  autoEdit = false,
  className,
  maxLength = 120,
  onSave,
  onEditingChange,
}: EditableTitleProps) => {
  const [editing, setEditing] = useState(canEdit && autoEdit);
  const [draft, setDraft] = useState(value);
  // A just-created card can mount before the "auto edit" flag arrives —
  // adjust during render rather than in an effect (see BoardItem.tsx).
  const [seenAuto, setSeenAuto] = useState(autoEdit);
  if (autoEdit && autoEdit !== seenAuto) {
    setSeenAuto(autoEdit);
    if (canEdit) {
      setDraft(value);
      setEditing(true);
    }
  }

  const begin = () => {
    if (!canEdit) return;
    setDraft(value);
    setEditing(true);
    onEditingChange?.(true);
  };

  const finish = (save: boolean) => {
    setEditing(false);
    onEditingChange?.(false);
    const next = draft.trim();
    if (save && next !== value.trim()) onSave(next);
  };

  if (editing) {
    return (
      <input
        className={`${styles.titleInput} ${className ?? ""}`}
        value={draft}
        autoFocus
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(true);
          if (e.key === "Escape") finish(false);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <h3
      className={`${styles.title} ${className ?? ""}`}
      data-empty={value.trim() === ""}
      onDoubleClick={(e) => {
        e.stopPropagation();
        begin();
      }}
    >
      {value.trim() || placeholder}
    </h3>
  );
};

export default EditableTitle;
