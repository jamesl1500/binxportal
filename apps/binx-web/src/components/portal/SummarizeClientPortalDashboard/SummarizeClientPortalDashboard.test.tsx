import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { PORTAL_HOME_VIEW_COOKIE, type PortalSummary } from "@/lib/portal-insights";

import SummarizeClientPortalDashboard from "./SummarizeClientPortalDashboard";

const SUMMARY: PortalSummary = {
  tone: "danger",
  headline: "Waiting on you: an overdue invoice.",
  nextSteps: [
    {
      id: "invoice-1",
      kind: "invoice",
      tone: "danger",
      title: "Invoice INV-0001 is overdue",
      detail: "$100.00 · 5 days overdue",
      href: "/portal/invoices/1",
      cta: "Pay invoice",
    },
  ],
  moreSteps: 2,
  projects: [
    {
      id: "p1",
      name: "Brand refresh",
      status: "active",
      percent: 60,
      due: { label: "Due in 3 days", tone: "soon" },
      href: "/portal/projects/p1",
    },
  ],
  moreProjects: 0,
  facts: [
    { id: "money", tone: "danger", text: "$100.00 outstanding across 1 invoice — 1 overdue", href: "/portal/invoices" },
  ],
};

function renderDashboard(initialView?: "summary" | "full") {
  return render(
    <SummarizeClientPortalDashboard summary={SUMMARY} initialView={initialView}>
      <p>Full dashboard</p>
    </SummarizeClientPortalDashboard>,
  );
}

describe("SummarizeClientPortalDashboard", () => {
  beforeEach(() => {
    document.cookie = `${PORTAL_HOME_VIEW_COOKIE}=; path=/; max-age=0`;
  });

  it("shows the full dashboard until the client asks for the summary", () => {
    renderDashboard();

    expect(screen.getByText("Full dashboard")).toBeInTheDocument();
    expect(screen.queryByText(SUMMARY.headline)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Summarize" }));

    expect(screen.queryByText("Full dashboard")).not.toBeInTheDocument();
    expect(screen.getByText(SUMMARY.headline)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Invoice INV-0001 is overdue/ })).toHaveAttribute(
      "href",
      "/portal/invoices/1",
    );
    expect(screen.getByRole("link", { name: /Brand refresh/ })).toHaveAttribute("href", "/portal/projects/p1");
    expect(screen.getByRole("link", { name: /Brand refresh/ })).toHaveTextContent("In progress · Due in 3 days60%");
    expect(document.cookie).toContain(`${PORTAL_HOME_VIEW_COOKIE}=summary`);
  });

  it("opens on the summary when that was the client's last choice, and switches back", () => {
    renderDashboard("summary");

    expect(screen.getByText(SUMMARY.headline)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+ 2 more on the full dashboard" }));

    expect(screen.getByText("Full dashboard")).toBeInTheDocument();
    expect(document.cookie).toContain(`${PORTAL_HOME_VIEW_COOKIE}=full`);
  });
});
