import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedPathname = vi.fn(() => "/dashboard");
vi.mock("next/navigation", () => ({ usePathname: () => mockedPathname() }));

import DashboardTabs from "./DashboardTabs";

beforeEach(() => {
  mockedPathname.mockReturnValue("/dashboard");
});

describe("DashboardTabs", () => {
  it("renders the three tabs with the right hrefs", () => {
    render(<DashboardTabs />);
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: /My work/ })).toHaveAttribute("href", "/dashboard/my-work");
    expect(screen.getByRole("link", { name: "Pulse" })).toHaveAttribute("href", "/dashboard/pulse");
  });

  it("marks the active tab", () => {
    mockedPathname.mockReturnValue("/dashboard/pulse");
    render(<DashboardTabs />);
    expect(screen.getByRole("link", { name: "Pulse" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("data-active", "false");
  });

  it("badges My work with the open task count", () => {
    render(<DashboardTabs myWorkCount={5} />);
    expect(screen.getByRole("link", { name: /My work/ })).toHaveTextContent("5");
  });

  it("hides the badge at zero", () => {
    render(<DashboardTabs myWorkCount={0} />);
    expect(screen.getByRole("link", { name: /My work/ })).not.toHaveTextContent("0");
  });
});
