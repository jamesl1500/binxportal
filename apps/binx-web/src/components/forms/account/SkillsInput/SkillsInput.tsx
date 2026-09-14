/**
 * SkillsInput.tsx
 *
 * A chip/tag input for a freeform list of skills: type a skill and press
 * Enter or "," to add it, click a chip's × to remove it. Controlled —
 * the parent (QualificationsForm) owns the `skills` list.
 *
 * @module apps/binx-web/src/components/forms/account/SkillsInput/SkillsInput.tsx
 * @author Binx.io
 */
"use client";

import { KeyboardEvent, useState } from "react";
import { X } from "lucide-react";

import styles from "./SkillsInput.module.scss";

interface SkillsInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
}

const MAX_SKILLS = 40;
const MAX_SKILL_LENGTH = 50;

const SkillsInput = ({ value, onChange, max = MAX_SKILLS }: SkillsInputProps) => {
  const [draft, setDraft] = useState("");

  const addSkill = () => {
    const skill = draft.trim().slice(0, MAX_SKILL_LENGTH);
    if (!skill || value.length >= max || value.includes(skill)) {
      setDraft("");
      return;
    }
    onChange([...value, skill]);
    setDraft("");
  };

  const removeSkill = (skill: string) => {
    onChange(value.filter((existing) => existing !== skill));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addSkill();
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      removeSkill(value[value.length - 1]);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.chips}>
        {value.map((skill) => (
          <span key={skill} className={styles.chip}>
            {skill}
            <button
              type="button"
              className={styles.chipRemove}
              onClick={() => removeSkill(skill)}
              aria-label={`Remove ${skill}`}
            >
              <X aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          type="text"
          className={styles.input}
          aria-label="Add a skill"
          placeholder={value.length === 0 ? "e.g. Python, Figma, project management" : "Add another…"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addSkill}
          disabled={value.length >= max}
        />
      </div>
      <p className={styles.hint}>
        Press Enter or comma to add a skill. {value.length}/{max}
      </p>
    </div>
  );
};

export default SkillsInput;
