import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedPathname = vi.fn(() => "/account");
vi.mock("next/navigation", () => ({ usePathname: () => mockedPathname() }));

import AccountTabs from "./AccountTabs";

beforeEach(() => mockedPathname.mockReturnValue("/account"));

describe("AccountTabs", () => {
  it("renders both tabs with their hrefs", () => {
    render(<AccountTabs />);
    for (const [label, href] of [
      ["Preferences", "/account"],
      ["Security", "/account/security"],
    ] as const) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
  });

  it("marks the active tab from the pathname", () => {
    mockedPathname.mockReturnValue("/account/security");
    render(<AccountTabs />);
    expect(screen.getByRole("link", { name: "Security" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Preferences" })).toHaveAttribute("data-active", "false");
  });
});
