import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { LeadListItem } from "@/lib/leads";
import LeadsTable from "./LeadsTable";

function lead(overrides: Partial<LeadListItem>): LeadListItem {
  return {
    id: "l1",
    agency_id: "a1",
    name: "Acme Co",
    contact_name: "Jane",
    contact_email: "jane@acme.example",
    website: "https://acme.example",
    status: "new",
    source: "manual",
    owner_id: null,
    owner_name: null,
    score: null,
    estimated_value_cents: null,
    last_activity_at: "2026-09-03T00:00:00Z",
    converted_client_id: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("LeadsTable", () => {
  it("shows an empty state with no leads", () => {
    render(<LeadsTable agencyId="a1" leads={[]} />);
    expect(screen.getByText("No leads yet")).toBeInTheDocument();
  });

  it("links each row to the lead detail page", () => {
    render(<LeadsTable agencyId="a1" leads={[lead({ id: "l9", name: "Globex" })]} />);
    expect(screen.getByRole("link", { name: /Globex/ })).toHaveAttribute("href", "/leads/l9");
  });

  it("defaults to the Open filter, hiding won/lost", () => {
    render(
      <LeadsTable
        agencyId="a1"
        leads={[lead({ id: "a", name: "Open one", status: "qualified" }), lead({ id: "b", name: "Closed one", status: "won" })]}
      />,
    );
    expect(screen.getByText("Open one")).toBeInTheDocument();
    expect(screen.queryByText("Closed one")).not.toBeInTheDocument();
  });

  it("filters by a status chip", async () => {
    const user = userEvent.setup();
    render(
      <LeadsTable
        agencyId="a1"
        leads={[lead({ id: "a", name: "New one", status: "new" }), lead({ id: "b", name: "Qualified one", status: "qualified" })]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Qualified" }));
    expect(screen.getByText("Qualified one")).toBeInTheDocument();
    expect(screen.queryByText("New one")).not.toBeInTheDocument();
  });

  it("filters by search", async () => {
    const user = userEvent.setup();
    render(
      <LeadsTable
        agencyId="a1"
        leads={[lead({ id: "a", name: "Northwind" }), lead({ id: "b", name: "Contoso" })]}
      />,
    );
    await user.type(screen.getByRole("searchbox"), "north");
    expect(screen.getByText("Northwind")).toBeInTheDocument();
    expect(screen.queryByText("Contoso")).not.toBeInTheDocument();
  });
});
