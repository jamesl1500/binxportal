/**
 * AdminNoteForm.tsx
 *
 * A private support note on an agency or user — "called about invoices,
 * follow up Friday". Saved to the admin audit trail; only the Binx team
 * ever sees it.
 *
 * @module apps/binx-web/src/components/admin/AdminNoteForm/AdminNoteForm.tsx
 * @author Binx Portal
 */
"use client";

import { useId, useState, useTransition } from "react";

import { addNoteAction } from "@/app/(app)/admin/actions";

import ui from "../adminUi.module.scss";

interface AdminNoteFormProps {
  target: "user" | "agency";
  targetId: string;
}

const AdminNoteForm = ({ target, targetId }: AdminNoteFormProps) => {
  const fieldId = useId();
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ message?: string; error?: string }>(
    {},
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const outcome = await addNoteAction(target, targetId, body);
      setResult(outcome);
      if (!outcome.error) setBody("");
    });
  };

  return (
    <form onSubmit={submit} className={`${ui.stack} ${ui.tight}`}>
      <label htmlFor={fieldId} className={ui.field}>
        Add a support note
        <span className={`${ui.muted} ${ui.normal}`}>
          Only the Binx team sees these.
        </span>
      </label>
      <textarea
        id={fieldId}
        className={ui.textarea}
        rows={3}
        maxLength={4000}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="e.g. Called about the invoice email — resent, all good."
      />
      <div className={`${ui.filters} ${ui.between}`}>
        <span role="status">
          {result.message && (
            <span className={ui.notice}>{result.message}</span>
          )}
          {result.error && <span className={ui.error}>{result.error}</span>}
        </span>
        <button
          type="submit"
          className={ui.button}
          disabled={isPending || !body.trim()}
        >
          {isPending ? "Saving…" : "Save note"}
        </button>
      </div>
    </form>
  );
};

export default AdminNoteForm;
