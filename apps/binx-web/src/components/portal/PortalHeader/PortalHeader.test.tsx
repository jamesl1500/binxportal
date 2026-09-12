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
  it("renders the agency, client and the four portal tabs", () => {
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
    for (const label of ["Overview", "Projects", "Invoices", "Messages"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
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

    expect(screen.getByRole("link", { name: "Invoices" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("data-active", "false");
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

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mockedLogout).toHaveBeenCalled();
  });
});
