import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

vi.mock("@/app/(app)/proposals/actions", () => ({
  createProposalAction: vi.fn(),
  updateProposalAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { createProposalAction } from "@/app/(app)/proposals/actions";

import ProposalForm from "./ProposalForm";

const mockedCreate = vi.mocked(createProposalAction);

const services = [
  {
    id: "svc-1",
    agency_id: "a1",
    name: "Brand strategy",
    description: "Two workshops and a positioning doc",
    pricing_type: "fixed",
    unit_price_cents: 500000,
    default_quantity: "1.00",
    is_archived: false,
    created_at: "2026-11-01T00:00:00Z",
  },
  {
    id: "svc-2",
    agency_id: "a1",
    name: "Design hours",
    description: null,
    pricing_type: "hourly",
    unit_price_cents: 15000,
    default_quantity: "10.00",
    is_archived: false,
    created_at: "2026-11-01T00:00:00Z",
  },
];

const clients = [
  { id: "client-1", name: "Acme Co", primaryContactName: "Wile Coyote", primaryContactEmail: "wile@acme.example" },
  { id: "client-2", name: "Globex", primaryContactName: null, primaryContactEmail: null },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProposalForm", () => {
  it("computes live totals matching the backend formula", async () => {
    const user = userEvent.setup();
    render(<ProposalForm agencyId="a1" clients={clients} />);

    await user.type(screen.getByLabelText(/^Title$/), "Website redesign");
    await user.type(screen.getByLabelText("Line 1 description"), "Design");
    await user.clear(screen.getByLabelText("Line 1 quantity"));
    await user.type(screen.getByLabelText("Line 1 quantity"), "10");
    await user.type(screen.getByLabelText("Line 1 unit price"), "150");

    // subtotal 10 * $150 = $1,500 (shown as the line amount and the subtotal)
    expect(screen.getAllByText("$1,500.00").length).toBeGreaterThanOrEqual(2);

    await user.clear(screen.getByLabelText("Tax rate (%)"));
    await user.type(screen.getByLabelText("Tax rate (%)"), "10");
    // 10% of 1500 = 150 -> Total $1,650
    expect(screen.getByText("$150.00")).toBeInTheDocument();
    expect(screen.getByText("$1,650.00")).toBeInTheDocument();
  });

  it("submits the line items and totals inputs with no client selected", async () => {
    mockedCreate.mockResolvedValueOnce({ proposal: { id: "p1" } as never });
    const user = userEvent.setup();
    render(<ProposalForm agencyId="a1" clients={clients} />);

    await user.type(screen.getByLabelText(/^Title$/), "Retainer proposal");
    await user.type(screen.getByLabelText("Line 1 description"), "Retainer");
    await user.type(screen.getByLabelText("Line 1 unit price"), "2000");
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    expect(mockedCreate).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({
        title: "Retainer proposal",
        leadId: null,
        clientId: null,
        lineItems: [
          {
            description: "Retainer",
            details: null,
            quantity: "1",
            unitPriceCents: 200000,
            serviceId: null,
            billing: "one_time",
            packageKey: null,
            optional: false,
            selected: true,
          },
        ],
      }),
    );
    expect(mockPush).toHaveBeenCalledWith("/proposals/p1");
  });

  it("fills the empty line from a picked service, then adds a line for the next", async () => {
    mockedCreate.mockResolvedValueOnce({ proposal: { id: "p1" } as never });
    const user = userEvent.setup();
    render(<ProposalForm agencyId="a1" clients={clients} services={services} />);

    await user.type(screen.getByLabelText(/^Title$/), "Brand refresh");
    await user.selectOptions(screen.getByLabelText("Add from services"), "svc-1");
    expect(screen.getByLabelText("Line 1 description")).toHaveValue("Brand strategy");
    expect(screen.getByLabelText("Line 1 details")).toHaveValue("Two workshops and a positioning doc");
    expect(screen.getByLabelText("Line 1 unit price")).toHaveValue(5000);
    // The picker snaps back so the next pick is a fresh choice.
    expect(screen.getByLabelText("Add from services")).toHaveValue("");

    await user.selectOptions(screen.getByLabelText("Add from services"), "svc-2");
    expect(screen.getByLabelText("Line 2 description")).toHaveValue("Design hours");
    expect(screen.getByLabelText("Line 2 quantity")).toHaveValue(10);

    // The copied price can still be edited; the line keeps its service link.
    await user.clear(screen.getByLabelText("Line 2 unit price"));
    await user.type(screen.getByLabelText("Line 2 unit price"), "120");
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    expect(mockedCreate).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({
        lineItems: [
          {
            description: "Brand strategy",
            details: "Two workshops and a positioning doc",
            quantity: "1",
            unitPriceCents: 500000,
            serviceId: "svc-1",
            billing: "one_time",
            packageKey: null,
            optional: false,
            selected: true,
          },
          {
            description: "Design hours",
            details: null,
            quantity: "10",
            unitPriceCents: 12000,
            serviceId: "svc-2",
            billing: "one_time",
            packageKey: null,
            optional: false,
            selected: true,
          },
        ],
      }),
    );
  });

  it("points at Settings → Services when the catalog is empty", () => {
    render(<ProposalForm agencyId="a1" clients={clients} />);
    expect(screen.getByRole("link", { name: /set up your services/i })).toHaveAttribute("href", "/settings/services");
  });

  it("opens a details box for a hand-typed line", async () => {
    mockedCreate.mockResolvedValueOnce({ proposal: { id: "p1" } as never });
    const user = userEvent.setup();
    render(<ProposalForm agencyId="a1" clients={clients} />);

    await user.type(screen.getByLabelText(/^Title$/), "Retainer proposal");
    await user.type(screen.getByLabelText("Line 1 description"), "Retainer");
    await user.type(screen.getByLabelText("Line 1 unit price"), "2000");
    await user.click(screen.getByRole("button", { name: "+ Details" }));
    await user.type(screen.getByLabelText("Line 1 details"), "Up to 20 hours a month");
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    expect(mockedCreate).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({
        lineItems: [expect.objectContaining({ details: "Up to 20 hours a month", serviceId: null })],
      }),
    );
  });

  it("lists every client as an option, defaulting to No client", () => {
    render(<ProposalForm agencyId="a1" clients={clients} />);

    const select = screen.getByLabelText(/^Client$/) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByRole("option", { name: "Acme Co" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Globex" })).toBeInTheDocument();
  });

  it("submits with a pre-selected client from initialClientId", async () => {
    mockedCreate.mockResolvedValueOnce({ proposal: { id: "p1" } as never });
    const user = userEvent.setup();
    render(<ProposalForm agencyId="a1" clients={clients} initialClientId="client-1" />);

    expect((screen.getByLabelText(/^Client$/) as HTMLSelectElement).value).toBe("client-1");

    await user.type(screen.getByLabelText(/^Title$/), "Retainer proposal");
    await user.type(screen.getByLabelText("Line 1 description"), "Retainer");
    await user.type(screen.getByLabelText("Line 1 unit price"), "2000");
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    expect(mockedCreate).toHaveBeenCalledWith("a1", expect.objectContaining({ clientId: "client-1" }));
  });

  it("submits with a client picked from the dropdown, overriding no default", async () => {
    mockedCreate.mockResolvedValueOnce({ proposal: { id: "p1" } as never });
    const user = userEvent.setup();
    render(<ProposalForm agencyId="a1" clients={clients} />);

    await user.selectOptions(screen.getByLabelText(/^Client$/), "client-2");
    await user.type(screen.getByLabelText(/^Title$/), "Brand refresh");
    await user.type(screen.getByLabelText("Line 1 description"), "Design");
    await user.type(screen.getByLabelText("Line 1 unit price"), "500");
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    expect(mockedCreate).toHaveBeenCalledWith("a1", expect.objectContaining({ clientId: "client-2" }));
  });

  it("auto-fills recipient name/email from the selected client's contact info", async () => {
    const user = userEvent.setup();
    render(<ProposalForm agencyId="a1" clients={clients} />);

    await user.selectOptions(screen.getByLabelText(/^Client$/), "client-1");

    expect(screen.getByLabelText("Recipient name")).toHaveValue("Wile Coyote");
    expect(screen.getByLabelText("Recipient email")).toHaveValue("wile@acme.example");
  });

  it("clears recipient name/email when the selected client has no contact info on file", async () => {
    const user = userEvent.setup();
    render(<ProposalForm agencyId="a1" clients={clients} />);

    await user.selectOptions(screen.getByLabelText(/^Client$/), "client-1");
    await user.selectOptions(screen.getByLabelText(/^Client$/), "client-2");

    expect(screen.getByLabelText("Recipient name")).toHaveValue("");
    expect(screen.getByLabelText("Recipient email")).toHaveValue("");
  });

  it("won't submit without a title or a described line", async () => {
    const user = userEvent.setup();
    render(<ProposalForm agencyId="a1" clients={clients} />);

    expect(screen.getByRole("button", { name: /create draft/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /create draft/i }));
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("can require the agency's countersignature", async () => {
    mockedCreate.mockResolvedValueOnce({ proposal: { id: "p1" } as never });
    const user = userEvent.setup();
    render(<ProposalForm agencyId="a1" clients={clients} />);

    await user.type(screen.getByLabelText(/^Title$/), "Retainer proposal");
    await user.type(screen.getByLabelText("Line 1 description"), "Retainer");
    await user.type(screen.getByLabelText("Line 1 unit price"), "2000");
    await user.click(screen.getByRole("checkbox", { name: /require our countersignature/i }));
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    expect(mockedCreate).toHaveBeenCalledWith("a1", expect.objectContaining({ requiresCountersign: true }));
  });

  it("starts a proposal for a lead, prefilled, with acceptance settings", async () => {
    mockedCreate.mockResolvedValueOnce({ proposal: { id: "p1" } as never });
    const user = userEvent.setup();
    render(
      <ProposalForm
        agencyId="a1"
        clients={clients}
        lead={{ id: "lead-1", name: "Northwind", contactName: "Alex Kim", contactEmail: "alex@northwind.example" }}
        kickoffTemplates={[{ id: "kt1", name: "Brand kickoff" }]}
      />,
    );

    expect(screen.getByText(/For the lead/)).toHaveTextContent("Northwind");
    expect(screen.getByLabelText("Recipient name")).toHaveValue("Alex Kim");
    expect(screen.getByLabelText("Recipient email")).toHaveValue("alex@northwind.example");
    // A lead's proposal starts a project by default.
    expect(screen.getByRole("checkbox", { name: /start a project/i })).toBeChecked();

    await user.type(screen.getByLabelText(/^Title$/), "Brand refresh");
    await user.type(screen.getByLabelText("Line 1 description"), "Strategy");
    await user.type(screen.getByLabelText("Line 1 unit price"), "5000");
    await user.type(screen.getByLabelText(/deposit/i), "30");
    await user.selectOptions(screen.getByLabelText("Kickoff questionnaire"), "kt1");
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    expect(mockedCreate).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({
        leadId: "lead-1",
        depositPercent: "30",
        createProjectOnAccept: true,
        kickoffTemplateId: "kt1",
      }),
    );
  });

  it("can drop the lead", async () => {
    mockedCreate.mockResolvedValueOnce({ proposal: { id: "p1" } as never });
    const user = userEvent.setup();
    render(<ProposalForm agencyId="a1" clients={clients} lead={{ id: "lead-1", name: "Northwind" }} />);
    await user.click(screen.getByRole("button", { name: "Not for this lead" }));
    await user.type(screen.getByLabelText(/^Title$/), "P");
    await user.type(screen.getByLabelText("Line 1 description"), "X");
    await user.type(screen.getByLabelText("Line 1 unit price"), "1");
    await user.click(screen.getByRole("button", { name: /create draft/i }));
    expect(mockedCreate).toHaveBeenCalledWith("a1", expect.objectContaining({ leadId: null }));
  });

  it("totals monthly lines per month, apart from the one-time total", async () => {
    mockedCreate.mockResolvedValueOnce({ proposal: { id: "p1" } as never });
    const user = userEvent.setup();
    const retainer = {
      ...services[0],
      id: "svc-3",
      name: "Design retainer",
      description: null,
      pricing_type: "monthly",
      unit_price_cents: 250000,
    };
    render(<ProposalForm agencyId="a1" clients={clients} services={[...services, retainer]} />);

    await user.type(screen.getByLabelText(/^Title$/), "Brand refresh");
    await user.type(screen.getByLabelText("Line 1 description"), "Strategy");
    await user.type(screen.getByLabelText("Line 1 unit price"), "5000");
    // A monthly service comes in as a monthly line.
    await user.selectOptions(screen.getByLabelText("Add from services"), "svc-3");
    expect(screen.getByLabelText("Line 2 billing")).toHaveValue("monthly");
    expect(screen.getByText("Monthly total").nextSibling).toHaveTextContent("$2,500.00 / mo");
    expect(screen.getByText("Total").nextSibling).toHaveTextContent("$5,000.00");
    expect(screen.getByText(/invoiced every month from when the work starts/)).toBeInTheDocument();

    // Any line can be switched by hand.
    await user.selectOptions(screen.getByLabelText("Line 1 billing"), "monthly");
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
    expect(screen.getByText("Monthly total").nextSibling).toHaveTextContent("$7,500.00 / mo");

    await user.click(screen.getByRole("button", { name: /create draft/i }));
    expect(mockedCreate).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({
        lineItems: [
          expect.objectContaining({ description: "Strategy", billing: "monthly" }),
          expect.objectContaining({ description: "Design retainer", billing: "monthly", serviceId: "svc-3" }),
        ],
      }),
    );
  });

  it("offers packages: lines go in one, totals follow the recommended one, and it saves them", async () => {
    mockedCreate.mockResolvedValueOnce({ proposal: { id: "p1" } as never });
    const user = userEvent.setup();
    render(<ProposalForm agencyId="a1" clients={clients} />);

    await user.type(screen.getByLabelText(/^Title$/), "Website");
    await user.type(screen.getByLabelText("Line 1 description"), "Discovery");
    await user.type(screen.getByLabelText("Line 1 unit price"), "1000");
    await user.click(screen.getByRole("button", { name: "Offer packages" }));
    // Two packages to start, neither removable below two.
    expect(screen.getByRole("button", { name: "Remove package 1" })).toBeDisabled();
    expect(screen.getByText("Give each package a name.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create draft/i })).toBeDisabled();

    await user.type(screen.getByLabelText("Package 1 name"), "Essential");
    await user.type(screen.getByLabelText("Package 2 name"), "Complete");
    expect(screen.getByText("Add at least one line to Essential.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add line" }));
    await user.type(screen.getByLabelText("Line 2 description"), "Small site");
    await user.type(screen.getByLabelText("Line 2 unit price"), "4000");
    await user.selectOptions(screen.getByLabelText("Line 2 package"), "Essential");
    await user.click(screen.getByRole("button", { name: "Add line" }));
    await user.type(screen.getByLabelText("Line 3 description"), "Large site");
    await user.type(screen.getByLabelText("Line 3 unit price"), "9000");
    await user.selectOptions(screen.getByLabelText("Line 3 package"), "Complete");
    await user.click(screen.getByRole("radio", { name: "Recommend package 2" }));

    // Discovery + Large site: the recommended package.
    expect(screen.getByText("Total").nextSibling).toHaveTextContent("$10,000.00");
    expect(screen.getByText(/For Complete\./)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create draft/i }));
    const input = mockedCreate.mock.calls[0][1];
    expect(input.packages).toEqual([
      expect.objectContaining({ name: "Essential", recommended: false }),
      expect.objectContaining({ name: "Complete", recommended: true }),
    ]);
    const [essential, complete] = input.packages!;
    expect(input.lineItems.map((item) => [item.description, item.packageKey])).toEqual([
      ["Discovery", null],
      ["Small site", essential.key],
      ["Large site", complete.key],
    ]);
  });

  it("makes add-ons, counting only the pre-selected ones", async () => {
    mockedCreate.mockResolvedValueOnce({ proposal: { id: "p1" } as never });
    const user = userEvent.setup();
    render(<ProposalForm agencyId="a1" clients={clients} />);

    await user.type(screen.getByLabelText(/^Title$/), "Website");
    await user.type(screen.getByLabelText("Line 1 description"), "Site");
    await user.type(screen.getByLabelText("Line 1 unit price"), "5000");
    await user.click(screen.getByRole("button", { name: "Add line" }));
    await user.type(screen.getByLabelText("Line 2 description"), "SEO");
    await user.type(screen.getByLabelText("Line 2 unit price"), "800");
    await user.selectOptions(screen.getByLabelText("Line 2 type"), "add_on");
    expect(screen.getByText("Total").nextSibling).toHaveTextContent("$5,000.00");
    expect(screen.getByText(/With the pre-selected add-ons\./)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Line 2 type"), "add_on_on");
    expect(screen.getByText("Total").nextSibling).toHaveTextContent("$5,800.00");

    await user.click(screen.getByRole("button", { name: /create draft/i }));
    expect(mockedCreate.mock.calls[0][1].lineItems[1]).toEqual(
      expect.objectContaining({ description: "SEO", optional: true, selected: true }),
    );
  });

  it("loads a draft's packages and stops offering them on request", async () => {
    const user = userEvent.setup();
    const draft = {
      id: "p1",
      title: "Website",
      currency: "USD",
      tax_rate_percent: "0",
      line_items: [
        { id: "l1", description: "Small site", quantity: "1", unit_price_cents: 400000, package_id: "pk-1" },
        { id: "l2", description: "Large site", quantity: "1", unit_price_cents: 900000, package_id: "pk-2" },
        { id: "l3", description: "SEO", quantity: "1", unit_price_cents: 80000, optional: true, selected: false },
      ],
      packages: [
        { id: "pk-1", name: "Essential", description: null, recommended: false, selected: false },
        { id: "pk-2", name: "Complete", description: "Everything", recommended: true, selected: true },
      ],
    } as never;
    render(<ProposalForm agencyId="a1" clients={clients} proposal={draft} />);

    expect(screen.getByLabelText("Package 2 description")).toHaveValue("Everything");
    expect(screen.getByLabelText("Line 1 package")).toHaveValue("pk-1");
    expect(screen.getByLabelText("Line 3 type")).toHaveValue("add_on");
    expect(screen.getByText("Total").nextSibling).toHaveTextContent("$9,000.00");

    await user.click(screen.getByRole("button", { name: "Stop offering packages" }));
    expect(screen.queryByLabelText("Line 1 package")).not.toBeInTheDocument();
    expect(screen.getByText("Total").nextSibling).toHaveTextContent("$13,000.00");
  });
});
