/**
 * LabelColorPicker.tsx
 *
 * The fixed swatch palette for project labels (member roles and task tags),
 * shared by the Settings label panels and the "New project" wizard so a
 * label looks the same wherever it was made.
 *
 * @module apps/binx-web/src/components/forms/projects/LabelColorPicker/LabelColorPicker.tsx
 * @author Binx Portal
 */
"use client";

import styles from "./LabelColorPicker.module.scss";

export const DEFAULT_LABEL_COLOR = "#6e6e76";

/** A small, fixed palette so labels stay visually consistent across a project. */
export const LABEL_PALETTE = [
  "#6e6e76",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#7c3aed",
  "#db2777",
];

interface LabelColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label: string;
}

const LabelColorPicker = ({
  value,
  onChange,
  label,
}: LabelColorPickerProps) => (
  <div className={styles.colorPicker} role="radiogroup" aria-label={label}>
    {LABEL_PALETTE.map((color) => (
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

export default LabelColorPicker;
