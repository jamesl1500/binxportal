import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedPathname = vi.fn(() => "/profile");
vi.mock("next/navigation", () => ({ usePathname: () => mockedPathname() }));

import ProfileTabs from "./ProfileTabs";

beforeEach(() => mockedPathname.mockReturnValue("/profile"));

describe("ProfileTabs", () => {
  it("renders all four tabs with their hrefs", () => {
    render(<ProfileTabs />);
    for (const [label, href] of [
      ["Details", "/profile"],
      ["Skills & Experience", "/profile/qualifications"],
      ["Photos", "/profile/photos"],
      ["Appearance", "/profile/appearance"],
    ] as const) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
  });

  it("marks the active tab from the pathname", () => {
    mockedPathname.mockReturnValue("/profile/photos");
    render(<ProfileTabs />);
    expect(screen.getByRole("link", { name: "Photos" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute("data-active", "false");
  });
});
