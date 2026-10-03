import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/clients/actions", () => ({
  setClientActiveAction: vi.fn(),
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { setClientActiveAction } from "@/app/(app)/clients/actions";

import ArchiveClientButton from "./ArchiveClientButton";

const mockedSetActive = vi.mocked(setClientActiveAction);

const agencyId = "aaaaaaaa-1111-1111-1111-111111111111";
const activeClient = { id: "cccccccc-3333-3333-3333-333333333333", name: "Acme Co", is_active: true };
const archivedClient = { ...activeClient, is_active: false };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ArchiveClientButton", () => {
  it("shows Archive for an active client and Restore for an archived one", () => {
    const { rerender } = render(<ArchiveClientButton agencyId={agencyId} client={activeClient} />);
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();

    rerender(<ArchiveClientButton agencyId={agencyId} client={archivedClient} />);
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("asks for confirmation before archiving, and does nothing if declined", async () => {
    const user = userEvent.setup();
    render(<ArchiveClientButton agencyId={agencyId} client={activeClient} />);

    await user.click(screen.getByRole("button", { name: "Archive" }));

    expect(await screen.findByRole("alertdialog", { name: "Archive Acme Co?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockedSetActive).not.toHaveBeenCalled();
  });

  it("archives once confirmed and refreshes the route", async () => {
    mockedSetActive.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<ArchiveClientButton agencyId={agencyId} client={activeClient} />);

    await user.click(screen.getByRole("button", { name: "Archive" }));
    await user.click(await screen.findByRole("button", { name: "Archive client" }));

    await waitFor(() => expect(mockedSetActive).toHaveBeenCalledWith(agencyId, activeClient.id, false));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
  });

  it("restores without asking for confirmation", async () => {
    mockedSetActive.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<ArchiveClientButton agencyId={agencyId} client={archivedClient} />);

    await user.click(screen.getByRole("button", { name: "Restore" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() => expect(mockedSetActive).toHaveBeenCalledWith(agencyId, archivedClient.id, true));
  });

  it("shows the server error on failure", async () => {
    mockedSetActive.mockResolvedValueOnce({ error: "Unable to update client status" });
    const user = userEvent.setup();
    render(<ArchiveClientButton agencyId={agencyId} client={activeClient} />);

    await user.click(screen.getByRole("button", { name: "Archive" }));
    await user.click(await screen.findByRole("button", { name: "Archive client" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to update client status");
  });
});
