/**
 * OrgSwitcher Test
 *
 * Like AppHeader's dropdown tests, this exercises the Menu.RadioGroup end-to-
 * end (open, render items, select) rather than just rendering — Base UI's
 * Menu popups only mount their content once opened, so a render-only test
 * can't catch a wiring mistake in the popup (e.g. a group-context bug that
 * only throws once the menu is actually opened).
 *
 * @module apps/binx-web/src/components/navigation/OrgSwitcher/OrgSwitcher.test.tsx
 * @author Binx.io
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/actions", () => ({
  switchAgencyAction: vi.fn(),
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { switchAgencyAction } from "@/app/(app)/actions";
import type { AgencyRead } from "@/lib/agencies";

import OrgSwitcher from "./OrgSwitcher";

const mockedSwitchAgencyAction = vi.mocked(switchAgencyAction);

const agencies: AgencyRead[] = [
  { id: "aaaaaaaa-1111-1111-1111-111111111111", name: "Acme Agency", slug: "acme-agency", role: "owner", has_logo: false },
  { id: "bbbbbbbb-2222-2222-2222-222222222222", name: "Widgets Co", slug: "widgets-co", role: "member", has_logo: false },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OrgSwitcher", () => {
  it("shows the current agency's name on the trigger", () => {
    render(<OrgSwitcher agencies={agencies} currentAgency={agencies[0]} />);

    expect(screen.getByRole("button", { name: "Switch agency" })).toHaveTextContent("Acme Agency");
  });

  it("lists every agency and marks the current one as checked", async () => {
    const user = userEvent.setup();
    render(<OrgSwitcher agencies={agencies} currentAgency={agencies[0]} />);

    await user.click(screen.getByRole("button", { name: "Switch agency" }));

    expect(await screen.findByRole("menuitemradio", { name: "Acme Agency" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Widgets Co" })).toHaveAttribute("aria-checked", "false");
  });

  it("switches to the selected agency and refreshes the route", async () => {
    mockedSwitchAgencyAction.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<OrgSwitcher agencies={agencies} currentAgency={agencies[0]} />);

    await user.click(screen.getByRole("button", { name: "Switch agency" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Widgets Co" }));

    expect(mockedSwitchAgencyAction).toHaveBeenCalledWith(agencies[1].id);
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("does nothing when the already-current agency is selected", async () => {
    const user = userEvent.setup();
    render(<OrgSwitcher agencies={agencies} currentAgency={agencies[0]} />);

    await user.click(screen.getByRole("button", { name: "Switch agency" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Acme Agency" }));

    expect(mockedSwitchAgencyAction).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("shows an error and does not refresh if the switch is rejected", async () => {
    mockedSwitchAgencyAction.mockResolvedValueOnce({ error: "You're not a member of that organization" });
    const user = userEvent.setup();
    render(<OrgSwitcher agencies={agencies} currentAgency={agencies[0]} />);

    await user.click(screen.getByRole("button", { name: "Switch agency" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Widgets Co" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You're not a member of that organization");
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("links Create agency to the dedicated /agencies/new page", async () => {
    const user = userEvent.setup();
    render(<OrgSwitcher agencies={agencies} currentAgency={agencies[0]} />);

    await user.click(screen.getByRole("button", { name: "Switch agency" }));

    expect(await screen.findByRole("menuitem", { name: "Create agency" })).toHaveAttribute(
      "href",
      "/agencies/new",
    );
  });
});
