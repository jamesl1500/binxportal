/**
 * AiTaskSetup.tsx
 *
 * Shown right after a project is created (on the `/projects/new` page, via
 * NewProjectForm, in place of the form): offers to draft a starter kanban
 * board with AI, then
 * lets the user review/edit the suggestion (rename or drop a list/task)
 * before applying it — nothing is written to the board until confirmed.
 * Skipping at any point (or an AI failure) just calls `onDone()`, same as
 * declining the offer outright — the project itself already exists either way.
 *
 * @module apps/binx-web/src/components/projects/AiTaskSetup/AiTaskSetup.tsx
 * @author Binx.io
 */
"use client";

import { useState } from "react";
import { Sparkles, Trash2 } from "lucide-react";

import {
  applyProjectTaskSuggestionsAction,
  suggestProjectTasksAction,
} from "@/app/(app)/projects/[projectId]/actions";
import type { AiTaskSuggestions } from "@/lib/ai";

import styles from "./AiTaskSetup.module.scss";

interface AiTaskSetupProps {
  agencyId: string;
  projectId: string;
  onDone: () => void;
}

type Step = "offer" | "loading" | "review" | "applying" | "error";

const AiTaskSetup = ({ agencyId, projectId, onDone }: AiTaskSetupProps) => {
  const [step, setStep] = useState<Step>("offer");
  const [suggestions, setSuggestions] = useState<AiTaskSuggestions | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSuggest = async () => {
    setStep("loading");
    const result = await suggestProjectTasksAction(agencyId, projectId);
    if (result.error || !result.suggestions || result.suggestions.lists.length === 0) {
      setError(result.error ?? "The AI didn't come back with any suggestions.");
      setStep("error");
      return;
    }
    setSuggestions(result.suggestions);
    setStep("review");
  };

  const handleApply = async () => {
    if (!suggestions) return;
    setStep("applying");
    const result = await applyProjectTaskSuggestionsAction(agencyId, projectId, suggestions);
    if (result.error) {
      setError(result.error);
      setStep("error");
      return;
    }
    onDone();
  };

  const removeList = (listIndex: number) => {
    setSuggestions((prev) =>
      prev ? { lists: prev.lists.filter((_, index) => index !== listIndex) } : prev,
    );
  };

  const renameList = (listIndex: number, name: string) => {
    setSuggestions((prev) =>
      prev
        ? { lists: prev.lists.map((lst, index) => (index === listIndex ? { ...lst, name } : lst)) }
        : prev,
    );
  };

  const removeTask = (listIndex: number, taskIndex: number) => {
    setSuggestions((prev) =>
      prev
        ? {
            lists: prev.lists.map((lst, index) =>
              index === listIndex ? { ...lst, tasks: lst.tasks.filter((_, i) => i !== taskIndex) } : lst,
            ),
          }
        : prev,
    );
  };

  const renameTask = (listIndex: number, taskIndex: number, title: string) => {
    setSuggestions((prev) =>
      prev
        ? {
            lists: prev.lists.map((lst, index) =>
              index === listIndex
                ? { ...lst, tasks: lst.tasks.map((t, i) => (i === taskIndex ? { ...t, title } : t)) }
                : lst,
            ),
          }
        : prev,
    );
  };

  if (step === "offer") {
    return (
      <div className={styles.offer}>
        <p className={styles.offerText}>
          <Sparkles className={styles.sparkleIcon} aria-hidden="true" />
          Set up a starter task list with AI?
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.skip} onClick={onDone}>
            Skip
          </button>
          <button type="button" className={styles.suggest} onClick={() => void handleSuggest()}>
            Suggest tasks
          </button>
        </div>
      </div>
    );
  }

  if (step === "loading") {
    return <p className={styles.status}>Thinking through a starter board…</p>;
  }

  if (step === "error") {
    return (
      <div className={styles.offer}>
        <p className={styles.formError}>{error}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.suggest} onClick={onDone}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (!suggestions) return null;

  const totalTasks = suggestions.lists.reduce((sum, lst) => sum + lst.tasks.length, 0);

  return (
    <div className={styles.review}>
      <p className={styles.reviewHint}>Edit or remove anything before adding it to the board.</p>
      <ul className={styles.lists}>
        {suggestions.lists.map((lst, listIndex) => (
          <li key={listIndex} className={styles.list}>
            <div className={styles.listHeader}>
              <input
                type="text"
                className={styles.listNameInput}
                value={lst.name}
                onChange={(event) => renameList(listIndex, event.target.value)}
                aria-label={`List ${listIndex + 1} name`}
              />
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => removeList(listIndex)}
                aria-label={`Remove list "${lst.name}"`}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
            <ul className={styles.tasks}>
              {lst.tasks.map((task, taskIndex) => (
                <li key={taskIndex} className={styles.task}>
                  <input
                    type="text"
                    className={styles.taskTitleInput}
                    value={task.title}
                    onChange={(event) => renameTask(listIndex, taskIndex, event.target.value)}
                    aria-label={`Task ${taskIndex + 1} title in ${lst.name}`}
                  />
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => removeTask(listIndex, taskIndex)}
                    aria-label={`Remove task "${task.title}"`}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <div className={styles.actions}>
        <button type="button" className={styles.skip} onClick={onDone}>
          Skip
        </button>
        <button
          type="button"
          className={styles.suggest}
          onClick={() => void handleApply()}
          disabled={step !== "review" || suggestions.lists.length === 0 || totalTasks === 0}
        >
          {step === "applying" ? "Adding…" : "Add to board"}
        </button>
      </div>
    </div>
  );
};

export default AiTaskSetup;
