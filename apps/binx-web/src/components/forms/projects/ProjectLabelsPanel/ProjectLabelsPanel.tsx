/**
 * ProjectLabelsPanel.tsx
 *
 * Manage a project's custom labels — either its member roles ("Project
 * Manager", "Web Developer") or its task tags ("Bug", "Design", "Urgent").
 * Both are the same shape (a name plus a colour, unique per project), so one
 * component drives both, switched by the `kind` prop. Used twice on the
 * project Settings page.
 *
 * Creating/renaming/recolouring/deleting each hit their server action, then
 * `router.refresh()` so the other tabs that read these (Team's role picker,
 * the task panel's tag picker) pick the change up.
 *
 * @module apps/binx-web/src/components/forms/projects/ProjectLabelsPanel/ProjectLabelsPanel.tsx
 * @author Binx.io
 */
"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Trash2, X } from "lucide-react";

import {
  createProjectRoleAction,
  createProjectTagAction,
  deleteProjectRoleAction,
  deleteProjectTagAction,
  updateProjectRoleAction,
  updateProjectTagAction,
} from "@/app/(app)/projects/[projectId]/actions";
import type { ProjectRole, ProjectTag } from "@/lib/projects";

import styles from "./ProjectLabelsPanel.module.scss";

/** A role and a tag are the same shape to this component. */
type Label = ProjectRole | ProjectTag;

type LabelKind = "role" | "tag";

interface ProjectLabelsPanelProps {
  agencyId: string;
  projectId: string;
  kind: LabelKind;
  labels: Label[];
}

const DEFAULT_COLOR = "#6e6e76";

/** A small, fixed palette so labels stay visually consistent across a project. */
const PALETTE = ["#6e6e76", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777"];

const CONFIG: Record<
  LabelKind,
  {
    noun: string;
    nounPlural: string;
    placeholder: string;
    maxLength: number;
    emptyText: string;
    create: (agencyId: string, projectId: string, name: string, color: string) => Promise<{ error?: string; role?: ProjectRole; tag?: ProjectTag }>;
    update: (
      agencyId: string,
      projectId: string,
      id: string,
      name: string,
      color: string,
    ) => Promise<{ error?: string; role?: ProjectRole; tag?: ProjectTag }>;
    remove: (agencyId: string, projectId: string, id: string) => Promise<{ error?: string }>;
  }
> = {
  role: {
    noun: "role",
    nounPlural: "roles",
    placeholder: 'e.g. "Project Manager"',
    maxLength: 100,
    emptyText: "No roles yet. Add ones like “Project Manager” or “Web Developer” to label who does what.",
    create: createProjectRoleAction,
    update: updateProjectRoleAction,
    remove: deleteProjectRoleAction,
  },
  tag: {
    noun: "tag",
    nounPlural: "tags",
    placeholder: 'e.g. "Bug"',
    maxLength: 50,
    emptyText: "No tags yet. Add ones like “Bug”, “Design”, or “Urgent” to categorise tasks on the board.",
    create: createProjectTagAction,
    update: updateProjectTagAction,
    remove: deleteProjectTagAction,
  },
};

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label: string;
}

const ColorPicker = ({ value, onChange, label }: ColorPickerProps) => (
  <div className={styles.colorPicker} role="radiogroup" aria-label={label}>
    {PALETTE.map((color) => (
      <button
        key={color}
        type="button"
        role="radio"
        aria-checked={value.toLowerCase() === color}
        aria-label={color}
        className={styles.swatch}
        data-selected={value.toLowerCase() === color}
        style={{ background: color }}
        onClick={() => onChange(color)}
      />
    ))}
  </div>
);

const ProjectLabelsPanel = ({ agencyId, projectId, kind, labels: initialLabels }: ProjectLabelsPanelProps) => {
  const router = useRouter();
  const config = CONFIG[kind];

  const [labels, setLabels] = useState<Label[]>(initialLabels);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(DEFAULT_COLOR);

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;

    setError(null);
    setBusyId("new");
    startTransition(async () => {
      const result = await config.create(agencyId, projectId, name, newColor);
      setBusyId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      const created = (result.role ?? result.tag) as Label;
      setLabels((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setNewColor(DEFAULT_COLOR);
      router.refresh();
    });
  };

  const startEditing = (label: Label) => {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
    setError(null);
  };

  const handleUpdate = (event: FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    const name = editName.trim();
    if (!name) return;

    setError(null);
    setBusyId(editingId);
    startTransition(async () => {
      const result = await config.update(agencyId, projectId, editingId, name, editColor);
      setBusyId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      const updated = (result.role ?? result.tag) as Label;
      setLabels((prev) =>
        prev.map((label) => (label.id === updated.id ? updated : label)).sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingId(null);
      router.refresh();
    });
  };

  const handleDelete = (label: Label) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete the “${label.name}” ${config.noun}?`)) return;

    setError(null);
    setBusyId(label.id);
    startTransition(async () => {
      const result = await config.remove(agencyId, projectId, label.id);
      setBusyId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setLabels((prev) => prev.filter((item) => item.id !== label.id));
      router.refresh();
    });
  };

  return (
    <div className={styles.wrapper}>
      {labels.length === 0 ? (
        <p className={styles.emptyText}>{config.emptyText}</p>
      ) : (
        <ul className={styles.list}>
          {labels.map((label) => {
            const isBusy = isPending && busyId === label.id;

            if (editingId === label.id) {
              return (
                <li key={label.id} className={styles.row}>
                  <form className={styles.editForm} onSubmit={handleUpdate}>
                    <input
                      autoFocus
                      className={styles.input}
                      value={editName}
                      maxLength={config.maxLength}
                      onChange={(event) => setEditName(event.target.value)}
                      aria-label={`${config.noun} name`}
                    />
                    <ColorPicker value={editColor} onChange={setEditColor} label={`${config.noun} colour`} />
                    <div className={styles.editActions}>
                      <button type="submit" className={styles.iconConfirm} disabled={isBusy || !editName.trim()} aria-label="Save">
                        <Check aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => setEditingId(null)}
                        aria-label="Cancel"
                      >
                        <X aria-hidden="true" />
                      </button>
                    </div>
                  </form>
                </li>
              );
            }

            return (
              <li key={label.id} className={styles.row}>
                <span className={styles.labelChip} style={{ borderColor: label.color, color: label.color }}>
                  <span className={styles.labelDot} style={{ background: label.color }} aria-hidden="true" />
                  {label.name}
                </span>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => startEditing(label)}
                    disabled={isBusy}
                    aria-label={`Edit ${label.name}`}
                  >
                    <Pencil aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.iconDanger}
                    onClick={() => handleDelete(label)}
                    disabled={isBusy}
                    aria-label={`Delete ${label.name}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form className={styles.addForm} onSubmit={handleCreate}>
        <input
          className={styles.input}
          value={newName}
          maxLength={config.maxLength}
          placeholder={config.placeholder}
          onChange={(event) => setNewName(event.target.value)}
          aria-label={`New ${config.noun} name`}
        />
        <ColorPicker value={newColor} onChange={setNewColor} label={`New ${config.noun} colour`} />
        <button
          type="submit"
          className={styles.addButton}
          disabled={(isPending && busyId === "new") || !newName.trim()}
        >
          Add {config.noun}
        </button>
      </form>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default ProjectLabelsPanel;
