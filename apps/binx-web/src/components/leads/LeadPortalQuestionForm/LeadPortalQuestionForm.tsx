/**
 * LeadPortalQuestionForm.tsx
 *
 * Where a lead asks the agency a question from their lead portal. The name
 * defaults to the lead's contact, editable for someone else on their side.
 *
 * @module apps/binx-web/src/components/leads/LeadPortalQuestionForm/LeadPortalQuestionForm.tsx
 * @author Binx Portal
 */
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { askInLeadPortalAction } from "@/app/lead-portal/actions";

import styles from "./LeadPortalQuestionForm.module.scss";

interface LeadPortalQuestionFormProps {
  token: string;
  defaultName: string | null;
}

const LeadPortalQuestionForm = ({ token, defaultName }: LeadPortalQuestionFormProps) => {
  const [name, setName] = useState(defaultName ?? "");
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!body.trim() || isPending) return;
    startTransition(async () => {
      const result = await askInLeadPortalAction(token, body, name || null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setBody("");
      toast.success("Sent. The team will reply here and by email.");
    });
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>
        <span className={styles.label}>Your question</span>
        <textarea
          className={styles.textarea}
          rows={3}
          maxLength={4000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Anything about the scope, timing or price?"
        />
      </label>
      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Your name</span>
          <input
            className={styles.input}
            maxLength={255}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button type="submit" className={styles.submit} disabled={isPending || !body.trim()}>
          {isPending ? "Sending…" : "Send question"}
        </button>
      </div>
    </form>
  );
};

export default LeadPortalQuestionForm;
