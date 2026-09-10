import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/settings/actions", () => ({
  deleteAgencyAction: vi.fn(),
}));

import { deleteAgencyAction } from "@/app/(app)/settings/actions";

import DeleteAgencyForm from "./DeleteAgencyForm";

const mockedDeleteAgencyAction = vi.mocked(deleteAgencyAction);

const agencyId = "aaaaaaaa-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DeleteAgencyForm", () => {
  it("requires typing the exact agency name before submitting", async () => {
    const user = userEvent.setup();
    render(<DeleteAgencyForm agencyId={agencyId} agencyName="Acme Agency" />);

    await user.type(screen.getByLabelText(/type/i), "acme agency");
    await user.click(screen.getByRole("button", { name: /delete this agency/i }));

    expect(await screen.findByText('Type "Acme Agency" to confirm')).toBeInTheDocument();
    expect(mockedDeleteAgencyAction).not.toHaveBeenCalled();
  });

  it("calls deleteAgencyAction with the agency id once confirmed", async () => {
    // On success, deleteAgencyAction redirects and this promise never
    // resolves within the component's lifetime — a pending mock is enough
    // to prove the call happened with the right argument.
    mockedDeleteAgencyAction.mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    render(<DeleteAgencyForm agencyId={agencyId} agencyName="Acme Agency" />);

    await user.type(screen.getByLabelText(/type/i), "Acme Agency");
    await user.click(screen.getByRole("button", { name: /delete this agency/i }));

    expect(mockedDeleteAgencyAction).toHaveBeenCalledWith(agencyId);
  });

  it("shows the server error on failure", async () => {
    mockedDeleteAgencyAction.mockResolvedValueOnce({ error: "Insufficient permissions for this agency" });
    const user = userEvent.setup();
    render(<DeleteAgencyForm agencyId={agencyId} agencyName="Acme Agency" />);

    await user.type(screen.getByLabelText(/type/i), "Acme Agency");
    await user.click(screen.getByRole("button", { name: /delete this agency/i }));

    expect(await screen.findByText("Insufficient permissions for this agency")).toBeInTheDocument();
  });
});
