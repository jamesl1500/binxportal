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
 * @author Binx Portal
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/actions", () => ({
  logoutAction: vi.fn(async () => undefined),
  switchAgencyAction: vi.fn(async () => ({})),
}));

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
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
  {
    id: "aaaaaaaa-1111-1111-1111-111111111111",
    name: "Acme Agency",
    slug: "acme-agency",
    role: "owner",
    has_logo: false,
  },
  {
    id: "bbbbbbbb-2222-2222-2222-222222222222",
    name: "Widgets Co",
    slug: "widgets-co",
    role: "member",
    has_logo: false,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  nav.pathname = "/dashboard";
});

// The primary nav (links + Manage trigger) is only shown from the `md`
// breakpoint up — jsdom doesn't evaluate `@media (min-width: ...)` against a
// real viewport, so it always renders as its base (hidden) state here. That's
// a jsdom limitation, not a bug: pass `hidden: true` to query past it, since
// the elements are genuinely present and functional, just responsively
// hidden below a width no real browser in this test ever has.
const NAV_QUERY = { hidden: true } as const;

describe("AppHeader", () => {
  const renderHeader = () =>
    render(
      <AppHeader
        user={testUser}
        agencies={testAgencies}
        currentAgency={testAgencies[0]}
      />,
    );
  const pill = (container: HTMLElement) =>
    container.querySelector('nav[aria-label="Primary"] > span[aria-hidden="true"]');

  it("marks only the current page's link as active, with the pill resting on it", () => {
    const { container } = renderHeader();
    const dashboard = screen.getByRole("link", { name: "Dashboard", ...NAV_QUERY });
    const clients = screen.getByRole("link", { name: "Clients", ...NAV_QUERY });
    expect(dashboard).toHaveAttribute("data-active", "true");
    expect(dashboard).toHaveAttribute("aria-current", "page");
    expect(clients).toHaveAttribute("data-active", "false");
    expect(clients).not.toHaveAttribute("aria-current");
    expect(pill(container)).toHaveAttribute("data-visible", "true");
  });

  it("rests on Manage for a page that lives in that menu", () => {
    nav.pathname = "/invoices/inv-1";
    const { container } = renderHeader();
    expect(screen.getByRole("button", { name: /manage/i, ...NAV_QUERY })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(
      screen.getByRole("link", { name: "Dashboard", ...NAV_QUERY }),
    ).toHaveAttribute("data-active", "false");
    expect(pill(container)).toHaveAttribute("data-visible", "true");
  });

  it("hides the pill when nothing in the bar matches, and shows it on hover", async () => {
    nav.pathname = "/profile";
    const { container } = renderHeader();
    expect(pill(container)).toHaveAttribute("data-visible", "false");

    const user = userEvent.setup();
    await user.hover(screen.getByRole("link", { name: "Leads", ...NAV_QUERY }));
    expect(pill(container)).toHaveAttribute("data-visible", "true");

    await user.unhover(container.querySelector('nav[aria-label="Primary"]')!);
    expect(pill(container)).toHaveAttribute("data-visible", "false");
  });

  it("renders the primary nav links", () => {
    render(
      <AppHeader
        user={testUser}
        agencies={testAgencies}
        currentAgency={testAgencies[0]}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Dashboard", ...NAV_QUERY }),
    ).toHaveAttribute("href", "/dashboard");
    expect(
      screen.getByRole("link", { name: "Clients", ...NAV_QUERY }),
    ).toHaveAttribute("href", "/clients");
    expect(
      screen.getByRole("link", { name: "Projects", ...NAV_QUERY }),
    ).toHaveAttribute("href", "/projects");
  });

  it("shows the current agency in the org switcher", () => {
    render(
      <AppHeader
        user={testUser}
        agencies={testAgencies}
        currentAgency={testAgencies[1]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Switch agency" }),
    ).toHaveTextContent("Widgets Co");
  });

  it("opens the Manage dropdown and shows its links", async () => {
    const user = userEvent.setup();
    render(
      <AppHeader
        user={testUser}
        agencies={testAgencies}
        currentAgency={testAgencies[0]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /manage/i, ...NAV_QUERY }),
    );

    // The popup itself is portaled to document.body, outside the
    // responsively-hidden <nav>, so no hidden:true needed here. Menu.LinkItem
    // renders an <a> but exposes role="menuitem" (correct per the ARIA menu
    // pattern), not "link".
    expect(
      await screen.findByRole("menuitem", { name: "Team" }),
    ).toHaveAttribute("href", "/team");
    expect(screen.getByRole("menuitem", { name: "Proposals" })).toHaveAttribute(
      "href",
      "/proposals",
    );
  });

  it("shows each Manage destination with a hint and marks the current one", async () => {
    nav.pathname = "/invoices";
    const user = userEvent.setup();
    render(
      <AppHeader
        user={testUser}
        agencies={testAgencies}
        currentAgency={testAgencies[0]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /manage/i, ...NAV_QUERY }));

    // The hint is visible but kept out of the accessible name.
    const invoices = await screen.findByRole("menuitem", { name: "Invoices" });
    expect(invoices).toHaveTextContent("Bill clients, track payments");
    expect(invoices).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("menuitem", { name: "Team" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("menuitem", { name: "Import & export" })).toHaveAttribute("href", "/data");
  });

  it("heads the account menu with who's signed in", async () => {
    const user = userEvent.setup();
    render(
      <AppHeader
        user={testUser}
        agencies={testAgencies}
        currentAgency={testAgencies[0]}
      />,
    );
    await user.click(screen.getByRole("button", { name: `${testUser.full_name} account menu` }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText(testUser.full_name)).toBeInTheDocument();
    expect(within(menu).getByText(testUser.email)).toBeInTheDocument();
  });

  // Regression test for: "Base UI: MenuGroupContext is missing. Menu group
  // parts must be used within <Menu.Group> or <Menu.RadioGroup>" — thrown
  // when Menu.GroupLabel is rendered without a Menu.Group ancestor. Menu
  // popups only mount their content once opened, so a render-only test can't
  // catch this class of bug — the menu has to actually be opened.
  it("opens the account dropdown and shows profile, settings, and sign out", async () => {
    const user = userEvent.setup();
    render(
      <AppHeader
        user={testUser}
        agencies={testAgencies}
        currentAgency={testAgencies[0]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: `${testUser.full_name} account menu`,
      }),
    );

    expect(await screen.findByText(testUser.email)).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(
      screen.getByRole("menuitem", { name: "Account settings" }),
    ).toHaveAttribute("href", "/account");
    expect(
      screen.getByRole("menuitem", { name: "Agency settings" }),
    ).toHaveAttribute("href", "/settings");
    expect(
      screen.getByRole("menuitem", { name: /sign out/i }),
    ).toBeInTheDocument();
  });

  it("calls logoutAction when sign out is clicked", async () => {
    const user = userEvent.setup();
    render(
      <AppHeader
        user={testUser}
        agencies={testAgencies}
        currentAgency={testAgencies[0]}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: `${testUser.full_name} account menu`,
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /sign out/i }),
    );

    expect(mockedLogoutAction).toHaveBeenCalledOnce();
  });

  it("opens the guided tour from the help launcher", async () => {
    const user = userEvent.setup();
    render(
      <AppHeader
        user={testUser}
        agencies={testAgencies}
        currentAgency={testAgencies[0]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Open the guided tour" }),
    );

    expect(mockedOpenTour).toHaveBeenCalledOnce();
  });

  it("opens the mobile nav disclosure with every destination, marks the active page, and closes on selection", async () => {
    const user = userEvent.setup();
    render(
      <AppHeader
        user={testUser}
        agencies={testAgencies}
        currentAgency={testAgencies[0]}
        unreadMessages={3}
      />,
    );

    const toggle = screen.getByRole("button", { name: "Open navigation" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(
      screen.getByRole("button", { name: "Close navigation" }),
    ).toHaveAttribute("aria-expanded", "true");

    const mobileNav = screen.getByRole("navigation", { name: "Primary" });
    expect(
      within(mobileNav).getByRole("link", { name: /Dashboard/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(mobileNav).getByRole("link", { name: "Leads" }),
    ).toHaveAttribute("href", "/leads");
    expect(
      within(mobileNav).getByRole("link", { name: "Team" }),
    ).toHaveAttribute("href", "/team");
    expect(
      within(mobileNav).getByRole("link", { name: "Proposals" }),
    ).toHaveAttribute("href", "/proposals");
    expect(
      within(mobileNav).getByRole("link", { name: /Messages/ }),
    ).toHaveTextContent("3");

    await user.click(within(mobileNav).getByRole("link", { name: "Leads" }));

    expect(
      screen.getByRole("button", { name: "Open navigation" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("navigation", { name: "Primary" }),
    ).not.toBeInTheDocument();
  });
});
