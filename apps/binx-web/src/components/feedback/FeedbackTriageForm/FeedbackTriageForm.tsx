/**
 * FeedbackTriageForm.tsx
 *
 * The Binx team's controls for one feedback item: status, a public reply
 * (shown to the sender on their "Your feedback" page, notified in-app, and
 * emailed when they allowed follow-up), and a private internal note. Saves
 * only the fields that changed, so editing the note never re-sends a reply.
 *
 * @module apps/binx-web/src/components/feedback/FeedbackTriageForm/FeedbackTriageForm.tsx
 * @author Binx Portal
 */
"use client";

import { useState, useTransition } from "react";

import { updateFeedbackAction } from "@/app/(app)/feedback/actions";
import type { FeedbackTriageInput } from "@/lib/feedback";
import {
  FEEDBACK_ADMIN_STATUS_LABEL,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_STATUSES,
  type FeedbackAdminItem,
  type FeedbackStatus,
} from "@/lib/feedback-client";

import styles from "./FeedbackTriageForm.module.scss";

const FeedbackTriageForm = ({ item }: { item: FeedbackAdminItem }) => {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState<FeedbackAdminItem>(item);
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [response, setResponse] = useState(item.response ?? "");
  const [note, setNote] = useState(item.internal_note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const changes: FeedbackTriageInput = {};
  if (status !== saved.status) changes.status = status;
  if (response.trim() !== (saved.response ?? "")) changes.response = response;
  if (note.trim() !== (saved.internal_note ?? "")) changes.internalNote = note;
  const dirty = Object.keys(changes).length > 0;
  const willNotify =
    changes.response !== undefined && response.trim() !== ""
      ? saved.allow_contact
        ? "The sender will be notified and emailed."
        : "The sender will be notified in-app (they asked not to be emailed)."
      : changes.status &&
          ["planned", "done", "declined"].includes(changes.status)
        ? "The sender will be notified of the status change."
        : null;

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateFeedbackAction(item.id, changes);
      if (result.error || !result.feedback) {
        setError(result.error ?? "Unable to save");
        return;
      }
      setSaved(result.feedback);
      setStatus(result.feedback.status);
      setResponse(result.feedback.response ?? "");
      setNote(result.feedback.internal_note ?? "");
      setMessage("Saved");
    });
  };

  return (
    <form className={styles.form} onSubmit={save}>
      <label className={styles.field}>
        <span className={styles.label}>Status</span>
        <select
          className={styles.input}
          value={status}
          onChange={(event) => setStatus(event.target.value as FeedbackStatus)}
        >
          {FEEDBACK_STATUSES.map((value) => (
            <option key={value} value={value}>
              {FEEDBACK_ADMIN_STATUS_LABEL[value]}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Reply to {saved.user_name}</span>
        <textarea
          className={styles.textarea}
          value={response}
          onChange={(event) => setResponse(event.target.value)}
          maxLength={FEEDBACK_MESSAGE_MAX}
          rows={5}
          placeholder="Visible to the sender on their feedback page."
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Internal note</span>
        <textarea
          className={styles.textarea}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={FEEDBACK_MESSAGE_MAX}
          rows={3}
          placeholder="Binx team only — ticket links, duplicates, context."
        />
      </label>

      {willNotify && <p className={styles.hint}>{willNotify}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <span className={styles.saved} role="status">
          {!dirty && message}
        </span>
        <button
          type="submit"
          className={styles.primary}
          disabled={!dirty || isPending}
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
};

export default FeedbackTriageForm;
