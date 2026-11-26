import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/(app)/proposals/actions", () => ({ countersignProposalAction: vi.fn() }));

import { toast } from "sonner";

import { countersignProposalAction } from "@/app/(app)/proposals/actions";

import CountersignPanel from "./CountersignPanel";

const countersign = vi.mocked(countersignProposalAction);
const CONSENT = "I agree to sign this proposal electronically.";
const HASH = "a".repeat(64);
const props = {
  agencyId: "a1",
  proposalId: "p1",
  clientName: "Jane Prospect",
  consentText: CONSENT,
  documentHash: HASH,
  signerName: "Olivia Owner",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CountersignPanel", () => {
  it("countersigns after the e-sign consent", async () => {
    countersign.mockResolvedValueOnce({ proposal: {} as never });
    const user = userEvent.setup();
    render(<CountersignPanel {...props} canSign />);

    expect(screen.getByText(/Jane Prospect has signed/)).toBeInTheDocument();
    expect(screen.getByText("Signing as Olivia Owner")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Countersign proposal" });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: CONSENT }));
    await user.click(submit);

    expect(countersign).toHaveBeenCalledWith("a1", "p1", true, HASH);
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows binx-api's refusal", async () => {
    countersign.mockResolvedValueOnce({ error: "This isn't the version the client signed." });
    const user = userEvent.setup();
    render(<CountersignPanel {...props} canSign />);
    await user.click(screen.getByRole("checkbox", { name: CONSENT }));
    await user.click(screen.getByRole("button", { name: "Countersign proposal" }));
    expect(toast.error).toHaveBeenCalledWith("This isn't the version the client signed.");
  });

  it("tells members an owner or admin has to sign", () => {
    render(<CountersignPanel {...props} canSign={false} />);
    expect(screen.queryByRole("button", { name: "Countersign proposal" })).not.toBeInTheDocument();
    expect(screen.getByText(/owner or admin/)).toBeInTheDocument();
  });
});
