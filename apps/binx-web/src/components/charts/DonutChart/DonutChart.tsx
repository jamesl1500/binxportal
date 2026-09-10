/**
 * DonutChart.tsx
 *
 * A donut for a small part-to-whole breakdown (invoice status, project
 * status). Rendered as dash-segmented circle strokes with a 2px surface gap
 * between segments. Identity is never colour-alone: every segment is in the
 * legend beside it with its label and value, and the legend is always shown.
 *
 * @module apps/binx-web/src/components/charts/DonutChart/DonutChart.tsx
 * @author Binx.io
 */
"use client";

import { useState } from "react";

import styles from "./DonutChart.module.scss";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
  /** Optional extra line in the legend (e.g. a dollar amount). */
  hint?: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  ariaLabel: string;
  centerPrimary?: string;
  centerSecondary?: string;
}

const SIZE = 120;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 2; // px of surface between segments

const DonutChart = ({ segments, ariaLabel, centerPrimary, centerSecondary }: DonutChartProps) => {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  let offset = 0;
  const arcs = segments.map((segment) => {
    const fraction = total > 0 ? segment.value / total : 0;
    const length = Math.max(0, fraction * CIRCUMFERENCE - GAP);
    const arc = { ...segment, length, dashOffset: -offset };
    offset += fraction * CIRCUMFERENCE;
    return arc;
  });

  return (
    <figure className={styles.figure}>
      <div className={styles.chart}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={styles.svg} role="img" aria-label={ariaLabel}>
          <circle
            className={styles.track}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            fill="none"
          />
          {total > 0 &&
            arcs.map((arc) => (
              <circle
                key={arc.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth={STROKE}
                strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
                strokeDashoffset={arc.dashOffset}
                className={styles.arc}
                data-dimmed={activeLabel !== null && activeLabel !== arc.label}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              />
            ))}
        </svg>
        {(centerPrimary || centerSecondary) && (
          <div className={styles.center}>
            {centerPrimary && <span className={styles.centerPrimary}>{centerPrimary}</span>}
            {centerSecondary && <span className={styles.centerSecondary}>{centerSecondary}</span>}
          </div>
        )}
      </div>

      <ul className={styles.legend}>
        {segments.map((segment) => (
          <li
            key={segment.label}
            className={styles.legendItem}
            onPointerEnter={() => setActiveLabel(segment.label)}
            onPointerLeave={() => setActiveLabel(null)}
          >
            <span className={styles.swatch} style={{ background: segment.color }} aria-hidden="true" />
            <span className={styles.legendLabel}>{segment.label}</span>
            <span className={styles.legendValue}>
              {segment.value}
              {segment.hint && <span className={styles.legendHint}>{segment.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
};

export default DonutChart;
