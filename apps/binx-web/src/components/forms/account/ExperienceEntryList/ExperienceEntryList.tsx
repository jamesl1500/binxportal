/**
 * ExperienceEntryList.tsx
 *
 * A repeatable list of work-experience entries (title, organization, start/
 * end year or "Present", description) — "Add experience" appends a blank
 * card, each card has its own remove button. Controlled — the parent
 * (QualificationsForm) owns the `experience` list. Entries carry a
 * client-generated `id` (crypto.randomUUID()) purely for React keys/removal
 * — it's just part of the JSON object binx-api stores, not a database key.
 *
 * @module apps/binx-web/src/components/forms/account/ExperienceEntryList/ExperienceEntryList.tsx
 * @author Binx.io
 */
"use client";

import { Plus, Trash2 } from "lucide-react";

import type { ExperienceEntry } from "@/lib/users";

import styles from "./ExperienceEntryList.module.scss";

interface ExperienceEntryListProps {
  value: ExperienceEntry[];
  onChange: (next: ExperienceEntry[]) => void;
  max?: number;
}

const MAX_ENTRIES = 20;
const CURRENT_YEAR = new Date().getFullYear();

function blankEntry(): ExperienceEntry {
  return {
    id: crypto.randomUUID(),
    title: "",
    organization: "",
    start_year: CURRENT_YEAR,
    end_year: null,
    description: null,
  };
}

const ExperienceEntryList = ({ value, onChange, max = MAX_ENTRIES }: ExperienceEntryListProps) => {
  const update = (id: string, patch: Partial<ExperienceEntry>) => {
    onChange(value.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  };

  const remove = (id: string) => {
    onChange(value.filter((entry) => entry.id !== id));
  };

  return (
    <div className={styles.wrapper}>
      {value.map((entry) => (
        <div key={entry.id} className={styles.card}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${entry.id}-title`}>
                Title
              </label>
              <input
                id={`${entry.id}-title`}
                type="text"
                className={styles.input}
                placeholder="Senior Developer"
                value={entry.title}
                onChange={(event) => update(entry.id, { title: event.target.value })}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${entry.id}-organization`}>
                Organization
              </label>
              <input
                id={`${entry.id}-organization`}
                type="text"
                className={styles.input}
                placeholder="Acme Co."
                value={entry.organization}
                onChange={(event) => update(entry.id, { organization: event.target.value })}
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${entry.id}-start-year`}>
                Start year
              </label>
              <input
                id={`${entry.id}-start-year`}
                type="number"
                className={styles.input}
                min={1900}
                max={2100}
                value={entry.start_year}
                onChange={(event) => update(entry.id, { start_year: Number(event.target.value) })}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${entry.id}-end-year`}>
                End year
              </label>
              <div className={styles.endYearRow}>
                <input
                  id={`${entry.id}-end-year`}
                  type="number"
                  className={styles.input}
                  min={1900}
                  max={2100}
                  placeholder="Present"
                  disabled={entry.end_year === null}
                  value={entry.end_year ?? ""}
                  onChange={(event) => update(entry.id, { end_year: Number(event.target.value) })}
                />
                <label className={styles.presentToggle}>
                  <input
                    type="checkbox"
                    checked={entry.end_year === null}
                    onChange={(event) =>
                      update(entry.id, { end_year: event.target.checked ? null : CURRENT_YEAR })
                    }
                  />
                  Present
                </label>
              </div>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${entry.id}-description`}>
              Description
            </label>
            <textarea
              id={`${entry.id}-description`}
              className={styles.textarea}
              rows={2}
              value={entry.description ?? ""}
              onChange={(event) => update(entry.id, { description: event.target.value || null })}
            />
          </div>

          <button type="button" className={styles.remove} onClick={() => remove(entry.id)}>
            <Trash2 aria-hidden="true" /> Remove
          </button>
        </div>
      ))}

      {value.length < max && (
        <button type="button" className={styles.addButton} onClick={() => onChange([...value, blankEntry()])}>
          <Plus aria-hidden="true" /> Add experience
        </button>
      )}
    </div>
  );
};

export default ExperienceEntryList;
