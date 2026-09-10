/**
 * BarChart.tsx
 *
 * A compact vertical bar chart for a single measure across a handful of
 * categories or months (invoices issued per month, messages per week, …).
 * Monochrome ink bars with 4px rounded tops and a 2px gap to the surface,
 * a recessive baseline, per-bar hover tooltip. One measure, one axis.
 *
 * @module apps/binx-web/src/components/charts/BarChart/BarChart.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useState } from "react";

import { formatChartValue, type ChartValueFormat } from "../chartFormat";

import styles from "./BarChart.module.scss";

export interface BarChartDatum {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarChartDatum[];
  ariaLabel: string;
  /** How the tooltip formats a value — a name, not a function (RSC boundary). */
  valueFormat?: ChartValueFormat;
  height?: number;
}

const VIEW_W = 640;
const PAD = { top: 12, right: 8, bottom: 28, left: 8 };

const BarChart = ({ data, ariaLabel, valueFormat = "number", height = 200 }: BarChartProps) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const plotW = VIEW_W - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const max = Math.max(1, ...data.map((datum) => datum.value));
    const slot = data.length > 0 ? plotW / data.length : plotW;
    const barW = Math.min(48, slot * 0.62);

    const bars = data.map((datum, index) => {
      const barH = (datum.value / max) * plotH;
      return {
        ...datum,
        x: PAD.left + index * slot + (slot - barW) / 2,
        y: PAD.top + plotH - barH,
        width: barW,
        height: Math.max(datum.value > 0 ? 2 : 0, barH),
        centerX: PAD.left + index * slot + slot / 2,
      };
    });

    const labelEvery = Math.max(1, Math.ceil(data.length / 8));
    return { bars, plotH, labelEvery };
  }, [data, height]);

  if (data.length === 0) {
    return <p className={styles.empty}>No data yet.</p>;
  }

  const active = activeIndex === null ? null : geometry.bars[activeIndex];

  return (
    <figure className={styles.figure}>
      <svg className={styles.svg} viewBox={`0 0 ${VIEW_W} ${height}`} role="img" aria-label={ariaLabel}>
        <line
          className={styles.axis}
          x1={PAD.left}
          y1={PAD.top + geometry.plotH}
          x2={VIEW_W - PAD.right}
          y2={PAD.top + geometry.plotH}
        />

        {geometry.bars.map((bar, index) => (
          <g key={bar.label + index}>
            <rect
              className={styles.bar}
              data-active={activeIndex === index}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx={3}
              onPointerEnter={() => setActiveIndex(index)}
              onPointerLeave={() => setActiveIndex(null)}
            />
            {index % geometry.labelEvery === 0 && (
              <text className={styles.tick} x={bar.centerX} y={height - 8} textAnchor="middle">
                {bar.label}
              </text>
            )}
          </g>
        ))}
      </svg>

      {active && (
        <div
          className={styles.tooltip}
          style={{ left: `${Math.min(88, Math.max(12, (active.centerX / VIEW_W) * 100))}%` }}
          role="status"
        >
          <span className={styles.tooltipLabel}>{active.label}</span>
          <span className={styles.tooltipValue}>{formatChartValue(active.value, valueFormat)}</span>
        </div>
      )}
    </figure>
  );
};

export default BarChart;
