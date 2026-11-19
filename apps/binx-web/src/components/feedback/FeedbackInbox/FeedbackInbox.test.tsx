import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FeedbackAdminItem, FeedbackSummary } from "@/lib/feedback-client";

import FeedbackInbox, { inboxHref } from "./FeedbackInbox";

const SUMMARY: FeedbackSummary = {
  by_status: { new: 3, in_review: 1, planned: 2, done: 4 },
  by_kind: { bug: 2, idea: 5, pulse: 3 },
  by_surface: { app: 7, portal: 3 },
  open_total: 6,
  avg_rating_30d: 3.8,
  rated_30d: 5,
  pulse_avg_rating: 4.25,
  pulse_answered: 3,
  pulse_dismissed: 1,
};

function item(overrides: Partial<FeedbackAdminItem> = {}): FeedbackAdminItem {
  return {
    id: "f1",
    surface: "portal",
    kind: "bug",
    rating: 2,
    message: "The logo is blurry on the invoice page",
    page_path: "/portal/invoices",
    status: "new",
    response: null,
    responded_at: null,
    resolved_at: null,
    created_at: "2026-11-01T15:00:00Z",
    user_id: "u1",
    user_name: "Dana Client",
    user_email: "dana@example.com",
    agency_id: "a1",
    agency_name: "Pixel Forge",
    client_id: "c1",
    client_name: "Aurora Media",
    pulse_key: null,
    user_agent: null,
    viewport: null,
    allow_contact: true,
    internal_note: null,
    updated_at: null,
    ...overrides,
  };
}

describe("inboxHref", () => {
  it("treats open as the default and everything as status=all", () => {
    expect(inboxHref({ status: "open" })).toBe("/admin/feedback");
    expect(inboxHref({})).toBe("/admin/feedback?status=all");
    expect(inboxHref({ status: "done", kind: "bug", surface: "app", q: "x", offset: 25 })).toBe(
      "/admin/feedback?status=done&kind=bug&surface=app&q=x&offset=25",
    );
  });
});

describe("FeedbackInbox", () => {
  it("shows the summary and links each row to its detail page", () => {
    render(
      <FeedbackInbox
        page={{ items: [item(), item({ id: "f2", kind: "pulse", message: "", rating: 5, surface: "app" })], total: 2 }}
        summary={SUMMARY}
        filter={{ status: "open" }}
      />,
    );

    expect(screen.getByText("75% answered (3 of 4)")).toBeInTheDocument();
    expect(screen.getByText("4.3")).toBeInTheDocument(); // check-in score, 1dp
    expect(screen.getByText("2 bugs · 5 ideas")).toBeInTheDocument();

    const rows = screen.getAllByRole("link", { name: /dana client/i });
    expect(rows[0]).toHaveAttribute("href", "/admin/feedback/f1");
    expect(rows[0]).toHaveTextContent("Client of Pixel Forge (Aurora Media)");
    expect(rows[1]).toHaveTextContent("Rating only");

    const tabs = screen.getByRole("navigation", { name: "Filter by status" });
    expect(within(tabs).getByRole("link", { name: /open/i })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "All" })).toHaveAttribute(
      "href",
      "/admin/feedback?status=all",
    );
  });

  it("pages through long result sets", () => {
    render(
      <FeedbackInbox
        page={{ items: [item()], total: 60 }}
        summary={SUMMARY}
        filter={{ status: "open", offset: 25 }}
      />,
    );
    expect(screen.getByText("26–50 of 60")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Newer" })).toHaveAttribute("href", "/admin/feedback");
    expect(screen.getByRole("link", { name: "Older →" })).toHaveAttribute(
      "href",
      "/admin/feedback?offset=50",
    );
  });

  it("has an empty state", () => {
    render(<FeedbackInbox page={{ items: [], total: 0 }} summary={SUMMARY} filter={{ status: "done" }} />);
    expect(screen.getByText("Nothing matches these filters.")).toBeInTheDocument();
  });
});
