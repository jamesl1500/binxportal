import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/app/(app)/leads/actions", () => ({ deleteLeadAction: vi.fn() }));

import { deleteLeadAction } from "@/app/(app)/leads/actions";
import { toast } from "sonner";
import DeleteLeadButton from "./DeleteLeadButton";

const mocked = vi.mocked(deleteLeadAction);

beforeEach(() => vi.clearAllMocks());

describe("DeleteLeadButton", () => {
  it("asks to confirm before deleting", async () => {
    render(<DeleteLeadButton agencyId="a1" leadId="l1" leadName="Acme" />);
    await userEvent.click(screen.getByRole("button", { name: /delete lead/i }));
    expect(screen.getByText("Delete Acme?")).toBeInTheDocument();
    expect(mocked).not.toHaveBeenCalled();
  });

  it("deletes on confirm", async () => {
    mocked.mockResolvedValueOnce(undefined as never);
    render(<DeleteLeadButton agencyId="a1" leadId="l1" leadName="Acme" />);
    await userEvent.click(screen.getByRole("button", { name: /delete lead/i }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(mocked).toHaveBeenCalledWith("a1", "l1");
  });

  it("can back out of the confirm row", async () => {
    render(<DeleteLeadButton agencyId="a1" leadId="l1" leadName="Acme" />);
    await userEvent.click(screen.getByRole("button", { name: /delete lead/i }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: /delete lead/i })).toBeInTheDocument();
  });

  it("toasts an error the action returns", async () => {
    mocked.mockResolvedValueOnce({ error: "Not allowed" } as never);
    render(<DeleteLeadButton agencyId="a1" leadId="l1" leadName="Acme" />);
    await userEvent.click(screen.getByRole("button", { name: /delete lead/i }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(toast.error).toHaveBeenCalledWith("Not allowed");
  });
});
