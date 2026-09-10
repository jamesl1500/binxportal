import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ClientsTable itself makes no server calls, but it renders ArchiveClientButton
// per row, which does — mocked here purely so that child component mounts cleanly.
vi.mock("@/app/(app)/clients/actions", () => ({
  setClientActiveAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import type { AgencyClient } from "@/lib/clients";

import ClientsTable from "./ClientsTable";

const agencyId = "aaaaaaaa-1111-1111-1111-111111111111";

const acme: AgencyClient = {
  id: "cccccccc-3333-3333-3333-333333333333",
  agency_id: agencyId,
  name: "Acme Co",
  slug: "acme-co",
  is_active: true,
  primary_contact_name: "Jamie Rivera",
  primary_contact_email: "jamie@acme.example",
  primary_contact_phone: "555-0100",
  website: "https://acme.example",
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
};

const widgets: AgencyClient = {
  id: "dddddddd-4444-4444-4444-444444444444",
  agency_id: agencyId,
  name: "Widgets Co",
  slug: "widgets-co",
  is_active: false,
  primary_contact_name: null,
  primary_contact_email: null,
  primary_contact_phone: null,
  website: null,
  notes: null,
  created_at: "2026-02-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ClientsTable", () => {
  it("shows an empty state when there are no clients at all", () => {
    render(<ClientsTable agencyId={agencyId} clients={[]} />);

    expect(screen.getByText("No clients yet")).toBeInTheDocument();
  });

  it("defaults to the Active tab, showing only active clients", () => {
    render(<ClientsTable agencyId={agencyId} clients={[acme, widgets]} />);

    expect(screen.getByText("Acme Co")).toBeInTheDocument();
    expect(screen.queryByText("Widgets Co")).not.toBeInTheDocument();
  });

  it("switches to the Archived tab to show archived clients", async () => {
    const user = userEvent.setup();
    render(<ClientsTable agencyId={agencyId} clients={[acme, widgets]} />);

    await user.click(screen.getByRole("tab", { name: /archived/i }));

    expect(screen.getByText("Widgets Co")).toBeInTheDocument();
    expect(screen.queryByText("Acme Co")).not.toBeInTheDocument();
  });

  it("shows both on the All tab", async () => {
    const user = userEvent.setup();
    render(<ClientsTable agencyId={agencyId} clients={[acme, widgets]} />);

    await user.click(screen.getByRole("tab", { name: /^all/i }));

    expect(screen.getByText("Acme Co")).toBeInTheDocument();
    expect(screen.getByText("Widgets Co")).toBeInTheDocument();
  });

  it("filters by search across name and contact", async () => {
    const user = userEvent.setup();
    render(<ClientsTable agencyId={agencyId} clients={[acme, widgets]} />);
    await user.click(screen.getByRole("tab", { name: /^all/i }));

    await user.type(screen.getByLabelText("Search clients"), "jamie");

    expect(screen.getByText("Acme Co")).toBeInTheDocument();
    expect(screen.queryByText("Widgets Co")).not.toBeInTheDocument();
  });

  it("shows a no-results state when the search matches nothing", async () => {
    const user = userEvent.setup();
    render(<ClientsTable agencyId={agencyId} clients={[acme]} />);

    await user.type(screen.getByLabelText("Search clients"), "nonexistent");

    expect(screen.getByText("No matching clients")).toBeInTheDocument();
  });

  it("links each client to its detail page", () => {
    render(<ClientsTable agencyId={agencyId} clients={[acme]} />);

    expect(screen.getByRole("link", { name: /acme co/i })).toHaveAttribute("href", `/clients/${acme.id}`);
  });
});
