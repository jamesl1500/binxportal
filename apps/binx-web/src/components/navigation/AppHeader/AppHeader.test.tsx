/**
 * AppHeader Test
 *
 * This module tests AppHeader's interactive dropdowns end-to-end (open,
 * render items, click through). These use Base UI's Menu primitives, which
 * only mount their popup content once opened — so a render-only test isn't
 * enough to catch a wiring mistake there (e.g. Menu.GroupLabel used outside
 * Menu.Group throws at render time, but only once the menu actually opens).
 *
 * @module apps/binx-web/src/components/navigation/AppHeader/AppHeader.test.tsx
 * @author Binx.io
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/actions", () => ({
  logoutAction: vi.fn(async () => undefined),
  switchAgencyAction: vi.fn(async () => ({})),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ refresh: vi.fn() }),
}));

const mockedOpenTour = vi.fn();
vi.mock("@/components/tutorial/TutorialProvider/TutorialProvider", () => ({
  useTutorial: () => ({ openTour: mockedOpenTour }),
}));

import { logoutAction } from "@/app/(app)/actions";
import type { CurrentUser } from "@/lib/auth";
import type { AgencyRead } from "@/lib/agencies";

import AppHeader from "./AppHeader";

const mockedLogoutAction = vi.mocked(logoutAction);

const testUser: CurrentUser = {
  id: "11111111-1111-1111-1111-111111111111",
  user_name: "janedoe",
  email: "jane@example.com",
  full_name: "Jane Doe",
  summary: null,
  role: "user",
  is_active: true,
  is_verified: true,
  phone_number: null,
  job_title: null,
};

const testAgencies: AgencyRead[] = [
  { id: "aaaaaaaa-1111-1111-1111-111111111111", name: "Acme Agency", slug: "acme-agency", role: "owner", has_logo: false },
  { id: "bbbbbbbb-2222-2222-2222-222222222222", name: "Widgets Co", slug: "widgets-co", role: "member", has_logo: false },
];

beforeEach(() => {
  vi.clearAllMocks();
});

// The primary nav (links + Manage trigger) is only shown from the `md`
// breakpoint up — jsdom doesn't evaluate `@media (min-width: ...)` against a
// real viewport, so it always renders as its base (hidden) state here. That's
// a jsdom limitation, not a bug: pass `hidden: true` to query past it, since
// the elements are genuinely present and functional, just responsively
// hidden below a width no real browser in this test ever has.
const NAV_QUERY = { hidden: true } as const;

describe("AppHeader", () => {
  it("renders the primary nav links", () => {
    render(<AppHeader user={testUser} agencies={testAgencies} currentAgency={testAgencies[0]} />);

    expect(screen.getByRole("link", { name: "Dashboard", ...NAV_QUERY })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Clients", ...NAV_QUERY })).toHaveAttribute("href", "/clients");
    expect(screen.getByRole("link", { name: "Projects", ...NAV_QUERY })).toHaveAttribute("href", "/projects");
  });

  it("shows the current agency in the org switcher", () => {
    render(<AppHeader user={testUser} agencies={testAgencies} currentAgency={testAgencies[1]} />);

    expect(screen.getByRole("button", { name: "Switch agency" })).toHaveTextContent("Widgets Co");
  });

  it("opens the Manage dropdown and shows its links", async () => {
    const user = userEvent.setup();
    render(<AppHeader user={testUser} agencies={testAgencies} currentAgency={testAgencies[0]} />);

    await user.click(screen.getByRole("button", { name: /manage/i, ...NAV_QUERY }));

    // The popup itself is portaled to document.body, outside the
    // responsively-hidden <nav>, so no hidden:true needed here. Menu.LinkItem
    // renders an <a> but exposes role="menuitem" (correct per the ARIA menu
    // pattern), not "link".
    expect(await screen.findByRole("menuitem", { name: "Team" })).toHaveAttribute("href", "/team");
  });

  // Regression test for: "Base UI: MenuGroupContext is missing. Menu group
  // parts must be used within <Menu.Group> or <Menu.RadioGroup>" — thrown
  // when Menu.GroupLabel is rendered without a Menu.Group ancestor. Menu
  // popups only mount their content once opened, so a render-only test can't
  // catch this class of bug — the menu has to actually be opened.
  it("opens the account dropdown and shows profile, settings, and sign out", async () => {
    const user = userEvent.setup();
    render(<AppHeader user={testUser} agencies={testAgencies} currentAgency={testAgencies[0]} />);

    await user.click(screen.getByRole("button", { name: `${testUser.full_name} account menu` }));

    expect(await screen.findByText(testUser.email)).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("menuitem", { name: "Account settings" })).toHaveAttribute("href", "/account");
    expect(screen.getByRole("menuitem", { name: "Agency settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("calls logoutAction when sign out is clicked", async () => {
    const user = userEvent.setup();
    render(<AppHeader user={testUser} agencies={testAgencies} currentAgency={testAgencies[0]} />);

    await user.click(screen.getByRole("button", { name: `${testUser.full_name} account menu` }));
    await user.click(await screen.findByRole("menuitem", { name: /sign out/i }));

    expect(mockedLogoutAction).toHaveBeenCalledOnce();
  });

  it("opens the guided tour from the help launcher", async () => {
    const user = userEvent.setup();
    render(<AppHeader user={testUser} agencies={testAgencies} currentAgency={testAgencies[0]} />);

    await user.click(screen.getByRole("button", { name: "Open the guided tour" }));

    expect(mockedOpenTour).toHaveBeenCalledOnce();
  });
});
