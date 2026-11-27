import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/lead-portal/actions", () => ({ askInLeadPortalAction: vi.fn() }));

import { toast } from "sonner";

import { askInLeadPortalAction } from "@/app/lead-portal/actions";

import LeadPortalQuestionForm from "./LeadPortalQuestionForm";

const ask = vi.mocked(askInLeadPortalAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LeadPortalQuestionForm", () => {
  it("sends a question under the contact's name and clears it", async () => {
    ask.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<LeadPortalQuestionForm token="tok" defaultName="Alex Kim" />);

    expect(screen.getByRole("button", { name: "Send question" })).toBeDisabled();
    await user.type(screen.getByLabelText("Your question"), "Is hosting included?");
    await user.click(screen.getByRole("button", { name: "Send question" }));

    expect(ask).toHaveBeenCalledWith("tok", "Is hosting included?", "Alex Kim");
    expect(screen.getByLabelText("Your question")).toHaveValue("");
    expect(toast.success).toHaveBeenCalled();
  });

  it("keeps the question when sending fails", async () => {
    ask.mockResolvedValueOnce({ error: "This page isn't available" });
    const user = userEvent.setup();
    render(<LeadPortalQuestionForm token="tok" defaultName={null} />);
    await user.type(screen.getByLabelText("Your question"), "Hello?");
    await user.click(screen.getByRole("button", { name: "Send question" }));
    expect(toast.error).toHaveBeenCalledWith("This page isn't available");
    expect(screen.getByLabelText("Your question")).toHaveValue("Hello?");
  });
});
