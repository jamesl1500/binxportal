/**
 * feedback-client.ts
 *
 * Client-safe types, labels and helpers for product feedback (binx-api's
 * `/feedback` + `/admin/feedback` endpoints). Server-only calls live in
 * `lib/feedback.ts`; this file holds what both the dialog and the pages need.
 *
 * Feedback is about Binx itself and goes to the Binx team — never to the
 * agency — from staff (`surface: "app"`) and their clients (`"portal"`).
 *
 * @module apps/binx-web/src/lib/feedback-client.ts
 * @author Binx Portal
 */

export type FeedbackSurface = "app" | "portal";
/** What the open "Send feedback" dialog offers. */
export type FeedbackKind = "bug" | "idea" | "praise" | "other";
/** Every kind a stored row can have — `pulse` is a check-in answer. */
export type StoredFeedbackKind = FeedbackKind | "pulse";
export type FeedbackStatus =
  "new" | "in_review" | "planned" | "done" | "declined";

export interface FeedbackItem {
  id: string;
  surface: FeedbackSurface;
  kind: StoredFeedbackKind;
  rating: number | null;
  message: string;
  page_path: string | null;
  status: FeedbackStatus;
  response: string | null;
  responded_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface FeedbackAdminItem extends FeedbackItem {
  user_id: string | null;
  user_name: string;
  user_email: string;
  agency_id: string | null;
  agency_name: string | null;
  client_id: string | null;
  client_name: string | null;
  pulse_key: string | null;
  user_agent: string | null;
  viewport: string | null;
  allow_contact: boolean;
  internal_note: string | null;
  updated_at: string | null;
}

export interface FeedbackSummary {
  by_status: Partial<Record<FeedbackStatus, number>>;
  by_kind: Partial<Record<StoredFeedbackKind, number>>;
  by_surface: Partial<Record<FeedbackSurface, number>>;
  open_total: number;
  avg_rating_30d: number | null;
  rated_30d: number;
  pulse_avg_rating: number | null;
  pulse_answered: number;
  pulse_dismissed: number;
}

/** Captured automatically with every submission. */
export interface FeedbackContext {
  pagePath: string | null;
  userAgent: string | null;
  viewport: string | null;
}

export interface FeedbackInput extends FeedbackContext {
  surface: FeedbackSurface;
  agencyId?: string | null;
  kind: FeedbackKind;
  rating?: number | null;
  message: string;
  allowContact: boolean;
}

export interface PulseAnswerInput extends FeedbackContext {
  surface: FeedbackSurface;
  agencyId?: string | null;
  rating: number;
  message?: string;
}

export const FEEDBACK_MESSAGE_MAX = 5000;

export const FEEDBACK_KIND_META: Record<
  StoredFeedbackKind,
  { label: string; prompt: string; placeholder: string }
> = {
  bug: {
    label: "Something's broken",
    prompt: "What happened, and what did you expect?",
    placeholder:
      "e.g. I clicked “Send invoice” and the button just kept spinning.",
  },
  idea: {
    label: "Idea",
    prompt: "What would make this better for you?",
    placeholder: "e.g. It'd save me time if I could duplicate a project.",
  },
  praise: {
    label: "Something I love",
    prompt: "What's working well?",
    placeholder: "e.g. The client portal made our kickoff painless.",
  },
  other: {
    label: "Something else",
    prompt: "What's on your mind?",
    placeholder: "Questions, confusion, anything at all.",
  },
  pulse: {
    label: "Check-in",
    prompt: "How's it going so far?",
    placeholder: "Anything you'd change?",
  },
};

/** The four kinds the dialog offers, in display order. */
export const FEEDBACK_KINDS: FeedbackKind[] = [
  "bug",
  "idea",
  "praise",
  "other",
];

/** Short labels for lists and filters. */
export const FEEDBACK_KIND_SHORT: Record<StoredFeedbackKind, string> = {
  bug: "Bug",
  idea: "Idea",
  praise: "Praise",
  other: "Other",
  pulse: "Check-in",
};

export const FEEDBACK_STATUS_META: Record<
  FeedbackStatus,
  { label: string; tone: "neutral" | "info" | "accent" | "success" | "muted" }
> = {
  new: { label: "Received", tone: "neutral" },
  in_review: { label: "In review", tone: "info" },
  planned: { label: "Planned", tone: "accent" },
  done: { label: "Done", tone: "success" },
  declined: { label: "Closed", tone: "muted" },
};

/** The Binx-team view uses plainer wording than the submitter's. */
export const FEEDBACK_ADMIN_STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "New",
  in_review: "In review",
  planned: "Planned",
  done: "Done",
  declined: "Declined",
};

export const FEEDBACK_STATUSES: FeedbackStatus[] = [
  "new",
  "in_review",
  "planned",
  "done",
  "declined",
];

export const RATING_LABELS: Record<number, string> = {
  1: "Frustrating",
  2: "Not great",
  3: "Okay",
  4: "Good",
  5: "Love it",
};

/** Where the submitter reads their feedback and our replies. */
export function feedbackHistoryPath(surface: FeedbackSurface): string {
  return surface === "portal" ? "/portal/feedback" : "/feedback";
}

/**
 * What a bug report needs and nobody remembers to type. Only the path —
 * never the query string, which can carry tokens (reset links, checkout
 * session ids).
 */
export function captureFeedbackContext(
  pathname?: string | null,
): FeedbackContext {
  if (typeof window === "undefined") {
    return { pagePath: pathname ?? null, userAgent: null, viewport: null };
  }
  return {
    pagePath: (pathname ?? window.location.pathname).slice(0, 512),
    userAgent: window.navigator.userAgent.slice(0, 512),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
}

// ---- Binx-team inbox filters --------------------------------------------

export type FeedbackStatusFilter = FeedbackStatus | "open";

export interface FeedbackAdminFilter {
  /** Undefined = everything; "open" = new + in review + planned. */
  status?: FeedbackStatusFilter;
  kind?: StoredFeedbackKind;
  surface?: FeedbackSurface;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface InboxSearchParams {
  status?: string;
  kind?: string;
  surface?: string;
  q?: string;
  offset?: string;
}

const INBOX_KINDS: StoredFeedbackKind[] = [
  "bug",
  "idea",
  "praise",
  "other",
  "pulse",
];

/**
 * Untrusted URL params → a filter binx-api will accept; bad values are
 * dropped rather than 422ing the page. No `status` means the default "open"
 * view, `status=all` means everything.
 */
export function parseInboxFilter(
  params: InboxSearchParams,
): FeedbackAdminFilter {
  const status: FeedbackAdminFilter["status"] =
    params.status === "all"
      ? undefined
      : FEEDBACK_STATUSES.includes(params.status as FeedbackStatus)
        ? (params.status as FeedbackStatus)
        : "open";
  const kind = INBOX_KINDS.includes(params.kind as StoredFeedbackKind)
    ? (params.kind as StoredFeedbackKind)
    : undefined;
  const surface =
    params.surface === "app" || params.surface === "portal"
      ? params.surface
      : undefined;
  const offset = Math.max(0, Number.parseInt(params.offset ?? "0", 10) || 0);
  const q = params.q?.trim().slice(0, 200) || undefined;
  return { status, kind, surface, q, offset };
}
