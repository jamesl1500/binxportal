import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/settings/actions", () => ({
  restoreAgencyAction: vi.fn(),
}));

import { restoreAgencyAction } from "@/app/(app)/settings/actions";

import RestoreAgencyButton from "./RestoreAgencyButton";

const mockedRestore = vi.mocked(restoreAgencyAction);

describe("RestoreAgencyButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("restores the agency it was given", async () => {
    mockedRestore.mockReturnValueOnce(new Promise(() => {}));
    render(<RestoreAgencyButton agencyId="a1" agencyName="Acme" />);

    await userEvent.click(screen.getByRole("button", { name: "Restore Acme" }));

    expect(mockedRestore).toHaveBeenCalledWith("a1");
  });

  it("shows why a restore failed", async () => {
    mockedRestore.mockResolvedValueOnce({ error: "You're at your plan's limit" });
    render(<RestoreAgencyButton agencyId="a1" agencyName="Acme" />);

    await userEvent.click(screen.getByRole("button", { name: "Restore Acme" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You're at your plan's limit");
  });
});
