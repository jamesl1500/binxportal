import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/clients/actions", () => ({
  deleteClientAction: vi.fn(),
}));

import { deleteClientAction } from "@/app/(app)/clients/actions";

import DeleteClientForm from "./DeleteClientForm";

const mockedDeleteClientAction = vi.mocked(deleteClientAction);

const agencyId = "aaaaaaaa-1111-1111-1111-111111111111";
const clientId = "cccccccc-3333-3333-3333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DeleteClientForm", () => {
  it("requires typing the exact client name before submitting", async () => {
    const user = userEvent.setup();
    render(<DeleteClientForm agencyId={agencyId} clientId={clientId} clientName="Acme Co" />);

    await user.type(screen.getByLabelText(/type/i), "acme co");
    await user.click(screen.getByRole("button", { name: /delete this client/i }));

    expect(await screen.findByText('Type "Acme Co" to confirm')).toBeInTheDocument();
    expect(mockedDeleteClientAction).not.toHaveBeenCalled();
  });

  it("calls deleteClientAction with the agency and client ids once confirmed", async () => {
    // On success, deleteClientAction redirects and this promise never
    // resolves within the component's lifetime — a pending mock is enough
    // to prove the call happened with the right arguments.
    mockedDeleteClientAction.mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    render(<DeleteClientForm agencyId={agencyId} clientId={clientId} clientName="Acme Co" />);

    await user.type(screen.getByLabelText(/type/i), "Acme Co");
    await user.click(screen.getByRole("button", { name: /delete this client/i }));

    expect(mockedDeleteClientAction).toHaveBeenCalledWith(agencyId, clientId);
  });

  it("shows the server error on failure", async () => {
    mockedDeleteClientAction.mockResolvedValueOnce({ error: "Insufficient permissions for this agency" });
    const user = userEvent.setup();
    render(<DeleteClientForm agencyId={agencyId} clientId={clientId} clientName="Acme Co" />);

    await user.type(screen.getByLabelText(/type/i), "Acme Co");
    await user.click(screen.getByRole("button", { name: /delete this client/i }));

    expect(await screen.findByText("Insufficient permissions for this agency")).toBeInTheDocument();
  });
});
