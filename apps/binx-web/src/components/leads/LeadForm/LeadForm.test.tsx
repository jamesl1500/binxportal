import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/leads/actions", () => ({ createLeadAction: vi.fn(), updateLeadAction: vi.fn() }));

import { createLeadAction, updateLeadAction } from "@/app/(app)/leads/actions";
import LeadForm from "./LeadForm";

const create = vi.mocked(createLeadAction);
const update = vi.mocked(updateLeadAction);

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({ lead: { id: "l9", name: "Acme" } } as never);
  update.mockResolvedValue({ lead: { id: "l1", name: "Acme" } } as never);
});

describe("LeadForm", () => {
  it("requires a name", async () => {
    render(<LeadForm agencyId="a1" />);
    await userEvent.click(screen.getByRole("button", { name: "Add lead" }));
    expect(await screen.findByText("A name is required")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("validates the email and estimated value", async () => {
    render(<LeadForm agencyId="a1" />);
    await userEvent.type(screen.getByLabelText("Lead / company name"), "Acme");
    await userEvent.type(screen.getByLabelText("Contact email"), "not-an-email");
    await userEvent.type(screen.getByLabelText("Estimated value"), "abc");
    await userEvent.click(screen.getByRole("button", { name: "Add lead" }));
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Enter a number")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a lead with a mapped payload and fires onSuccess", async () => {
    const onSuccess = vi.fn();
    render(<LeadForm agencyId="a1" onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText("Lead / company name"), "Acme Corp");
    await userEvent.type(screen.getByLabelText("Estimated value"), "5000");
    await userEvent.click(screen.getByRole("button", { name: "Add lead" }));
    expect(create).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ name: "Acme Corp", estimatedValueCents: 500000, contactEmail: null }),
    );
    expect(onSuccess).toHaveBeenCalledWith({ id: "l9", name: "Acme" });
  });

  it("in edit mode pre-fills from the lead and calls updateLeadAction", async () => {
    render(
      <LeadForm
        agencyId="a1"
        lead={{ id: "l1", name: "Old Name", source: "referral", estimated_value_cents: 12000 } as never}
      />,
    );
    const nameInput = screen.getByLabelText("Lead / company name") as HTMLInputElement;
    expect(nameInput.value).toBe("Old Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "New Name");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(update).toHaveBeenCalledWith("a1", "l1", expect.objectContaining({ name: "New Name" }));
    expect(await screen.findByText("Lead updated.")).toBeInTheDocument();
  });

  it("surfaces a server error", async () => {
    create.mockResolvedValueOnce({ error: "Lead limit reached" } as never);
    render(<LeadForm agencyId="a1" />);
    await userEvent.type(screen.getByLabelText("Lead / company name"), "Acme");
    await userEvent.click(screen.getByRole("button", { name: "Add lead" }));
    expect(await screen.findByText("Lead limit reached")).toBeInTheDocument();
  });
});
