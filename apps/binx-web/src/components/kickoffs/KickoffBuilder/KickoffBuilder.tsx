/**
 * KickoffBuilder.tsx
 *
 * Editor for a draft kickoff: title, an optional intro message, a
 * "start from template" picker (only offered before any questions have been
 * typed in, so it doesn't clobber work in progress), and a repeatable
 * question list (text / multiple choice / file upload, each with a required
 * toggle). Saves as a draft; Send is a separate confirmed step once at least
 * one question exists, mirroring ProposalForm/ProposalActions' split between
 * editing and sending. Used both to create the very first kickoff for a
 * project and to keep editing one that hasn't been sent yet.
 *
 * @module apps/binx-web/src/components/kickoffs/KickoffBuilder/KickoffBuilder.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { KickoffDetail, KickoffQuestionInput, KickoffQuestionType, KickoffTemplate } from "@/lib/kickoffs";
import {
  createKickoffAction,
  createKickoffTemplateAction,
  deleteKickoffAction,
  sendKickoffAction,
  updateKickoffAction,
} from "@/app/(app)/projects/[projectId]/kickoff/actions";

import styles from "./KickoffBuilder.module.scss";

interface KickoffBuilderProps {
  agencyId: string;
  projectId: string;
  kickoff: KickoffDetail | null;
  templates: KickoffTemplate[];
}

interface QuestionRow extends KickoffQuestionInput {
  key: string;
  // The multiple-choice options input's raw typed text. Kept separate from
  // `options` (the parsed, trimmed list actually sent to the API) so the
  // field isn't a controlled input re-rendering itself from that parsed
  // list on every keystroke — which used to eat the comma the user just
  // typed, since a trailing "Email," parses to ["Email"] and re-joining
  // that drops the comma before the next option can be typed.
  optionsText: string;
}

let rowCounter = 0;
const newQuestion = (): QuestionRow => ({
  key: `q${rowCounter++}`,
  type: "text",
  label: "",
  options: [],
  optionsText: "",
  required: true,
});

function parseOptionsText(text: string): string[] {
  return text
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o !== "");
}

const TYPE_LABELS: Record<KickoffQuestionType, string> = {
  text: "Short answer",
  multiple_choice: "Multiple choice",
  file_upload: "File upload",
};

const KickoffBuilder = ({ agencyId, projectId, kickoff, templates }: KickoffBuilderProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(kickoff?.title ?? "Project kickoff");
  const [introMessage, setIntroMessage] = useState(kickoff?.intro_message ?? "");
  const [questions, setQuestions] = useState<QuestionRow[]>(
    kickoff?.questions.length
      ? kickoff.questions.map((q) => ({
          key: q.id,
          type: q.type as KickoffQuestionType,
          label: q.label,
          options: q.options,
          optionsText: q.options.join(", "),
          required: q.required,
        }))
      : [newQuestion()],
  );
  const [templateId, setTemplateId] = useState<string>("");
  const [sendOpen, setSendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const isNew = kickoff === null;

  const updateQuestion = (key: string, patch: Partial<QuestionRow>) => {
    setQuestions((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeQuestion = (key: string) => {
    setQuestions((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows));
  };

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    // Only actually copies its questions in once the template is fetched via
    // create (see handleSaveDraft) — here we just remember the pick so the
    // create call can pass template_id straight through, keeping the
    // template's own ordering intact instead of round-tripping through this
    // form's state.
  };

  const validQuestions = () =>
    questions
      .map((q) => ({ ...q, label: q.label.trim() }))
      .filter((q) => q.label !== "");

  // `onSuccess` fires only once the action has actually succeeded. Success
  // feedback is a toast rather than a dialog on purpose: sending flips the
  // kickoff out of draft, so the page swaps this builder for
  // KickoffStatusView on refresh — a dialog owned by this component would
  // unmount mid-read, while the app-level Toaster outlives the swap.
  const run = (action: () => Promise<{ error?: string }>, onSuccess?: () => void) => {
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  };

  const handleSaveDraft = () => {
    const cleaned = validQuestions();
    if (cleaned.length === 0 && !templateId) {
      toast.error("Add at least one question");
      return;
    }
    run(async () => {
      if (isNew) {
        const result = await createKickoffAction(agencyId, projectId, {
          title,
          introMessage: introMessage.trim() || null,
          questions: cleaned,
          templateId: templateId || null,
        });
        return result;
      }
      return updateKickoffAction(agencyId, projectId, { title, introMessage: introMessage.trim() || null, questions: cleaned });
    }, () =>
      toast.success(isNew ? "Kickoff draft created" : "Draft saved", {
        description: "Only your team can see it until you send it to the client.",
      }),
    );
  };

  const handleSend = () => {
    run(async () => {
      const result = await sendKickoffAction(agencyId, projectId);
      if (!result.error) setSendOpen(false);
      return result;
    }, () =>
      toast.success("Kickoff sent to your client", {
        description: "We've emailed their portal contact. You'll see answers here as they come in.",
      }),
    );
  };

  const handleDelete = () => {
    run(async () => {
      const result = await deleteKickoffAction(agencyId, projectId);
      if (!result.error) setDeleteOpen(false);
      return result;
    });
  };

  const handleSaveTemplate = () => {
    const cleaned = validQuestions();
    if (templateName.trim() === "" || cleaned.length === 0) {
      toast.error("Give it a name and at least one question");
      return;
    }
    run(async () => {
      const result = await createKickoffTemplateAction(agencyId, {
        name: templateName.trim(),
        description: null,
        questions: cleaned,
      });
      if (!result.error) {
        setSaveTemplateOpen(false);
        setTemplateName("");
        toast.success("Template saved");
      }
      return result;
    });
  };

  return (
    <div className={styles.builder}>
      {isNew && templates.length > 0 && questions.every((q) => q.label.trim() === "") && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Start from a template (optional)</span>
          <select
            className={styles.select}
            value={templateId}
            onChange={(event) => applyTemplate(event.target.value)}
          >
            <option value="">Start from scratch</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.question_count} questions)
              </option>
            ))}
          </select>
        </label>
      )}

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Title</span>
        <input
          type="text"
          className={styles.input}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={255}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Intro message (optional)</span>
        <textarea
          className={styles.textarea}
          value={introMessage}
          onChange={(event) => setIntroMessage(event.target.value)}
          placeholder="A few questions to make sure we're aligned before we start."
          rows={2}
          maxLength={2000}
        />
      </label>

      {!templateId && (
        <div className={styles.questions}>
          <span className={styles.fieldLabel}>Questions</span>
          {questions.map((q) => (
            <div key={q.key} className={styles.questionRow}>
              <div className={styles.questionTop}>
                <select
                  className={styles.typeSelect}
                  value={q.type}
                  onChange={(event) => updateQuestion(q.key, { type: event.target.value as KickoffQuestionType })}
                >
                  {(Object.keys(TYPE_LABELS) as KickoffQuestionType[]).map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
                <label className={styles.requiredToggle}>
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(event) => updateQuestion(q.key, { required: event.target.checked })}
                  />
                  Required
                </label>
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => removeQuestion(q.key)}
                  aria-label="Remove question"
                >
                  <Trash2 />
                </button>
              </div>
              <input
                type="text"
                className={styles.input}
                value={q.label}
                onChange={(event) => updateQuestion(q.key, { label: event.target.value })}
                placeholder="Question"
                maxLength={500}
              />
              {q.type === "multiple_choice" && (
                <input
                  type="text"
                  className={styles.input}
                  value={q.optionsText}
                  onChange={(event) =>
                    updateQuestion(q.key, {
                      optionsText: event.target.value,
                      options: parseOptionsText(event.target.value),
                    })
                  }
                  placeholder="Options, comma separated (e.g. Email, Slack, Phone)"
                />
              )}
            </div>
          ))}
          <button type="button" className={styles.addButton} onClick={() => setQuestions((rows) => [...rows, newQuestion()])}>
            <Plus /> Add question
          </button>
        </div>
      )}

      <div className={styles.actions}>
        <div className={styles.actionsLeft}>
          {!isNew && (
            <button type="button" className={styles.ghostDanger} disabled={isPending} onClick={() => setDeleteOpen(true)}>
              Delete
            </button>
          )}
          <button
            type="button"
            className={styles.ghost}
            disabled={isPending}
            onClick={() => setSaveTemplateOpen(true)}
          >
            Save as template
          </button>
        </div>
        <div className={styles.actionsRight}>
          <button type="button" className={styles.ghost} disabled={isPending} onClick={handleSaveDraft}>
            Save draft
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={isPending || isNew}
            onClick={() => setSendOpen(true)}
          >
            Send to client
          </button>
        </div>
      </div>
      {isNew && <p className={styles.hint}>Save the draft first, then send it to the client.</p>}

      <Dialog.Root open={sendOpen} onOpenChange={setSendOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Send this kickoff">
            <Dialog.Title className={styles.dialogTitle}>Send this kickoff?</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              The client&apos;s primary portal contact gets an email and can answer it from their portal. Once sent,
              the questions are frozen — the project moves to &ldquo;Waiting on client&rdquo; until they finish.
            </Dialog.Description>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.ghost} onClick={() => setSendOpen(false)}>
                Cancel
              </button>
              <button type="button" className={styles.primary} disabled={isPending} onClick={handleSend}>
                Send kickoff
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Delete this kickoff">
            <Dialog.Title className={styles.dialogTitle}>Delete this kickoff?</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>This can&apos;t be undone.</Dialog.Description>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.ghost} onClick={() => setDeleteOpen(false)}>
                Cancel
              </button>
              <button type="button" className={styles.dangerSolid} disabled={isPending} onClick={handleDelete}>
                Delete kickoff
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Save these questions as a template">
            <Dialog.Title className={styles.dialogTitle}>Save as a reusable template</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              The current question list gets saved to your agency&apos;s kickoff templates, so you can start future
              projects from it.
            </Dialog.Description>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Template name</span>
              <input
                type="text"
                className={styles.input}
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="Standard discovery"
              />
            </label>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.ghost} onClick={() => setSaveTemplateOpen(false)}>
                Cancel
              </button>
              <button type="button" className={styles.primary} disabled={isPending} onClick={handleSaveTemplate}>
                Save template
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

export default KickoffBuilder;
