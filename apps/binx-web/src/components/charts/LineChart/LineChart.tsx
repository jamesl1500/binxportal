/**
 * LineChart.tsx
 *
 * A compact area+line chart for a single time series (monthly revenue,
 * message volume, …). Deliberately monochrome to match the app's restrained
 * palette: one ink stroke, a faint fill, recessive gridlines. Hovering
 * anywhere over the plot snaps a crosshair to the nearest point and shows a
 * tooltip — a line chart in the browser is interactive by default.
 *
 * Pure SVG with a viewBox, so it scales to its container with no resize
 * observer. One measure, one axis — never a second y-scale.
 *
 * @module apps/binx-web/src/components/charts/LineChart/LineChart.tsx
 * @author Binx.io
 */
"use client";

import { useId, useMemo, useState } from "react";

import { formatChartValue, type ChartValueFormat } from "../chartFormat";

import styles from "./LineChart.module.scss";

export interface LineChartPoint {
  label: string;
  value: number;
}

interface LineChartProps {
  data: LineChartPoint[];
  /** Screen-reader summary of what the chart shows. */
  ariaLabel: string;
  /** How the tooltip formats a value — a name, not a function (RSC boundary). */
  valueFormat?: ChartValueFormat;
  /** Chart height in the viewBox (width scales to the container). */
  height?: number;
}

const VIEW_W = 640;
const PAD = { top: 16, right: 16, bottom: 28, left: 16 };

const LineChart = ({ data, ariaLabel, valueFormat = "number", height = 200 }: LineChartProps) => {
  const gradientId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const plotW = VIEW_W - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const max = Math.max(1, ...data.map((point) => point.value));
    const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;

    const points = data.map((point, index) => ({
      ...point,
      x: PAD.left + index * stepX,
      y: PAD.top + plotH - (point.value / max) * plotH,
    }));

    const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
    const areaPath =
      points.length > 0
        ? `${linePath} L${points[points.length - 1].x},${PAD.top + plotH} L${points[0].x},${PAD.top + plotH} Z`
        : "";

    const labelEvery = Math.max(1, Math.ceil(data.length / 6));

    return { points, linePath, areaPath, plotH, max, labelEvery };
  }, [data, height]);

  if (data.length === 0) {
    return <p className={styles.empty}>No data yet.</p>;
  }

  const active = activeIndex === null ? null : geometry.points[activeIndex];

  const handleMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const x = ratio * VIEW_W;
    let nearest = 0;
    let best = Infinity;
    geometry.points.forEach((point, index) => {
      const distance = Math.abs(point.x - x);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    setActiveIndex(nearest);
  };

  return (
    <figure className={styles.figure}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${VIEW_W} ${height}`}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={handleMove}
        onPointerLeave={() => setActiveIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* recessive baseline */}
        <line
          className={styles.axis}
          x1={PAD.left}
          y1={PAD.top + geometry.plotH}
          x2={VIEW_W - PAD.right}
          y2={PAD.top + geometry.plotH}
        />

        <path className={styles.area} d={geometry.areaPath} fill={`url(#${gradientId})`} />
        <path className={styles.line} d={geometry.linePath} />

        {active && (
          <g>
            <line className={styles.crosshair} x1={active.x} y1={PAD.top} x2={active.x} y2={PAD.top + geometry.plotH} />
            <circle className={styles.marker} cx={active.x} cy={active.y} r={4} />
          </g>
        )}

        {geometry.points.map((point, index) =>
          index % geometry.labelEvery === 0 ? (
            <text key={point.label + index} className={styles.tick} x={point.x} y={height - 8} textAnchor="middle">
              {point.label}
            </text>
          ) : null,
        )}
      </svg>

      {active && (
        <div
          className={styles.tooltip}
          style={{ left: `${Math.min(88, Math.max(12, (active.x / VIEW_W) * 100))}%` }}
          role="status"
        >
          <span className={styles.tooltipLabel}>{active.label}</span>
          <span className={styles.tooltipValue}>{formatChartValue(active.value, valueFormat)}</span>
        </div>
      )}
    </figure>
  );
};

export default LineChart;
