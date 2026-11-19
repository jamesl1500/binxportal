import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedPathname = vi.fn(() => "/admin");
vi.mock("next/navigation", () => ({ usePathname: () => mockedPathname() }));

import AdminSidebar, { isActive } from "./AdminSidebar";

beforeEach(() => {
  mockedPathname.mockReturnValue("/admin");
});

describe("isActive", () => {
  it("matches the overview exactly and sections by prefix", () => {
    expect(isActive("/admin", { href: "/admin", exact: true })).toBe(true);
    expect(isActive("/admin/feedback", { href: "/admin", exact: true })).toBe(
      false,
    );
    expect(isActive("/admin/feedback/f1", { href: "/admin/feedback" })).toBe(
      true,
    );
    expect(isActive("/admin/feedbackish", { href: "/admin/feedback" })).toBe(
      false,
    );
  });
});

describe("AdminSidebar", () => {
  it("marks the overview as the current page on /admin", () => {
    render(<AdminSidebar openFeedback={3} />);
    const nav = screen.getByRole("navigation", { name: "Admin" });
    expect(screen.getByRole("link", { name: /overview/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(nav).toContainElement(
      screen.getByRole("link", { name: /feedback inbox/i }),
    );
    expect(
      screen.getByRole("link", { name: /feedback inbox/i }),
    ).not.toHaveAttribute("aria-current");
  });

  it("keeps the inbox current on a feedback detail page", () => {
    mockedPathname.mockReturnValue("/admin/feedback/f1");
    render(<AdminSidebar openFeedback={3} />);
    expect(
      screen.getByRole("link", { name: /feedback inbox/i }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /overview/i })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("badges open feedback, and hides the badge at zero", () => {
    const { rerender } = render(<AdminSidebar openFeedback={120} />);
    expect(screen.getByLabelText("120 open")).toHaveTextContent("99+");
    rerender(<AdminSidebar openFeedback={0} />);
    expect(screen.queryByLabelText("0 open")).not.toBeInTheDocument();
  });

  it("links back to the agency app", () => {
    render(<AdminSidebar />);
    expect(
      screen.getByRole("link", { name: /back to the app/i }),
    ).toHaveAttribute("href", "/dashboard");
  });
});
