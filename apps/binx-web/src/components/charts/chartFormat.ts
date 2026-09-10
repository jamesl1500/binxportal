/**
 * chartFormat.ts
 *
 * The chart components are Client Components, so a Server Component page can't
 * hand them a formatter function (functions can't cross the RSC boundary). It
 * passes one of these serializable names instead, and the chart maps it to a
 * formatter for its tooltips/labels.
 *
 * `"currency"` treats a datum's `value` as whole dollars (charts plot dollars,
 * not cents).
 *
 * @module apps/binx-web/src/components/charts/chartFormat.ts
 * @author Binx.io
 */
export type ChartValueFormat = "number" | "currency" | "currency-compact";

export function formatChartValue(value: number, format: ChartValueFormat = "number"): string {
  switch (format) {
    case "currency":
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);
    case "currency-compact":
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
    default:
      return new Intl.NumberFormat().format(value);
  }
}
