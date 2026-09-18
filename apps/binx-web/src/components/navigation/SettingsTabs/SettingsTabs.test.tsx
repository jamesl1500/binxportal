import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedPathname = vi.fn(() => "/settings");
vi.mock("next/navigation", () => ({ usePathname: () => mockedPathname() }));

import SettingsTabs from "./SettingsTabs";

beforeEach(() => mockedPathname.mockReturnValue("/settings"));

describe("SettingsTabs", () => {
  it("renders all seven tabs with their hrefs", () => {
    render(<SettingsTabs />);
    for (const [label, href] of [
      ["Profile", "/settings"],
      ["Policies", "/settings/policies"],
      ["Invoicing", "/settings/invoicing"],
      ["Meetings", "/settings/meetings"],
      ["Plan", "/settings/plan"],
      ["AI", "/settings/ai"],
      ["General", "/settings/general"],
    ] as const) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
  });

  it("marks the active tab from the pathname", () => {
    mockedPathname.mockReturnValue("/settings/plan");
    render(<SettingsTabs />);
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("data-active", "false");
  });
});
