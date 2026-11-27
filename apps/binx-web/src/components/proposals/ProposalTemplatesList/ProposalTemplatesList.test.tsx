import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/proposals/templates/actions", () => ({ deleteTemplateAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { deleteTemplateAction } from "@/app/(app)/proposals/templates/actions";
import type { ProposalTemplateSummary } from "@/lib/proposal-templates";

import ProposalTemplatesList from "./ProposalTemplatesList";

const mockedDelete = vi.mocked(deleteTemplateAction);

const template = (overrides: Partial<ProposalTemplateSummary> = {}): ProposalTemplateSummary => ({
  id: "t1",
  name: "Website build",
  description: "Our standard site",
  title: "Website for {client}",
  line_count: 5,
  package_names: ["Essential", "Complete"],
  currency: "USD",
  total_cents: 935_000,
  monthly_total_cents: 22_000,
  attachment_count: 2,
  use_count: 3,
  last_used_at: "2026-11-20T10:00:00Z",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-20T10:00:00Z",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProposalTemplatesList", () => {
  it("shows what each template holds, its price, and how it's used", () => {
    render(<ProposalTemplatesList agencyId="a1" templates={[template()]} />);
    const item = screen.getByRole("listitem");
    expect(within(item).getByRole("link", { name: "Website build" })).toHaveAttribute("href", "/proposals/templates/t1");
    expect(within(item).getByText("Our standard site")).toBeInTheDocument();
    expect(within(item).getByText("Packages: Essential, Complete")).toBeInTheDocument();
    expect(within(item).getByText("$9,350.00 + $220.00 / mo")).toBeInTheDocument();
    expect(within(item).getByText(/3 proposals, last/)).toBeInTheDocument();
    expect(within(item).getByRole("link", { name: "Use Website build" })).toHaveAttribute(
      "href",
      "/proposals/new?template=t1",
    );
  });

  it("says when a template hasn't been used", () => {
    render(<ProposalTemplatesList agencyId="a1" templates={[template({ use_count: 0, last_used_at: null })]} />);
    expect(screen.getByText("Not used yet")).toBeInTheDocument();
  });

  it("deletes after confirming", async () => {
    mockedDelete.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<ProposalTemplatesList agencyId="a1" templates={[template()]} />);
    await user.click(screen.getByRole("button", { name: "Delete Website build" }));
    await user.click(await screen.findByRole("button", { name: "Delete template" }));
    expect(mockedDelete).toHaveBeenCalledWith("a1", "t1");
  });

  it("explains templates when there are none", () => {
    render(<ProposalTemplatesList agencyId="a1" templates={[]} />);
    expect(screen.getByText(/No templates yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New template" })).toHaveAttribute("href", "/proposals/templates/new");
  });
});
