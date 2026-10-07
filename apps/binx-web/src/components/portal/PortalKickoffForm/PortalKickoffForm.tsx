/**
 * PortalKickoffForm.tsx
 *
 * What a client fills out for their project's kickoff: each question
 * rendered by type (short text, multiple choice as radio buttons, or a file
 * picker), a required-field check before submit, and a one-shot Submit —
 * once completed, this same component re-renders as a read-only summary
 * (the page re-fetches after the server action revalidates). File
 * questions upload immediately on pick (see uploadPortalKickoffFileAction)
 * so the final submit only ever sends small JSON.
 *
 * @module apps/binx-web/src/components/portal/PortalKickoffForm/PortalKickoffForm.tsx
 * @author Binx Portal
 */
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { PortalKickoff } from "@/lib/portal";
import {
  submitPortalKickoffAnswersAction,
  uploadPortalKickoffFileAction,
} from "@/app/(portal)/portal/projects/[projectId]/kickoff/actions";

import styles from "./PortalKickoffForm.module.scss";

interface PortalKickoffFormProps {
  projectId: string;
  kickoff: PortalKickoff;
}

interface AnswerState {
  textValue: string;
  selectedOption: string;
  fileId: string | null;
  fileName: string | null;
}

function emptyAnswer(): AnswerState {
  return { textValue: "", selectedOption: "", fileId: null, fileName: null };
}

const PortalKickoffForm = ({ projectId, kickoff }: PortalKickoffFormProps) => {
  const [isPending, startTransition] = useTransition();
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const answersById = kickoff.answers.reduce<Record<string, AnswerState>>(
    (acc, a) => {
      acc[a.question_id] = {
        textValue: a.text_value ?? "",
        selectedOption: a.selected_options[0] ?? "",
        fileId: a.file_id,
        fileName: a.file_name,
      };
      return acc;
    },
    {},
  );
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() => {
    const initial: Record<string, AnswerState> = {};
    for (const q of kickoff.questions) {
      initial[q.id] = answersById[q.id] ?? emptyAnswer();
    }
    return initial;
  });

  const isCompleted = kickoff.status === "completed";

  const updateAnswer = (questionId: string, patch: Partial<AnswerState>) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], ...patch },
    }));
  };

  const handleFilePick = async (questionId: string, file: File) => {
    setUploadingId(questionId);
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadPortalKickoffFileAction(projectId, formData);
    setUploadingId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    updateAnswer(questionId, {
      fileId: result.fileId ?? null,
      fileName: result.fileName ?? null,
    });
  };

  const handleSubmit = () => {
    const missing = kickoff.questions.find((q) => {
      if (!q.required) return false;
      const a = answers[q.id];
      if (q.type === "text") return a.textValue.trim() === "";
      if (q.type === "multiple_choice") return a.selectedOption === "";
      return a.fileId === null;
    });
    if (missing) {
      toast.error(`“${missing.label}” is required`);
      return;
    }

    startTransition(async () => {
      const result = await submitPortalKickoffAnswersAction(
        projectId,
        kickoff.questions.map((q) => ({
          questionId: q.id,
          textValue: answers[q.id].textValue || null,
          selectedOptions: answers[q.id].selectedOption
            ? [answers[q.id].selectedOption]
            : [],
          fileId: answers[q.id].fileId,
        })),
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Thanks — your answers were submitted");
    });
  };

  return (
    <div className={styles.form}>
      <div className={styles.header}>
        <h2 className={styles.title}>{kickoff.title}</h2>
        {kickoff.intro_message && (
          <p className={styles.intro}>{kickoff.intro_message}</p>
        )}
      </div>

      {isCompleted && (
        <p className={styles.completedNotice}>
          You&apos;ve completed this kickoff. Thanks!
        </p>
      )}

      <div className={styles.questions}>
        {kickoff.questions.map((question) => {
          const answer = answers[question.id];
          return (
            <div key={question.id} className={styles.questionRow}>
              <span className={styles.questionLabel}>
                {question.label}
                {question.required && (
                  <span className={styles.required}> *</span>
                )}
              </span>

              {question.type === "text" && (
                <textarea
                  className={styles.textarea}
                  value={answer.textValue}
                  onChange={(event) =>
                    updateAnswer(question.id, { textValue: event.target.value })
                  }
                  disabled={isCompleted}
                  rows={2}
                  maxLength={8000}
                />
              )}

              {question.type === "multiple_choice" && (
                <div className={styles.options}>
                  {question.options.map((option) => (
                    <label key={option} className={styles.optionLabel}>
                      <input
                        type="radio"
                        name={question.id}
                        value={option}
                        checked={answer.selectedOption === option}
                        onChange={() =>
                          updateAnswer(question.id, { selectedOption: option })
                        }
                        disabled={isCompleted}
                      />
                      {option}
                    </label>
                  ))}
                </div>
              )}

              {question.type === "file_upload" && (
                <div className={styles.fileRow}>
                  {answer.fileName && (
                    <span className={styles.fileName}>{answer.fileName}</span>
                  )}
                  {!isCompleted && (
                    <>
                      <input
                        type="file"
                        className={styles.fileInput}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void handleFilePick(question.id, file);
                        }}
                      />
                      {uploadingId === question.id && (
                        <span className={styles.uploading}>Uploading…</span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!isCompleted && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            disabled={isPending}
            onClick={handleSubmit}
          >
            Submit answers
          </button>
        </div>
      )}
    </div>
  );
};

export default PortalKickoffForm;
