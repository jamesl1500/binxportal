/**
 * EducationEntryList.tsx
 *
 * A repeatable list of education entries (school, degree, field of study,
 * start/end year, description) — same repeatable-card shape as
 * ExperienceEntryList.
 *
 * @module apps/binx-web/src/components/forms/account/EducationEntryList/EducationEntryList.tsx
 * @author Binx.io
 */
"use client";

import { Plus, Trash2 } from "lucide-react";

import type { EducationEntry } from "@/lib/users";

import styles from "./EducationEntryList.module.scss";

interface EducationEntryListProps {
  value: EducationEntry[];
  onChange: (next: EducationEntry[]) => void;
  max?: number;
}

const MAX_ENTRIES = 20;

function blankEntry(): EducationEntry {
  return {
    id: crypto.randomUUID(),
    school: "",
    degree: "",
    field_of_study: null,
    start_year: null,
    end_year: null,
    description: null,
  };
}

const EducationEntryList = ({ value, onChange, max = MAX_ENTRIES }: EducationEntryListProps) => {
  const update = (id: string, patch: Partial<EducationEntry>) => {
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
              <label className={styles.label} htmlFor={`${entry.id}-school`}>
                School
              </label>
              <input
                id={`${entry.id}-school`}
                type="text"
                className={styles.input}
                placeholder="State University"
                value={entry.school}
                onChange={(event) => update(entry.id, { school: event.target.value })}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${entry.id}-degree`}>
                Degree
              </label>
              <input
                id={`${entry.id}-degree`}
                type="text"
                className={styles.input}
                placeholder="B.S. Computer Science"
                value={entry.degree}
                onChange={(event) => update(entry.id, { degree: event.target.value })}
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${entry.id}-field`}>
                Field of study
              </label>
              <input
                id={`${entry.id}-field`}
                type="text"
                className={styles.input}
                value={entry.field_of_study ?? ""}
                onChange={(event) => update(entry.id, { field_of_study: event.target.value || null })}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${entry.id}-start-year`}>
                Years
              </label>
              <div className={styles.yearRow}>
                <input
                  id={`${entry.id}-start-year`}
                  type="number"
                  className={styles.input}
                  min={1900}
                  max={2100}
                  placeholder="Start"
                  value={entry.start_year ?? ""}
                  onChange={(event) =>
                    update(entry.id, { start_year: event.target.value ? Number(event.target.value) : null })
                  }
                />
                <span className={styles.yearSeparator}>–</span>
                <input
                  aria-label="End year"
                  type="number"
                  className={styles.input}
                  min={1900}
                  max={2100}
                  placeholder="End"
                  value={entry.end_year ?? ""}
                  onChange={(event) =>
                    update(entry.id, { end_year: event.target.value ? Number(event.target.value) : null })
                  }
                />
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
          <Plus aria-hidden="true" /> Add education
        </button>
      )}
    </div>
  );
};

export default EducationEntryList;
