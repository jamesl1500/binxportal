import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PlatformOverview } from "@/lib/admin";
import type { FeedbackAdminItem } from "@/lib/feedback-client";

import AdminOverview from "./AdminOverview";

const OVERVIEW: PlatformOverview = {
  agencies_total: 42,
  agencies_new_7d: 3,
  agencies_new_30d: 11,
  users_total: 310,
  users_new_7d: 20,
  staff_users: 120,
  portal_users: 190,
  clients_total: 75,
  projects_active: 64,
  paying_agencies: 1,
  mrr_cents: 14900,
  trialing_agencies: 2,
  plan_mix: [
    { key: "free", name: "Free", agencies: 30, trialing: 0 },
    { key: "starter", name: "Starter", agencies: 8, trialing: 2 },
    { key: "pro", name: "Pro", agencies: 4, trialing: 0 },
    { key: "scale", name: "Scale", agencies: 0, trialing: 0 },
  ],
  signups_by_week: [
    { week_start: "2026-11-02", agencies: 2, users: 9 },
    { week_start: "2026-11-09", agencies: 0, users: 4 },
    { week_start: "2026-11-16", agencies: 3, users: 12 },
  ],
  recent_agencies: [
    {
      id: "a1",
      name: "Pixel Forge",
      created_at: "2026-11-17T12:00:00Z",
      plan: "starter",
      plan_name: "Starter",
      trialing: true,
      owner_name: "Olivia Owner",
      owner_email: "olivia@pixel.example",
      members: 4,
      clients: 2,
    },
  ],
};

const FEEDBACK = [
  {
    id: "f1",
    kind: "bug",
    status: "new",
    message: "Invoice export spins forever",
    user_name: "Dana Client",
    agency_name: "Pixel Forge",
  },
] as FeedbackAdminItem[];

describe("AdminOverview", () => {
  it("shows the headline numbers", () => {
    render(
      <AdminOverview
        overview={OVERVIEW}
        openFeedback={FEEDBACK}
        openFeedbackTotal={7}
      />,
    );
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(
      screen.getByText("+3 this week · +11 in 30 days"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("120 staff · 190 portal clients"),
    ).toBeInTheDocument();
    expect(screen.getByText("$149.00")).toBeInTheDocument();
    expect(
      screen.getByText("1 paying agency · 2 on trial"),
    ).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("charts weekly signups with a table view", () => {
    render(
      <AdminOverview
        overview={OVERVIEW}
        openFeedback={[]}
        openFeedbackTotal={0}
      />,
    );
    expect(
      screen.getByRole("img", { name: "New agencies per week" }),
    ).toBeInTheDocument();
    expect(screen.getByText("5 agencies in 3 weeks")).toBeInTheDocument();
    const rows = within(screen.getAllByRole("table")[0]).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Nov 2");
    expect(rows[3]).toHaveTextContent("Nov 16312");
  });

  it("lists the plan mix with trials called out", () => {
    render(
      <AdminOverview
        overview={OVERVIEW}
        openFeedback={[]}
        openFeedbackTotal={0}
      />,
    );
    expect(screen.getByText("(2 trial)")).toBeInTheDocument();
    expect(
      screen.getByText("75 clients · 64 active projects"),
    ).toBeInTheDocument();
  });

  it("shows the newest agencies", () => {
    render(
      <AdminOverview
        overview={OVERVIEW}
        openFeedback={[]}
        openFeedbackTotal={0}
      />,
    );
    const row = screen.getByText("Pixel Forge").closest("tr")!;
    expect(row).toHaveTextContent("olivia@pixel.example");
    expect(row).toHaveTextContent("StarterTrial");
  });

  it("links open feedback to its detail page, or says inbox zero", () => {
    const { rerender } = render(
      <AdminOverview
        overview={OVERVIEW}
        openFeedback={FEEDBACK}
        openFeedbackTotal={1}
      />,
    );
    expect(
      screen.getByRole("link", { name: /invoice export spins/i }),
    ).toHaveAttribute("href", "/admin/feedback/f1");
    rerender(
      <AdminOverview
        overview={OVERVIEW}
        openFeedback={[]}
        openFeedbackTotal={0}
      />,
    );
    expect(screen.getByText(/inbox zero/i)).toBeInTheDocument();
  });
});
