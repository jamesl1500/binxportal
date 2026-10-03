/**
 * SegmentedFilter.tsx
 *
 * A small pill-style toggle group ("All 4 · Unpaid 1 · Paid 3") for the
 * portal's list pages. Buttons with `aria-pressed`, so it's plain toggle
 * semantics for assistive tech and keyboard users.
 *
 * @module apps/binx-web/src/components/portal/SegmentedFilter/SegmentedFilter.tsx
 * @author Binx Portal
 */
"use client";

import styles from "./SegmentedFilter.module.scss";

interface SegmentedFilterOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface SegmentedFilterProps<T extends string> {
  label: string;
  value: T;
  options: SegmentedFilterOption<T>[];
  onChange: (value: T) => void;
}

const SegmentedFilter = <T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedFilterProps<T>) => (
  <div className={styles.group} role="group" aria-label={label}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        className={styles.option}
        aria-pressed={option.value === value}
        onClick={() => onChange(option.value)}
      >
        {option.label}
        {option.count !== undefined && (
          <span className={styles.count}>{option.count}</span>
        )}
      </button>
    ))}
  </div>
);

export default SegmentedFilter;
