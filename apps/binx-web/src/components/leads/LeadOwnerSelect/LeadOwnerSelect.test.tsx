import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/(app)/leads/actions", () => ({ assignLeadOwnerAction: vi.fn() }));

import { assignLeadOwnerAction } from "@/app/(app)/leads/actions";
import LeadOwnerSelect from "./LeadOwnerSelect";

const mocked = vi.mocked(assignLeadOwnerAction);
const members = [
  { user_id: "u1", full_name: "Ada Lovelace" },
  { user_id: "u2", full_name: "Alan Turing" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocked.mockResolvedValue({} as never);
});

describe("LeadOwnerSelect", () => {
  it("lists every member plus Unassigned", () => {
    render(<LeadOwnerSelect agencyId="a1" leadId="l1" ownerId="u1" members={members} />);
    expect(screen.getByRole("option", { name: "Unassigned" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Alan Turing" })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("u1");
  });

  it("reassigns the owner and refreshes", async () => {
    render(<LeadOwnerSelect agencyId="a1" leadId="l1" ownerId="u1" members={members} />);
    await userEvent.selectOptions(screen.getByRole("combobox"), "u2");
    expect(mocked).toHaveBeenCalledWith("a1", "l1", "u2");
    expect(refresh).toHaveBeenCalled();
  });

  it("sends null when reassigning to Unassigned", async () => {
    render(<LeadOwnerSelect agencyId="a1" leadId="l1" ownerId="u1" members={members} />);
    await userEvent.selectOptions(screen.getByRole("combobox"), "");
    expect(mocked).toHaveBeenCalledWith("a1", "l1", null);
  });
});
