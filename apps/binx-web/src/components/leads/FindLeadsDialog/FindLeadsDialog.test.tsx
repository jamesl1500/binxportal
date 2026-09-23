import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/(app)/leads/actions", () => ({
  generateLeadsAction: vi.fn(),
  importLeadsAction: vi.fn(),
  getLeadSearchCriteriaAction: vi.fn(),
  createLeadSearchCriteriaAction: vi.fn(),
  deleteLeadSearchCriteriaAction: vi.fn(),
}));

import {
  createLeadSearchCriteriaAction,
  deleteLeadSearchCriteriaAction,
  generateLeadsAction,
  getLeadSearchCriteriaAction,
  importLeadsAction,
} from "@/app/(app)/leads/actions";
import { toast } from "sonner";
import FindLeadsDialog from "./FindLeadsDialog";

const generate = vi.mocked(generateLeadsAction);
const importLeads = vi.mocked(importLeadsAction);
const getCriteria = vi.mocked(getLeadSearchCriteriaAction);
const createCriteria = vi.mocked(createLeadSearchCriteriaAction);
const deleteCriteria = vi.mocked(deleteLeadSearchCriteriaAction);

const candidates = [
  {
    name: "Acme",
    website: "https://acme.test",
    rationale: "Needs a rebrand",
    estimated_value_cents: 500000,
    source: "web_search",
  },
  { name: "Beta", website: null, rationale: null, estimated_value_cents: null, source: "google_places" },
];

beforeEach(() => {
  vi.clearAllMocks();
  getCriteria.mockResolvedValue({ criteria: [] });
});

async function openAndSearch() {
  render(<FindLeadsDialog agencyId="a1" />);
  await userEvent.click(screen.getByRole("button", { name: "Find leads" }));
  await userEvent.type(screen.getByLabelText("Industry / vertical"), "skincare");
  await userEvent.click(screen.getByRole("button", { name: "Find leads" }));
}

describe("FindLeadsDialog", () => {
  it("runs the prospector and lists the candidates, all pre-checked", async () => {
    generate.mockResolvedValueOnce({ candidates } as never);
    await openAndSearch();
    expect(generate).toHaveBeenCalledWith("a1", expect.objectContaining({ industry: "skincare", count: 5 }));
    expect(await screen.findByText("Acme")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox").every((c) => (c as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole("button", { name: "Import 2 leads" })).toBeInTheDocument();
  });

  it("shows a hint when the brief returns nothing", async () => {
    generate.mockResolvedValueOnce({ candidates: [] } as never);
    await openAndSearch();
    expect(await screen.findByText(/try a broader brief/i)).toBeInTheDocument();
  });

  it("imports the chosen candidates and closes", async () => {
    generate.mockResolvedValueOnce({ candidates } as never);
    importLeads.mockResolvedValueOnce({ result: { imported: [{}, {}], skipped: [{}] } } as never);
    await openAndSearch();
    await screen.findByText("Acme");
    await userEvent.click(screen.getByRole("checkbox", { name: /Beta/ })); // deselect one
    await userEvent.click(screen.getByRole("button", { name: /Import 1 lead/ }));
    expect(importLeads).toHaveBeenCalledWith("a1", [candidates[0]]);
    expect(toast.success).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("refuses to import with nothing selected", async () => {
    generate.mockResolvedValueOnce({ candidates } as never);
    await openAndSearch();
    await screen.findByText("Acme");
    for (const cb of screen.getAllByRole("checkbox")) await userEvent.click(cb);
    await userEvent.click(screen.getByRole("button", { name: /Import 0 leads/ }));
    expect(await screen.findByText(/pick at least one company/i)).toBeInTheDocument();
    expect(importLeads).not.toHaveBeenCalled();
  });

  it("shows each candidate's source", async () => {
    generate.mockResolvedValueOnce({ candidates } as never);
    await openAndSearch();
    expect(await screen.findByText("Web search")).toBeInTheDocument();
    expect(screen.getByText("Google Places")).toBeInTheDocument();
  });

  it("lists saved searches and runs one by its own criteria id", async () => {
    getCriteria.mockResolvedValue({
      criteria: [
        {
          id: "c1",
          agency_id: "a1",
          name: "SaaS in Austin",
          industry: "SaaS",
          location: "Austin, TX",
          radius_miles: 25,
          company_size: null,
          keywords: null,
          count: 5,
          last_run_at: null,
          last_run_result_count: null,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    } as never);
    generate.mockResolvedValueOnce({ candidates } as never);

    render(<FindLeadsDialog agencyId="a1" />);
    await userEvent.click(screen.getByRole("button", { name: "Find leads" }));
    await userEvent.click(await screen.findByRole("button", { name: "SaaS in Austin" }));

    expect(generate).toHaveBeenCalledWith("a1", expect.objectContaining({ criteriaId: "c1" }));
    expect(await screen.findByText("Acme")).toBeInTheDocument();
  });

  it("saves the current brief as a named search", async () => {
    createCriteria.mockResolvedValueOnce({
      criteria: { id: "c2", name: "Berlin software", agency_id: "a1" } as never,
    });

    render(<FindLeadsDialog agencyId="a1" />);
    await userEvent.click(screen.getByRole("button", { name: "Find leads" }));
    await userEvent.type(screen.getByLabelText("Industry / vertical"), "software");
    await userEvent.type(screen.getByPlaceholderText("Name this search to save it for later"), "Berlin software");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(createCriteria).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ name: "Berlin software", industry: "software" }),
    );
    expect(toast.success).toHaveBeenCalledWith('Saved "Berlin software"');
  });

  it("deletes a saved search", async () => {
    getCriteria.mockResolvedValue({
      criteria: [
        {
          id: "c1",
          agency_id: "a1",
          name: "SaaS in Austin",
          industry: null,
          location: null,
          radius_miles: null,
          company_size: null,
          keywords: null,
          count: 5,
          last_run_at: null,
          last_run_result_count: null,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    } as never);
    deleteCriteria.mockResolvedValueOnce({});

    render(<FindLeadsDialog agencyId="a1" />);
    await userEvent.click(screen.getByRole("button", { name: "Find leads" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete saved search SaaS in Austin" }));

    expect(deleteCriteria).toHaveBeenCalledWith("a1", "c1");
  });
});
