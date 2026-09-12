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
  | "lead_followup"
  | "dashboard_briefing"
  | "project_summary"
  | "project_tasks"
  | "invoice_reminder"
  | "message_reply"
  | "assistant";

export type AiUsageStatus = "ok" | "error" | "blocked";

export const AI_FEATURE_LABEL: Record<AiFeature, string> = {
  lead_analysis: "Lead analysis",
  lead_generation: "Lead prospector",
  lead_followup: "Lead follow-up",
  dashboard_briefing: "Dashboard briefing",
  project_summary: "Project summary",
  project_tasks: "Project task setup",
  invoice_reminder: "Invoice reminder",
  message_reply: "Message reply draft",
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
