/**
 * ProjectLabelSetup.tsx
 *
 * A "New project" wizard step for choosing the project's task tags or member
 * roles before the project exists: one-click suggestions plus custom labels
 * with a colour. Purely local state — it edits a list of drafts the wizard
 * holds, and nothing is saved until the wizard's final "Create project".
 * (Once a project exists, ProjectLabelsPanel in Settings manages the real ones.)
 *
 * @module apps/binx-web/src/components/forms/projects/ProjectLabelSetup/ProjectLabelSetup.tsx
 * @author Binx.io
 */
"use client";

import { FormEvent, useState } from "react";
import { Check, Plus, X } from "lucide-react";

import LabelColorPicker, { DEFAULT_LABEL_COLOR } from "@/components/forms/projects/LabelColorPicker/LabelColorPicker";
import type { ProjectLabelDraft } from "@/lib/projects";

import styles from "./ProjectLabelSetup.module.scss";

interface ProjectLabelSetupProps {
  /** Singular noun for copy and aria labels, e.g. "tag" or "role". */
  noun: string;
  suggestions: ProjectLabelDraft[];
  labels: ProjectLabelDraft[];
  onChange: (labels: ProjectLabelDraft[]) => void;
  maxLength: number;
  placeholder: string;
}

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

const ProjectLabelSetup = ({ noun, suggestions, labels, onChange, maxLength, placeholder }: ProjectLabelSetupProps) => {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_LABEL_COLOR);
  const [error, setError] = useState<string | null>(null);

  const isSelected = (name: string) => labels.some((label) => sameName(label.name, name));

  const toggleSuggestion = (suggestion: ProjectLabelDraft) => {
    setError(null);
    onChange(
      isSelected(suggestion.name)
        ? labels.filter((label) => !sameName(label.name, suggestion.name))
        : [...labels, suggestion],
    );
  };

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (isSelected(name)) {
      setError(`There's already a ${noun} called “${name}”.`);
      return;
    }
    setError(null);
    onChange([...labels, { name, color: newColor }]);
    setNewName("");
    setNewColor(DEFAULT_LABEL_COLOR);
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.group}>
        <span className={styles.groupLabel}>Suggestions</span>
        <div className={styles.chips}>
          {suggestions.map((suggestion) => {
            const selected = isSelected(suggestion.name);
            return (
              <button
                key={suggestion.name}
                type="button"
                className={styles.suggestion}
                aria-pressed={selected}
                onClick={() => toggleSuggestion(suggestion)}
                style={selected ? { borderColor: suggestion.color, color: suggestion.color } : undefined}
              >
                {selected ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                {suggestion.name}
              </button>
            );
          })}
        </div>
      </div>

      <form className={styles.addForm} onSubmit={handleAdd}>
        <span className={styles.groupLabel}>Add your own</span>
        <div className={styles.addRow}>
          <input
            className={styles.input}
            value={newName}
            maxLength={maxLength}
            placeholder={placeholder}
            onChange={(event) => setNewName(event.target.value)}
            aria-label={`New ${noun} name`}
          />
          <button type="submit" className={styles.addButton} disabled={!newName.trim()}>
            Add {noun}
          </button>
        </div>
        <LabelColorPicker value={newColor} onChange={setNewColor} label={`New ${noun} colour`} />
      </form>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.group}>
        <span className={styles.groupLabel}>
          This project&apos;s {noun}s ({labels.length})
        </span>
        {labels.length === 0 ? (
          <p className={styles.empty}>Pick at least one {noun} to continue.</p>
        ) : (
          <ul className={styles.selected}>
            {labels.map((label) => (
              <li key={label.name} className={styles.chip} style={{ borderColor: label.color, color: label.color }}>
                <span className={styles.dot} style={{ background: label.color }} aria-hidden="true" />
                {label.name}
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => onChange(labels.filter((item) => item !== label))}
                  aria-label={`Remove ${label.name}`}
                >
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ProjectLabelSetup;
