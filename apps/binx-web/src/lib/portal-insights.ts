/**
 * portal-insights.ts
 *
 * Pure derivations the client portal builds its personalized surfaces from —
 * the "Needs your attention" list, the getting-started checklist, sidebar
 * badges, and friendly due-date copy. No I/O: the (portal) layout and pages
 * fetch the raw lists (lib/portal.ts) and hand them here, so every rule is
 * unit-testable without mocking the API.
 *
 * @module apps/binx-web/src/lib/portal-insights.ts
 * @author Binx Portal
 */
import { formatMoneyCents } from "@/lib/money";
import type {
  Conversation,
  PortalInvoice,
  PortalMeeting,
  PortalPendingKickoff,
  PortalProject,
  PortalProposal,
} from "@/lib/portal";

// ---- Onboarding ids ----
// Stored in the user's tutorial progress `dismissed_popups` list (the same
// per-user store the staff coachmarks use — see users/router.py), so portal
// onboarding state follows the client across devices with no new backend
// table. Keep these in sync with seed_e2e.py's client-contact seeding.

/** The first-visit welcome tour. */
export const PORTAL_TOUR_ID = "portal-welcome";
/** The getting-started checklist, once the client hides it. */
export const PORTAL_CHECKLIST_ID = "portal-checklist";
/** Checklist steps that can't be derived from data complete on first click. */
export const PORTAL_STEP_IDS = {
  projects: "portal-step-projects",
  messages: "portal-step-messages",
  invoices: "portal-step-invoices",
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Proposals the client still has to sign or decline. */
export function isAwaitingDecision(
  proposal: Pick<PortalProposal, "display_status">,
): boolean {
  return (
    proposal.display_status === "sent" || proposal.display_status === "viewed"
  );
}

/** Invoices with money still owed on them (drafts never reach the portal). */
export function isUnpaid(
  invoice: Pick<PortalInvoice, "display_status" | "amount_due_cents">,
): boolean {
  return (
    invoice.display_status !== "paid" &&
    invoice.display_status !== "void" &&
    invoice.amount_due_cents > 0
  );
}

export function isUpcomingMeeting(
  meeting: Pick<PortalMeeting, "status" | "starts_at">,
  now: Date,
): boolean {
  return (
    meeting.status === "scheduled" &&
    new Date(meeting.starts_at).getTime() >= now.getTime()
  );
}

/** Parses an API `YYYY-MM-DD` as a local calendar day (not UTC midnight). */
function parseDay(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00`);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole calendar days from `now` until `day` — negative once it has passed. */
export function daysUntil(day: string, now: Date): number {
  return Math.round(
    (parseDay(day).getTime() - startOfDay(now).getTime()) / DAY_MS,
  );
}

export type DueTone = "overdue" | "soon" | "later" | "done";

export interface DueLabel {
  label: string;
  tone: DueTone;
}

/**
 * dueLabel
 *
 * "Due today" / "Due in 3 days" / "2 days overdue" for a date-only field.
 * `null` when there's no date to talk about.
 */
export function dueLabel(
  day: string | null,
  now: Date,
  { done = false } = {},
): DueLabel | null {
  if (!day) return null;
  if (done) return { label: `Due ${formatDay(day)}`, tone: "done" };
  const days = daysUntil(day, now);
  if (days < 0) {
    const late = Math.abs(days);
    return {
      label: `${late} day${late === 1 ? "" : "s"} overdue`,
      tone: "overdue",
    };
  }
  if (days === 0) return { label: "Due today", tone: "soon" };
  if (days === 1) return { label: "Due tomorrow", tone: "soon" };
  if (days <= 7) return { label: `Due in ${days} days`, tone: "soon" };
  return { label: `Due ${formatDay(day)}`, tone: "later" };
}

export function formatDay(day: string): string {
  return parseDay(day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Today, 3:00 PM" / "Tomorrow, 9:30 AM" / "Thu, Oct 2, 10:00 AM". */
export function formatMeetingTime(iso: string, now: Date): string {
  const starts = new Date(iso);
  const time = starts.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const dayDiff = Math.round(
    (startOfDay(starts).getTime() - startOfDay(now).getTime()) / DAY_MS,
  );
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  const date = starts.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${date}, ${time}`;
}

/** The time-of-day greeting for the portal home hero. */
export function greetingFor(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters =
    parts.length === 1
      ? parts[0].slice(0, 2)
      : `${parts[0][0]}${parts[parts.length - 1][0]}`;
  return letters.toUpperCase();
}

// ---- Needs your attention ----

export type AttentionKind =
  | "kickoff"
  | "proposal"
  | "invoice"
  | "message"
  | "meeting";
export type AttentionTone = "danger" | "warn" | "info";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  tone: AttentionTone;
  title: string;
  detail: string;
  href: string;
  cta: string;
  /** An instant to show in the viewer's own timezone (see LocalTime). */
  at?: string;
}

