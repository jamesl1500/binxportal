import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedPathname = vi.fn(() => "/portal");
vi.mock("next/navigation", () => ({ usePathname: () => mockedPathname() }));
vi.mock("@/app/(app)/actions", () => ({ logoutAction: vi.fn(), updateTutorialProgressAction: vi.fn() }));

import { logoutAction } from "@/app/(app)/actions";
import PortalOnboardingProvider from "@/components/portal/PortalOnboardingProvider/PortalOnboardingProvider";
import type { PortalBadges } from "@/lib/portal-insights";
import PortalSidebar from "./PortalSidebar";

const mockedLogout = vi.mocked(logoutAction);

const NO_BADGES: PortalBadges = { messages: 0, invoices: 0, invoicesOverdue: false, proposals: 0, meetings: 0 };

function renderSidebar(overrides: Partial<React.ComponentProps<typeof PortalSidebar>> = {}) {
  return render(
    <PortalSidebar
      agencyName="Pixel Forge"
      clientName="Northwind"
      contactName="Casey Jones"
      contactDetail="Head of Marketing"
      logoSrc={null}
      badges={NO_BADGES}
      {...overrides}
    />,
  );
}

// The real stylesheet is applied under jsdom, which never matches the
// desktop media query — so the sidebar is the mobile drawer here, and a
// closed drawer is `visibility: hidden` (no accessible names). Open it first.
async function openDrawer() {
  await userEvent.setup().click(screen.getByRole("button", { name: "Open menu" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedPathname.mockReturnValue("/portal");
});

describe("PortalSidebar", () => {
  it("keeps the closed drawer out of the accessibility tree", () => {
    renderSidebar();
    expect(screen.queryByRole("navigation", { name: "Client portal" })).not.toBeInTheDocument();
  });

  it("renders the brand, every section and the signed-in contact", async () => {
    renderSidebar();
    await openDrawer();

    expect(screen.getAllByText("Pixel Forge").length).toBeGreaterThan(0);
    expect(screen.getByText("Northwind portal")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Client portal" });
    for (const label of ["Home", "Projects", "Messages", "Meetings", "Proposals", "Invoices"]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText("Casey Jones")).toBeInTheDocument();
    expect(screen.getByText("Head of Marketing")).toBeInTheDocument();
    expect(screen.getByText("CJ")).toBeInTheDocument();
  });

  it("marks the active item, matching sub-paths for everything but Home", async () => {
    mockedPathname.mockReturnValue("/portal/invoices/abc");
    renderSidebar();
    await openDrawer();

    const invoices = screen.getByRole("link", { name: "Invoices" });
    expect(invoices).toHaveAttribute("data-active", "true");
    expect(invoices).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("data-active", "false");
  });

  it("shows badges with screen-reader context, flagging overdue invoices", async () => {
    renderSidebar({ badges: { messages: 3, invoices: 2, invoicesOverdue: true, proposals: 1, meetings: 0 } });
    await openDrawer();

    expect(screen.getByRole("link", { name: "Messages, 3 unread" })).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: "Proposals, 1 awaiting your decision" })).toBeInTheDocument();
    const invoices = screen.getByRole("link", { name: "Invoices, 2 unpaid, some overdue" });
    expect(invoices.querySelector('[data-tone="alert"]')).not.toBeNull();
    // No badge at all for a zero count.
    expect(screen.getByRole("link", { name: "Meetings" })).toBeInTheDocument();
  });

  it("uses the logo when there is one, a monogram otherwise", () => {
    const { unmount } = renderSidebar();
    expect(screen.queryByRole("img", { name: /logo/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("P").length).toBeGreaterThan(0);
    unmount();

    renderSidebar({ logoSrc: "/api/portal/logo?v=abc" });
    expect(screen.getAllByRole("img", { name: "Pixel Forge logo", hidden: true })[0]).toHaveAttribute(
      "src",
      "/api/portal/logo?v=abc",
    );
  });

  it("opens and closes the mobile drawer", async () => {
    const user = userEvent.setup();
    const { container } = renderSidebar();
    const sidebar = container.querySelector("#portal-sidebar")!;

    expect(sidebar).toHaveAttribute("data-open", "false");
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(sidebar).toHaveAttribute("data-open", "true");
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(sidebar).toHaveAttribute("data-open", "false");
  });

  it("closes the drawer when the route changes", async () => {
    const user = userEvent.setup();
    const { container, rerender } = renderSidebar();
    await user.click(screen.getByRole("button", { name: "Open menu" }));

    mockedPathname.mockReturnValue("/portal/projects");
    act(() => {
      rerender(
        <PortalSidebar
          agencyName="Pixel Forge"
          clientName="Northwind"
          contactName="Casey Jones"
          contactDetail={null}
          logoSrc={null}
          badges={NO_BADGES}
        />,
      );
    });
    expect(container.querySelector("#portal-sidebar")).toHaveAttribute("data-open", "false");
  });

  it("signs out", async () => {
    mockedLogout.mockResolvedValueOnce(undefined as never);
    const user = userEvent.setup();
    renderSidebar();
    await openDrawer();

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mockedLogout).toHaveBeenCalled();
  });

  it("offers the tour only inside the onboarding provider", async () => {
    const { unmount } = renderSidebar();
    await openDrawer();
    expect(screen.queryByRole("button", { name: "Take the tour" })).not.toBeInTheDocument();
    unmount();

    render(
      <PortalOnboardingProvider initialProgress={{ tour_completed: false, dismissed_popups: ["portal-welcome"] }}>
        <PortalSidebar
          agencyName="Pixel Forge"
          clientName="Northwind"
          contactName="Casey Jones"
          contactDetail={null}
          logoSrc={null}
          badges={NO_BADGES}
        />
      </PortalOnboardingProvider>,
    );
    await openDrawer();
    expect(screen.getByRole("button", { name: "Take the tour" })).toBeInTheDocument();
  });
});
