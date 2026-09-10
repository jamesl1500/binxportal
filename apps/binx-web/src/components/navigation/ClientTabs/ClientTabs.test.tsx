import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockedPathname = vi.fn(() => "/clients/client-1");
vi.mock("next/navigation", () => ({
  usePathname: () => mockedPathname(),
}));

import ClientTabs from "./ClientTabs";

describe("ClientTabs", () => {
  it("renders every client sub-tab with the right hrefs", () => {
    render(<ClientTabs clientId="client-1" />);

    const expected: [string, string][] = [
      ["Dashboard", "/clients/client-1"],
      ["Projects", "/clients/client-1/projects"],
      ["Invoices", "/clients/client-1/invoices"],
      ["Settings", "/clients/client-1/settings"],
    ];
    for (const [label, href] of expected) {
      expect(screen.getByRole("link", { name: new RegExp(`^${label}`) })).toHaveAttribute("href", href);
    }
  });

  it("does not render a Messages tab", () => {
    render(<ClientTabs clientId="client-1" />);
    expect(screen.queryByRole("link", { name: /messages/i })).not.toBeInTheDocument();
  });

  it("marks the tab matching the current path active", () => {
    mockedPathname.mockReturnValue("/clients/client-1/invoices");
    render(<ClientTabs clientId="client-1" />);

    expect(screen.getByRole("link", { name: "Invoices" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("data-active", "false");
  });
});
