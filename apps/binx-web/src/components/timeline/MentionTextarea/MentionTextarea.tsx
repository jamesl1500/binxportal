/**
 * MentionTextarea.tsx
 *
 * A textarea with an @mention picker: type "@" and part of a teammate's name
 * or handle, then pick them with the arrow keys + Enter/Tab (or a click) to
 * insert "@user_name". Same handle syntax and picker behavior as the
 * messaging composer, so a mention looks and works the same everywhere.
 * Cmd/Ctrl+Enter submits.
 *
 * @module apps/binx-web/src/components/timeline/MentionTextarea/MentionTextarea.tsx
 */
"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { MentionableMember } from "@/lib/timeline-client";

import styles from "./MentionTextarea.module.scss";

const MENTION_QUERY_RE = /(?:^|\s)@([A-Za-z0-9_.-]*)$/;
const MENTION_LIMIT = 6;
const MAX_HEIGHT_PX = 320;

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  members: MentionableMember[];
  onSubmit?: () => void;
  placeholder?: string;
  maxLength: number;
  ariaLabel: string;
  disabled?: boolean;
  autoFocus?: boolean;
  minRows?: number;
}

const MentionTextarea = ({
  value,
  onChange,
  members,
  onSubmit,
  placeholder,
  maxLength,
  ariaLabel,
  disabled = false,
  autoFocus = false,
  minRows = 2,
}: MentionTextareaProps) => {
  const listId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  // Null when the picker is closed, otherwise the handle typed so far.
  const [query, setQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return members
      .filter((m) => m.user_name.toLowerCase().includes(q) || m.full_name.toLowerCase().includes(q))
      .slice(0, MENTION_LIMIT);
  }, [query, members]);
  const open = query !== null && matches.length > 0;

  const grow = (node: HTMLTextAreaElement) => {
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT_PX)}px`;
  };

  // Restore the caret (and re-grow) after a mention insertion re-renders.
  useLayoutEffect(() => {
    const node = textareaRef.current;
    if (pendingCaretRef.current !== null && node) {
      node.setSelectionRange(pendingCaretRef.current, pendingCaretRef.current);
      pendingCaretRef.current = null;
    }
    if (node) grow(node);
  });

  const refreshQuery = (node: HTMLTextAreaElement) => {
    const before = node.value.slice(0, node.selectionStart ?? node.value.length);
    const match = MENTION_QUERY_RE.exec(before);
    setQuery(match ? match[1] : null);
    if (match) setActiveIndex(0);
  };

  const insert = (userName: string) => {
    const node = textareaRef.current;
    if (!node) return;
    const caret = node.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const match = /@([A-Za-z0-9_.-]*)$/.exec(before);
    if (!match) return;
    const nextBefore = `${before.slice(0, before.length - match[0].length)}@${userName} `;
    onChange(nextBefore + value.slice(caret));
    pendingCaretRef.current = nextBefore.length;
    setQuery(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insert(matches[activeIndex].user_name);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setQuery(null);
        return;
      }
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && onSubmit) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className={styles.wrap}>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        value={value}
        rows={minRows}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(event) => {
          onChange(event.target.value);
          refreshQuery(event.target);
        }}
        onKeyDown={handleKeyDown}
        onClick={(event) => refreshQuery(event.currentTarget)}
        onBlur={() => setQuery(null)}
      />
      {open && (
        <ul id={listId} className={styles.menu} role="listbox" aria-label="Mention a teammate">
          {matches.map((member, index) => (
            <li key={member.user_name}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={styles.option}
                data-active={index === activeIndex}
                onMouseDown={(event) => {
                  // Keep focus in the textarea so the caret restore works.
                  event.preventDefault();
                  insert(member.user_name);
                }}
              >
                <span className={styles.name}>{member.full_name}</span>
                <span className={styles.handle}>@{member.user_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MentionTextarea;
