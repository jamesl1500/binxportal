/**
 * KickoffStatusView.tsx
 *
 * Read-only view of a kickoff once it's frozen (sent or completed) — its
 * questions, and each one's answer once the client has submitted. Sent:
 * offers a "Remind client" nudge email. Completed: shows every answer and,
 * once, a "Convert to tasks" action that turns each answered question into a
 * task on the project board (list picker defaults to the first column).
 *
 * @module apps/binx-web/src/components/kickoffs/KickoffStatusView/KickoffStatusView.tsx
 * @author Binx Portal
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { toast } from "sonner";

import type { KickoffDetail } from "@/lib/kickoffs";
import {
  convertKickoffAction,
  nudgeKickoffAction,
} from "@/app/(app)/projects/[projectId]/kickoff/actions";

import styles from "./KickoffStatusView.module.scss";

interface TaskListOption {
  id: string;
  name: string;
}

interface KickoffStatusViewProps {
  agencyId: string;
  projectId: string;
  kickoff: KickoffDetail;
  taskLists: TaskListOption[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function answerDisplay(
  question: KickoffDetail["questions"][number],
  answer: KickoffDetail["answers"][number] | undefined,
) {
  if (!answer) return <span className={styles.unanswered}>Not answered</span>;
  if (question.type === "file_upload") {
    return answer.file_name ? (
      <span>Uploaded: {answer.file_name}</span>
    ) : (
      <span className={styles.unanswered}>No file</span>
    );
  }
  if (question.type === "multiple_choice") {
    return <span>{answer.selected_options.join(", ") || "—"}</span>;
  }
  return <span>{answer.text_value || "—"}</span>;
}

const KickoffStatusView = ({
  agencyId,
  projectId,
  kickoff,
  taskLists,
}: KickoffStatusViewProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [convertOpen, setConvertOpen] = useState(false);
  const [listId, setListId] = useState(taskLists[0]?.id ?? "");

  const answersByQuestion = new Map(
    kickoff.answers.map((a) => [a.question_id, a]),
  );

  const handleNudge = () => {
    startTransition(async () => {
      const result = await nudgeKickoffAction(agencyId, projectId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Reminder sent");
      router.refresh();
    });
  };

  const handleConvert = () => {
    startTransition(async () => {
      const result = await convertKickoffAction(
        agencyId,
        projectId,
        listId || null,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setConvertOpen(false);
      toast.success(
        `${result.tasksCreated ?? 0} task${result.tasksCreated === 1 ? "" : "s"} added to the board`,
      );
      router.refresh();
    });
  };

  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{kickoff.title}</h2>
          {kickoff.intro_message && (
            <p className={styles.intro}>{kickoff.intro_message}</p>
          )}
        </div>
        <span className={styles.statusBadge} data-status={kickoff.status}>
          {kickoff.status === "sent" ? "Sent — waiting on client" : "Completed"}
        </span>
      </div>

      <dl className={styles.meta}>
        {kickoff.sent_at && (
          <div>
            <dt>Sent</dt>
            <dd>{formatDate(kickoff.sent_at)}</dd>
          </div>
        )}
        {kickoff.last_nudged_at && (
          <div>
            <dt>Last reminded</dt>
            <dd>{formatDate(kickoff.last_nudged_at)}</dd>
          </div>
        )}
        {kickoff.completed_at && (
          <div>
            <dt>Completed</dt>
            <dd>{formatDate(kickoff.completed_at)}</dd>
          </div>
        )}
      </dl>

      <div className={styles.actions}>
        {kickoff.status === "sent" && (
          <button
            type="button"
            className={styles.ghost}
            disabled={isPending}
            onClick={handleNudge}
          >
            Remind client
          </button>
        )}
        {kickoff.status === "completed" && !kickoff.converted_at && (
          <button
            type="button"
            className={styles.primary}
            disabled={isPending}
            onClick={() => setConvertOpen(true)}
          >
            Convert to tasks
          </button>
        )}
        {kickoff.status === "completed" && kickoff.converted_at && (
          <span className={styles.hint}>
            Converted to tasks on {formatDate(kickoff.converted_at)} —{" "}
            <Link href={`/projects/${projectId}/board`}>view the board</Link>
          </span>
        )}
      </div>

      <div className={styles.questions}>
        {kickoff.questions.map((question) => (
          <div key={question.id} className={styles.questionRow}>
            <span className={styles.questionLabel}>
              {question.label}
              {question.required && <span className={styles.required}> *</span>}
            </span>
            <div className={styles.answer}>
              {answerDisplay(question, answersByQuestion.get(question.id))}
            </div>
          </div>
        ))}
      </div>

      <Dialog.Root open={convertOpen} onOpenChange={setConvertOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup
            className={styles.dialog}
            aria-label="Convert kickoff answers to tasks"
          >
            <Dialog.Title className={styles.dialogTitle}>
              Convert answers to tasks?
            </Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              One task is added per answered question, each with the answer as
              its description.
            </Dialog.Description>
            {taskLists.length > 0 && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Add to list</span>
                <select
                  className={styles.select}
                  value={listId}
                  onChange={(event) => setListId(event.target.value)}
                >
                  {taskLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => setConvertOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={isPending}
                onClick={handleConvert}
              >
                Convert
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

export default KickoffStatusView;
