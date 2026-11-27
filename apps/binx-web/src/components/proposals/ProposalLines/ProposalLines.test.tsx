import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/proposals/public/actions", () => ({ choosePublicProposalOptionsAction: vi.fn() }));
vi.mock("@/app/(portal)/portal/proposals/actions", () => ({ choosePortalProposalOptionsAction: vi.fn() }));

const mockedToastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => mockedToastError(...args) } }));

import { choosePortalProposalOptionsAction } from "@/app/(portal)/portal/proposals/actions";
import { choosePublicProposalOptionsAction } from "@/app/proposals/public/actions";
import type { ProposalLineItem, ProposalPackage } from "@/lib/proposals";

import ProposalLines from "./ProposalLines";

const mockedPublic = vi.mocked(choosePublicProposalOptionsAction);
const mockedPortal = vi.mocked(choosePortalProposalOptionsAction);

function line(id: string, description: string, cents: number, extra: Partial<ProposalLineItem> = {}): ProposalLineItem {
  return {
    id,
    position: 0,
    description,
    details: null,
    quantity: "1",
    unit_price_cents: cents,
    amount_cents: cents,
    service_id: null,
    billing: "one_time",
    package_id: null,
    optional: false,
    selected: true,
    included: true,
    ...extra,
  };
}

function pkg(id: string, name: string, extra: Partial<ProposalPackage> = {}): ProposalPackage {
  return {
    id,
    position: 0,
    name,
    description: null,
    recommended: false,
    selected: false,
    price_cents: 0,
    monthly_price_cents: 0,
    ...extra,
  };
}

const PACKAGES = [
  pkg("p-ess", "Essential", { price_cents: 600_000, description: "The site, done well." }),
  pkg("p-com", "Complete", { price_cents: 1_300_000, recommended: true, selected: true, monthly_price_cents: 5_000 }),
];
const LINES = [
  line("l-disc", "Discovery workshop", 200_000),
  line("l-five", "Five-page website", 600_000, { package_id: "p-ess", included: false }),
  line("l-ten", "Ten-page website", 1_300_000, { package_id: "p-com" }),
  line("l-copy", "Copywriting", 150_000, { optional: true }),
  line("l-seo", "SEO setup", 80_000, { optional: true, selected: false, included: false }),
  line("l-guide", "Brand guidelines", 120_000, { optional: true, selected: false, included: false, package_id: "p-com" }),
];

beforeEach(() => {
  vi.clearAllMocks();
  mockedPublic.mockResolvedValue({});
  mockedPortal.mockResolvedValue({});
});

describe("ProposalLines", () => {
  it("is a plain table when there's nothing to choose", () => {
    render(<ProposalLines currency="USD" lineItems={[line("l1", "Design", 10_000)]} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Design")).toBeInTheDocument();
    expect(screen.queryByText(/package/i)).not.toBeInTheDocument();
  });

  it("shows the shared lines, the packages with their prices and the add-ons on offer, read-only", () => {
    render(<ProposalLines currency="USD" lineItems={LINES} packages={PACKAGES} />);

    expect(screen.getByText("Included in every package")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("Discovery workshop")).toBeInTheDocument();

    const complete = screen.getByText("Complete").closest("label")!;
    expect(within(complete).getByText("Recommended")).toBeInTheDocument();
    expect(within(complete).getByText("Selected")).toBeInTheDocument();
    expect(within(complete).getByText("$13,000.00 + $50.00 / mo")).toBeInTheDocument();
    expect(within(complete).getByText("Ten-page website")).toBeInTheDocument();
    const essential = screen.getByText("Essential").closest("label")!;
    expect(within(essential).getByText("The site, done well.")).toBeInTheDocument();
    expect(within(essential).queryByText("Selected")).not.toBeInTheDocument();

    // Complete's own add-on is on offer, since Complete is selected.
    const addOns = screen.getByRole("group", { name: "Add-ons" });
    expect(within(addOns).getByText("Brand guidelines")).toBeInTheDocument();
    expect(within(addOns).getAllByText("Added")).toHaveLength(1);
    expect(within(addOns).getAllByText("Not added")).toHaveLength(2);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("saves the recipient's package choice, keeping only add-ons that package offers", async () => {
    const user = userEvent.setup();
    render(<ProposalLines currency="USD" lineItems={LINES} packages={PACKAGES} choose={{ token: "tok" }} />);

    expect(screen.getByRole("group", { name: "Choose a package" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Essential/ }));

    expect(mockedPublic).toHaveBeenCalledWith("tok", "p-ess", ["l-copy"]);
  });

  it("only offers the chosen package's add-ons", () => {
    const essential = PACKAGES.map((p) => ({ ...p, selected: p.id === "p-ess" }));
    render(<ProposalLines currency="USD" lineItems={LINES} packages={essential} choose={{ token: "tok" }} />);
    expect(screen.getByRole("radio", { name: /Essential/ })).toBeChecked();
    expect(screen.queryByText("Brand guidelines")).not.toBeInTheDocument();
  });

  it("ticks and unticks add-ons through the portal", async () => {
    const user = userEvent.setup();
    render(<ProposalLines currency="USD" lineItems={LINES} packages={PACKAGES} choose={{ proposalId: "prop-1" }} />);

    await user.click(screen.getByRole("checkbox", { name: /SEO setup/ }));
    expect(mockedPortal).toHaveBeenLastCalledWith("prop-1", "p-com", ["l-copy", "l-seo"]);

    await user.click(screen.getByRole("checkbox", { name: /Copywriting/ }));
    expect(mockedPortal).toHaveBeenLastCalledWith("prop-1", "p-com", []);
  });

  it("shows the error when the choice can't be saved", async () => {
    mockedPublic.mockResolvedValueOnce({ error: "This proposal has already been decided" });
    const user = userEvent.setup();
    render(<ProposalLines currency="USD" lineItems={LINES} packages={PACKAGES} choose={{ token: "tok" }} />);

    await user.click(screen.getByRole("checkbox", { name: /SEO setup/ }));
    expect(mockedToastError).toHaveBeenCalledWith("This proposal has already been decided");
  });

  it("offers add-ons without packages", () => {
    render(<ProposalLines currency="USD" lineItems={[LINES[0], LINES[3]]} choose={{ token: "tok" }} />);
    expect(screen.queryByText("Included in every package")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Copywriting/ })).toBeChecked();
  });
});
