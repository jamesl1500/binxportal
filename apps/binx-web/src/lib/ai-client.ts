/**
 * ai-client.ts
 *
 * Client-safe constants for the AI features: feature labels for the usage
 * table and a small status→tone map. No `next/headers`, so components that
 * render in the browser can import this directly (see `lib/leads-client.ts`
 * for the sibling pattern).
 *
 * @module apps/binx-web/src/lib/ai-client.ts
 * @author Binx.io
 */

export type AiFeature =
  | "lead_analysis"
  | "lead_generation"
  | "dashboard_briefing"
  | "project_summary"
  | "invoice_reminder"
  | "assistant";

export type AiUsageStatus = "ok" | "error" | "blocked";

export const AI_FEATURE_LABEL: Record<AiFeature, string> = {
  lead_analysis: "Lead analysis",
  lead_generation: "Lead prospector",
  dashboard_briefing: "Dashboard briefing",
  project_summary: "Project summary",
  invoice_reminder: "Invoice reminder",
  assistant: "Ask AI",
};

export const AI_STATUS_LABEL: Record<AiUsageStatus, string> = {
  ok: "Ok",
  error: "Error",
  blocked: "Blocked",
};

export function featureLabel(feature: string): string {
  return AI_FEATURE_LABEL[feature as AiFeature] ?? feature;
}
