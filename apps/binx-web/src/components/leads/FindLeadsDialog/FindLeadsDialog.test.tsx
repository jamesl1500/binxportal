import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/(app)/leads/actions", () => ({ generateLeadsAction: vi.fn(), importLeadsAction: vi.fn() }));

import { generateLeadsAction, importLeadsAction } from "@/app/(app)/leads/actions";
import { toast } from "sonner";
import FindLeadsDialog from "./FindLeadsDialog";

const generate = vi.mocked(generateLeadsAction);
const importLeads = vi.mocked(importLeadsAction);

const candidates = [
  { name: "Acme", website: "https://acme.test", rationale: "Needs a rebrand", estimated_value_cents: 500000 },
  { name: "Beta", website: null, rationale: null, estimated_value_cents: null },
];

beforeEach(() => vi.clearAllMocks());

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
});
