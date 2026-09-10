import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/settings/actions", () => ({
  updateAgencyAction: vi.fn(),
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { updateAgencyAction } from "@/app/(app)/settings/actions";

import AgencyGeneralForm from "./AgencyGeneralForm";

const mockedUpdateAgencyAction = vi.mocked(updateAgencyAction);

const agencyId = "aaaaaaaa-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgencyGeneralForm", () => {
  it("prefills the name and shows the slug read-only", () => {
    render(<AgencyGeneralForm agencyId={agencyId} name="Acme Agency" slug="acme-agency" />);

    expect(screen.getByLabelText("Agency name")).toHaveValue("Acme Agency");
    const slugInput = screen.getByLabelText("URL slug");
    expect(slugInput).toHaveValue("acme-agency");
    expect(slugInput).toBeDisabled();
  });

  it("shows a validation error instead of submitting when the name is cleared", async () => {
    const user = userEvent.setup();
    render(<AgencyGeneralForm agencyId={agencyId} name="Acme Agency" slug="acme-agency" />);

    await user.clear(screen.getByLabelText("Agency name"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(mockedUpdateAgencyAction).not.toHaveBeenCalled();
  });

  it("submits the trimmed name, shows a success message, and refreshes the route", async () => {
    mockedUpdateAgencyAction.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<AgencyGeneralForm agencyId={agencyId} name="Acme Agency" slug="acme-agency" />);

    await user.clear(screen.getByLabelText("Agency name"));
    await user.type(screen.getByLabelText("Agency name"), "  Acme Studio  ");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Agency updated.")).toBeInTheDocument();
    expect(mockedUpdateAgencyAction).toHaveBeenCalledWith(agencyId, "Acme Studio");
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("shows the server error on failure", async () => {
    mockedUpdateAgencyAction.mockResolvedValueOnce({ error: "Insufficient permissions for this agency" });
    const user = userEvent.setup();
    render(<AgencyGeneralForm agencyId={agencyId} name="Acme Agency" slug="acme-agency" />);

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Insufficient permissions for this agency")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
