/**
 * MentionTextarea.tsx
 *
 * A textarea with an @mention picker, shared by the messaging composer and
 * the team timeline: type "@" and part of a teammate's name or handle, then
 * pick them with the arrow keys + Enter/Tab (or a click) to insert
 * "@user_name". The handle syntax mirrors binx-api's _MENTION_RE, so what
 * gets inserted is exactly what notifies someone.
 *
 * It grows with its content up to `maxHeight`. `submitOn` picks the send key:
 * "modEnter" (Cmd/Ctrl+Enter, for long-form posts) or "enter" (Enter sends,
 * Shift+Enter is a newline, for chat). While the picker is open, Enter/Tab
 * always pick a teammate instead of submitting.
 *
 * @module apps/binx-web/src/components/ui/MentionTextarea/MentionTextarea.tsx
 */
"use client";

import {
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";

import styles from "./MentionTextarea.module.scss";

/** Someone the picker can offer. Extra fields (ids, avatars) are ignored. */
export interface MentionCandidate {
  user_name: string;
  full_name: string;
}

// The token being typed right before the caret: "@" then an optional handle
// fragment, at a word boundary.
const MENTION_QUERY_RE = /(?:^|\s)@([A-Za-z0-9_.-]*)$/;
const MENTION_LIMIT = 6;

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  members: readonly MentionCandidate[];
  onSubmit?: () => void;
  /** "modEnter" (default): Cmd/Ctrl+Enter submits. "enter": Enter submits, Shift+Enter is a newline. */
  submitOn?: "modEnter" | "enter";
  /** Where the picker opens — "above" for a composer pinned to the bottom of the screen. */
  menuPlacement?: "below" | "above";
  placeholder?: string;
  maxLength?: number;
  ariaLabel: string;
  disabled?: boolean;
  autoFocus?: boolean;
  minRows?: number;
  /** Growth cap in px; it scrolls past this. */
  maxHeight?: number;
  /** Replaces the default textarea styling (the picker keeps its own). */
  textareaClassName?: string;
  className?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

const MentionTextarea = ({
  value,
  onChange,
  members,
  onSubmit,
  submitOn = "modEnter",
  menuPlacement = "below",
  placeholder,
  maxLength,
  ariaLabel,
  disabled = false,
  autoFocus = false,
  minRows = 2,
  maxHeight = 320,
  textareaClassName,
  className,
  ref,
}: MentionTextareaProps) => {
  const listId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  // Null when the picker is closed, otherwise the handle typed so far.
  const [query, setQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // The handle is only read after mount, when the textarea exists.
  useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement, []);

  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return members
      .filter(
        (m) =>
          m.user_name.toLowerCase().includes(q) ||
          m.full_name.toLowerCase().includes(q),
      )
      .slice(0, MENTION_LIMIT);
  }, [query, members]);
  const open = query !== null && matches.length > 0;

  // Re-grow on every value change (typing, a mention insert, a reset to ""
  // after sending, a draft filled in from outside), and restore the caret
  // after a mention insertion.
  useLayoutEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, maxHeight)}px`;
    if (pendingCaretRef.current !== null) {
      node.setSelectionRange(pendingCaretRef.current, pendingCaretRef.current);
      pendingCaretRef.current = null;
    }
  }, [value, maxHeight]);

  const refreshQuery = (node: HTMLTextAreaElement) => {
    const before = node.value.slice(0, node.selectionStart ?? node.value.length);
    const match = MENTION_QUERY_RE.exec(before);
    const next = match ? match[1] : null;
    if (next !== query) {
      setQuery(next);
      setActiveIndex(0);
    }
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
    if (event.key !== "Enter" || !onSubmit || event.nativeEvent.isComposing) return;
    const submits =
      submitOn === "enter" ? !event.shiftKey : event.metaKey || event.ctrlKey;
    if (submits) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(" ")}>
      <textarea
        ref={textareaRef}
        className={textareaClassName ?? styles.textarea}
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
        onSelect={(event) => refreshQuery(event.currentTarget)}
        onBlur={() => setQuery(null)}
      />
      {open && (
        <ul
          id={listId}
          className={styles.menu}
          data-placement={menuPlacement}
          role="listbox"
          aria-label="Mention a teammate"
        >
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