interface AttentionInput {
  /** Optional so callers without kickoff data (badges) can share the type. */
  kickoffs?: PortalPendingKickoff[];
  proposals: PortalProposal[];
  invoices: PortalInvoice[];
  conversations: Conversation[];
  meetings: PortalMeeting[];
  now: Date;
}

const TONE_RANK: Record<AttentionTone, number> = {
  danger: 0,
  warn: 1,
  info: 2,
};

/**
 * buildAttentionItems
 *
 * Everything the client could act on right now, most urgent first: overdue
 * invoices, proposals waiting on a signature, unread threads, invoices
 * coming due, and meetings in the next two days.
 */
export function buildAttentionItems({
  kickoffs = [],
  proposals,
  invoices,
  conversations,
  meetings,
  now,
}: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  // First among the "warn" items: the team can't start without these
  // answers (the project sits in "Waiting on client" until they arrive).
  for (const kickoff of kickoffs) {
    items.push({
      id: `kickoff-${kickoff.id}`,
      kind: "kickoff",
      tone: "warn",
      title: `Complete the kickoff for ${kickoff.project_name}`,
      detail: kickoffQuestionSummary(kickoff),
      href: kickoffHref(kickoff),
      cta: "Start",
    });
  }

  for (const invoice of invoices.filter(isUnpaid)) {
    const overdue = invoice.display_status === "overdue";
    const due = dueLabel(invoice.due_date, now);
    items.push({
      id: `invoice-${invoice.id}`,
      kind: "invoice",
      tone: overdue ? "danger" : "warn",
      title: overdue
        ? `Invoice ${invoice.number} is overdue`
        : `Invoice ${invoice.number} is ready to pay`,
      detail: [
        formatMoneyCents(invoice.amount_due_cents, invoice.currency),
        due?.label,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/portal/invoices/${invoice.id}`,
      cta: "Pay invoice",
    });
  }

  for (const proposal of proposals.filter(isAwaitingDecision)) {
    items.push({
      id: `proposal-${proposal.id}`,
      kind: "proposal",
      tone: "warn",
      title: `Review “${proposal.title}”`,
      detail: `${formatMoneyCents(proposal.total_cents, proposal.currency)} proposal waiting on your decision`,
      href: `/portal/proposals/${proposal.id}`,
      cta: "Review",
    });
  }

  for (const conversation of conversations.filter((c) => c.unread_count > 0)) {
    items.push({
      id: `message-${conversation.id}`,
      kind: "message",
      tone: "info",
      title: `${conversation.unread_count} new message${conversation.unread_count === 1 ? "" : "s"} in ${conversation.title}`,
      detail:
        conversation.last_message_preview ??
        "Your team is waiting to hear back",
      href: `/portal/messages/${conversation.id}`,
      cta: "Reply",
    });
  }

  const soon = now.getTime() + 2 * DAY_MS;
  for (const meeting of meetings) {
    if (
      !isUpcomingMeeting(meeting, now) ||
      new Date(meeting.starts_at).getTime() > soon
    )
      continue;
    items.push({
      id: `meeting-${meeting.id}`,
      kind: "meeting",
      tone: "info",
      title: meeting.title,
      detail: meeting.location ?? meeting.project_name ?? "",
      at: meeting.starts_at,
      href: "/portal/meetings",
      cta: "Details",
    });
  }

  // Stable sort keeps the kind grouping above within each tone.
  return items.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
}

// ---- Kickoffs ----

/** sessionStorage key for the kickoff invitation's Remind-me-later snooze. */
export const KICKOFF_INVITE_STORAGE_KEY = "binx:portal-kickoff-invite";

export function kickoffHref(
  kickoff: Pick<PortalPendingKickoff, "project_id">,
): string {
  return `/portal/projects/${kickoff.project_id}/kickoff`;
}

/** "5 questions · 3 required" / "1 question". */
export function kickoffQuestionSummary(
  kickoff: Pick<PortalPendingKickoff, "question_count" | "required_count">,
): string {
  const { question_count: total, required_count: required } = kickoff;
  const count = `${total} question${total === 1 ? "" : "s"}`;
  return required > 0 && required < total
    ? `${count} · ${required} required`
    : count;
}

/**
 * kickoffInviteKey
 *
 * Identifies "this set of pending kickoffs" for the invitation modal's
 * Remind-me-later snooze. It changes whenever a new kickoff is sent or staff
 * nudge an existing one, so either brings the invitation straight back.
 */
export function kickoffInviteKey(
  kickoffs: Pick<PortalPendingKickoff, "id" | "last_nudged_at">[],
): string {
  return kickoffs
    .map((kickoff) => `${kickoff.id}:${kickoff.last_nudged_at ?? ""}`)
    .sort()
    .join("|");
}

// ---- Getting started ----

export type ChecklistAction =
  | { type: "tour" }
  | { type: "link"; href: string; markId?: string };

export interface ChecklistStep {
  id: string;
  title: string;
  description: string;
  done: boolean;
  action: ChecklistAction;
}

interface ChecklistInput {
  projects: PortalProject[];
  proposals: PortalProposal[];
  invoices: PortalInvoice[];
  meetings: PortalMeeting[];
  selfBookingEnabled: boolean;
  agencyName: string;
}

/**
 * buildChecklist
 *
 * The client's first-week checklist. Steps are only listed when they apply
 * (no "sign your proposal" without a proposal), and complete from real data
 * wherever the data can tell. The steps it can't tell (the tour, browsing
 * projects, opening messages) start not-done and carry the onboarding id
 * that GettingStartedChecklist ticks them off with on the client.
 */
export function buildChecklist(input: ChecklistInput): ChecklistStep[] {
  const {
    projects,
    proposals,
    invoices,
    meetings,
    selfBookingEnabled,
    agencyName,
  } = input;
  const steps: ChecklistStep[] = [
    {
      id: "tour",
      title: "Take the two-minute tour",
      description: "See where everything lives in your portal.",
      done: false,
      action: { type: "tour" },
    },
  ];

  if (projects.length > 0) {
    steps.push({
      id: "projects",
      title: "Check in on your projects",
      description: "Progress, timelines and the live task board.",
      done: false,
      action: {
        type: "link",
        href: "/portal/projects",
        markId: PORTAL_STEP_IDS.projects,
      },
    });
  }

  if (proposals.length > 0) {
    const pending = proposals.find(isAwaitingDecision);
    steps.push({
      id: "proposal",
      title: "Review your proposal",
      description: "Read the scope and sign when you're ready.",
      done: !pending,
      action: {
        type: "link",
        href: pending ? `/portal/proposals/${pending.id}` : "/portal/proposals",
      },
    });
  }

  steps.push({
    id: "messages",
    title: `Say hello to ${agencyName}`,
    description: "Questions, feedback and files — all in one thread.",
    done: false,
    action: {
      type: "link",
      href: "/portal/messages",
      markId: PORTAL_STEP_IDS.messages,
    },
  });

  if (selfBookingEnabled || meetings.length > 0) {
    steps.push({
      id: "meeting",
      title: "Book a call with the team",
      description: "Pick a time that works — no back-and-forth.",
      done: meetings.length > 0,
      action: { type: "link", href: "/portal/meetings" },
    });
  }

  if (invoices.length > 0) {
    steps.push({
      id: "invoices",
      title: "Look over your invoices",
      description: "Pay securely online in a couple of clicks.",
      done: !invoices.some(isUnpaid),
      action: {
        type: "link",
        href: "/portal/invoices",
        markId: PORTAL_STEP_IDS.invoices,
      },
    });
  }

  return steps;
}

// ---- Sidebar badges ----

export interface PortalBadges {
  messages: number;
  invoices: number;
  invoicesOverdue: boolean;
  proposals: number;
  meetings: number;
}

export function buildBadges({
  conversations,
  invoices,
  proposals,
  meetings,
  now,
}: Omit<AttentionInput, "now"> & { now: Date }): PortalBadges {
  const unpaid = invoices.filter(isUnpaid);
  return {
    messages: conversations.reduce((total, c) => total + c.unread_count, 0),
    invoices: unpaid.length,
    invoicesOverdue: unpaid.some(
      (invoice) => invoice.display_status === "overdue",
    ),
    proposals: proposals.filter(isAwaitingDecision).length,
    meetings: meetings.filter((meeting) => isUpcomingMeeting(meeting, now))
      .length,
  };
}

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  active: "In progress",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
  cancelled: "Cancelled",
  waiting_on_client: "Waiting on client",
};

export function projectStatusLabel(status: string): string {
  return PROJECT_STATUS_LABELS[status] ?? status;
}
