import { describe, expect, it } from "vitest";

import type { Conversation, PortalInvoice, PortalMeeting, PortalProject, PortalProposal } from "@/lib/portal";
import {
  buildAttentionItems,
  buildBadges,
  buildChecklist,
  daysUntil,
  dueLabel,
  firstName,
  greetingFor,
  initials,
  PORTAL_STEP_IDS,
} from "@/lib/portal-insights";

// Noon local time, so date-only math never straddles midnight.
const NOW = new Date(2026, 8, 25, 12, 0, 0);

function invoice(overrides: Partial<PortalInvoice> = {}): PortalInvoice {
  return {
    id: "inv-1",
    agency_id: "a",
    client_id: "c",
    client_name: "Fjord & Field",
    number: "INV-0001",
    status: "sent",
    display_status: "sent",
    currency: "USD",
    issue_date: "2026-09-01",
    due_date: "2026-09-30",
    subtotal_cents: 10000,
    discount_cents: 0,
    tax_cents: 0,
    total_cents: 10000,
    amount_paid_cents: 0,
    amount_due_cents: 10000,
    project_id: null,
    project_name: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function proposal(overrides: Partial<PortalProposal> = {}): PortalProposal {
  return {
    id: "prop-1",
    agency_id: "a",
    client_id: "c",
    client_name: "Fjord & Field",
    lead_id: null,
    lead_name: null,
    title: "Website refresh",
    status: "sent",
    display_status: "sent",
    currency: "USD",
    subtotal_cents: 500000,
    tax_cents: 0,
    total_cents: 500000,
    recipient_email: null,
    recipient_name: null,
    sent_at: "2026-09-20T00:00:00Z",
    valid_until: null,
    created_at: "2026-09-20T00:00:00Z",
    ...overrides,
  };
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    agency_id: "a",
    client_id: "c",
    client_name: "Fjord & Field",
    kind: "client",
    title: "Northlight × Fjord",
    created_at: "2026-09-01T00:00:00Z",
    is_muted: false,
    last_message_at: "2026-09-24T00:00:00Z",
    last_message_preview: "Mockups attached",
    participant_count: 3,
    participant_names: ["Morgan"],
    project_id: null,
    project_name: null,
    unread_count: 0,
    ...overrides,
  } as Conversation;
}

function meeting(overrides: Partial<PortalMeeting> = {}): PortalMeeting {
  return {
    id: "meet-1",
    agency_id: "a",
    client_id: "c",
    client_name: "Fjord & Field",
    title: "Kickoff",
    status: "scheduled",
    starts_at: new Date(2026, 8, 26, 10).toISOString(),
    ends_at: new Date(2026, 8, 26, 11).toISOString(),
    location: "Zoom",
    notes: null,
    project_id: null,
    project_name: null,
    created_at: "2026-09-01T00:00:00Z",
    created_by_kind: "staff",
    created_by_name: "Morgan",
    cancelled_at: null,
    cancelled_by_kind: null,
    cancelled_by_name: null,
    ...overrides,
  };
}

const project = { id: "p1", name: "Brand refresh", status: "active" } as PortalProject;

describe("dueLabel", () => {
  it("describes upcoming, imminent and overdue dates", () => {
    expect(dueLabel("2026-09-25", NOW)).toEqual({ label: "Due today", tone: "soon" });
    expect(dueLabel("2026-09-26", NOW)).toEqual({ label: "Due tomorrow", tone: "soon" });
    expect(dueLabel("2026-09-30", NOW)).toEqual({ label: "Due in 5 days", tone: "soon" });
    expect(dueLabel("2026-09-23", NOW)).toEqual({ label: "2 days overdue", tone: "overdue" });
    expect(dueLabel("2026-09-24", NOW)?.label).toBe("1 day overdue");
    expect(dueLabel("2026-12-01", NOW)?.tone).toBe("later");
  });

  it("is quiet for finished work and absent without a date", () => {
    expect(dueLabel("2026-09-01", NOW, { done: true })?.tone).toBe("done");
    expect(dueLabel(null, NOW)).toBeNull();
  });

  it("counts whole calendar days", () => {
    expect(daysUntil("2026-10-05", NOW)).toBe(10);
  });
});

describe("names and greetings", () => {
  it("greets by time of day", () => {
    expect(greetingFor(8)).toBe("Good morning");
    expect(greetingFor(14)).toBe("Good afternoon");
    expect(greetingFor(21)).toBe("Good evening");
    expect(greetingFor(2)).toBe("Good evening");
  });

  it("derives first names and initials", () => {
    expect(firstName("Priya  Nair")).toBe("Priya");
    expect(initials("Priya Nair")).toBe("PN");
    expect(initials("Cher")).toBe("CH");
    expect(initials(" ")).toBe("?");
  });
});

describe("buildAttentionItems", () => {
  it("puts overdue invoices first and skips anything settled", () => {
    const items = buildAttentionItems({
      proposals: [proposal(), proposal({ id: "prop-2", display_status: "signed" })],
      invoices: [
        invoice({ id: "due-soon" }),
        invoice({ id: "late", number: "INV-0002", display_status: "overdue", due_date: "2026-09-20" }),
        invoice({ id: "paid", display_status: "paid", amount_due_cents: 0 }),
      ],
      conversations: [conversation({ unread_count: 2 }), conversation({ id: "quiet" })],
      meetings: [meeting(), meeting({ id: "far", starts_at: new Date(2026, 9, 20).toISOString() })],
      now: NOW,
    });

    expect(items.map((item) => item.id)).toEqual([
      "invoice-late",
      "invoice-due-soon",
      "proposal-prop-1",
      "message-conv-1",
      "meeting-meet-1",
    ]);
    expect(items[0]).toMatchObject({ tone: "danger", title: "Invoice INV-0002 is overdue" });
    expect(items[0].detail).toContain("5 days overdue");
    expect(items[3].title).toBe("2 new messages in Northlight × Fjord");
    expect(items[4]).toMatchObject({ at: meeting().starts_at, detail: "Zoom" });
  });

  it("is empty when nothing needs the client", () => {
    expect(
      buildAttentionItems({ proposals: [], invoices: [], conversations: [conversation()], meetings: [], now: NOW }),
    ).toEqual([]);
  });
});

describe("buildChecklist", () => {
  const base = {
    projects: [] as PortalProject[],
    proposals: [] as PortalProposal[],
    invoices: [] as PortalInvoice[],
    meetings: [] as PortalMeeting[],
    selfBookingEnabled: false,
    agencyName: "Northlight",
  };

  it("only lists the steps that apply", () => {
    expect(buildChecklist(base).map((step) => step.id)).toEqual(["tour", "messages"]);
    expect(
      buildChecklist({
        ...base,
        projects: [project],
        proposals: [proposal()],
        invoices: [invoice()],
        selfBookingEnabled: true,
      }).map((step) => step.id),
    ).toEqual(["tour", "projects", "proposal", "messages", "meeting", "invoices"]);
  });

  it("completes steps from real data, and tags the rest for click-through", () => {
    const steps = buildChecklist({
      ...base,
      projects: [project],
      proposals: [proposal({ display_status: "signed" })],
      invoices: [invoice({ display_status: "paid", amount_due_cents: 0 })],
      meetings: [meeting()],
    });
    const byId = Object.fromEntries(steps.map((step) => [step.id, step]));

    expect(byId.proposal.done).toBe(true);
    expect(byId.meeting.done).toBe(true);
    expect(byId.invoices.done).toBe(true);
    expect(byId.projects).toMatchObject({
      done: false,
      action: { type: "link", href: "/portal/projects", markId: PORTAL_STEP_IDS.projects },
    });
    expect(byId.tour.action).toEqual({ type: "tour" });
    expect(byId.messages.title).toBe("Say hello to Northlight");
  });

  it("links a pending proposal straight to its page", () => {
    const [, , step] = buildChecklist({ ...base, projects: [project], proposals: [proposal()] });
    expect(step.action).toEqual({ type: "link", href: "/portal/proposals/prop-1" });
  });
});

describe("buildBadges", () => {
  it("counts what's unread, unpaid, undecided and upcoming", () => {
    expect(
      buildBadges({
        conversations: [conversation({ unread_count: 2 }), conversation({ unread_count: 1 })],
        invoices: [invoice(), invoice({ display_status: "overdue" }), invoice({ display_status: "paid" })],
        proposals: [proposal(), proposal({ display_status: "viewed" }), proposal({ display_status: "declined" })],
        meetings: [meeting(), meeting({ status: "cancelled" }), meeting({ starts_at: "2026-01-01T00:00:00Z" })],
        now: NOW,
      }),
    ).toEqual({ messages: 3, invoices: 2, invoicesOverdue: true, proposals: 2, meetings: 1 });
  });
});
