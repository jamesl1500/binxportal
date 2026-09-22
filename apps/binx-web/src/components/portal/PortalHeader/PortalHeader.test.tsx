import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedPathname = vi.fn(() => "/portal");
vi.mock("next/navigation", () => ({ usePathname: () => mockedPathname() }));
vi.mock("@/app/(app)/actions", () => ({ logoutAction: vi.fn() }));

import { logoutAction } from "@/app/(app)/actions";
import PortalHeader from "./PortalHeader";

const mockedLogout = vi.mocked(logoutAction);

beforeEach(() => {
  mockedPathname.mockReturnValue("/portal");
});

describe("PortalHeader", () => {
  it("renders the agency, client and the portal tabs", () => {
    render(
      <PortalHeader
        agencyName="Pixel Forge"
        clientName="Northwind"
        contactName="Casey"
        hasLogo={false}
        logoVersion={null}
      />,
    );

    expect(screen.getByText("Pixel Forge")).toBeInTheDocument();
    expect(screen.getByText("Northwind portal")).toBeInTheDocument();
    // hidden: true — jsdom never satisfies the header's `min-width: 900px`
    // desktop-nav media query, so Testing Library would otherwise treat
    // these CSS-hidden-in-jsdom (but really-there) links as absent.
    for (const label of ["Overview", "Projects", "Invoices", "Proposals", "Meetings", "Messages"]) {
      expect(screen.getByRole("link", { name: label, hidden: true })).toBeInTheDocument();
    }
    expect(screen.getByText("Casey")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("marks the active tab, matching sub-paths for the non-root tabs", () => {
    mockedPathname.mockReturnValue("/portal/invoices/abc");
    render(
      <PortalHeader
        agencyName="Pixel Forge"
        clientName="Northwind"
        contactName="Casey"
        hasLogo={false}
        logoVersion={null}
      />,
    );

    expect(screen.getByRole("link", { name: "Invoices", hidden: true })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Overview", hidden: true })).toHaveAttribute("data-active", "false");
  });

  it("renders the logo, cache-busted by version, when one is set", () => {
    render(
      <PortalHeader
        agencyName="Pixel Forge"
        clientName="Northwind"
        contactName="Casey"
        hasLogo
        logoVersion="abc123"
      />,
    );

    const logo = screen.getByRole("img", { name: /Pixel Forge logo/i });
    expect(logo).toHaveAttribute("src", "/api/portal/logo?v=abc123");
  });

  it("signs out when the Sign out button is clicked", async () => {
    mockedLogout.mockResolvedValueOnce(undefined as never);
    const user = userEvent.setup();
    render(
      <PortalHeader
        agencyName="Pixel Forge"
        clientName="Northwind"
        contactName="Casey"
        hasLogo={false}
        logoVersion={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sign out", hidden: true }));
    expect(mockedLogout).toHaveBeenCalled();
  });

  describe("mobile menu", () => {
    it("is closed by default — no Close-menu button, and the mobile panel isn't in the DOM", () => {
      render(
        <PortalHeader
          agencyName="Pixel Forge"
          clientName="Northwind"
          contactName="Casey"
          hasLogo={false}
          logoVersion={null}
        />,
      );

      // These two are purely React-state-driven (the toggle's aria-label,
      // and whether the mobile panel renders at all), so they don't need
      // `hidden: true` the way the always-present desktop nav queries do.
      expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Close menu" })).not.toBeInTheDocument();
    });

    it("opens to reveal the mobile panel's tabs and account info", async () => {
      const user = userEvent.setup();
      render(
        <PortalHeader
          agencyName="Pixel Forge"
          clientName="Northwind"
          contactName="Casey"
          hasLogo={false}
          logoVersion={null}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Open menu" }));

      expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();
      // Two of each now — the (always-present-but-CSS-hidden-in-jsdom)
      // desktop nav's plus the mobile panel's, so `hidden: true` again.
      expect(screen.getAllByRole("link", { name: "Invoices", hidden: true })).toHaveLength(2);
      expect(screen.getAllByRole("button", { name: "Sign out", hidden: true })).toHaveLength(2);
    });

    it("closes when a mobile tab link is clicked", async () => {
      const user = userEvent.setup();
      render(
        <PortalHeader
          agencyName="Pixel Forge"
          clientName="Northwind"
          contactName="Casey"
          hasLogo={false}
          logoVersion={null}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Open menu" }));
      const invoiceLinks = screen.getAllByRole("link", { name: "Invoices", hidden: true });
      await user.click(invoiceLinks[invoiceLinks.length - 1]); // the mobile panel's, rendered last

      expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Close menu" })).not.toBeInTheDocument();
    });

    it("signs out from the mobile panel's Sign out button too", async () => {
      mockedLogout.mockResolvedValueOnce(undefined as never);
      const user = userEvent.setup();
      render(
        <PortalHeader
          agencyName="Pixel Forge"
          clientName="Northwind"
          contactName="Casey"
          hasLogo={false}
          logoVersion={null}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Open menu" }));
      const signOutButtons = screen.getAllByRole("button", { name: "Sign out", hidden: true });
      await user.click(signOutButtons[signOutButtons.length - 1]);

      expect(mockedLogout).toHaveBeenCalled();
    });
  });
});
