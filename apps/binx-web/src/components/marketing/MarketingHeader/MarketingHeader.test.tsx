import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The header CSS is mobile-first (`.nav { display: none }` until a media
// query), so under jsdom the desktop nav counts as hidden — query the raw
// nodes rather than relying on role visibility.
const { pathnameRef } = vi.hoisted(() => ({ pathnameRef: { current: "/" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathnameRef.current }));

import MarketingHeader from "./MarketingHeader";

beforeEach(() => {
  pathnameRef.current = "/";
});

describe("MarketingHeader", () => {
  it("renders the primary nav links and both CTAs", () => {
    const { container } = render(<MarketingHeader />);
    const nav = container.querySelector('nav[aria-label="Primary"]')!;
    expect([...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
      "/features",
      "/pricing",
      "/about",
      "/contact",
    ]);
    expect(container.querySelector('a[href="/auth/login"]')).toHaveTextContent("Sign in");
    expect(container.querySelector('a[href="/auth/signup"]')).toHaveTextContent("Get started");
  });

  it("marks the active nav link from the pathname", () => {
    pathnameRef.current = "/pricing";
    const { container } = render(<MarketingHeader />);
    const nav = container.querySelector('nav[aria-label="Primary"]')!;
    expect(nav.querySelector('a[href="/pricing"]')).toHaveAttribute("data-active", "true");
    expect(nav.querySelector('a[href="/features"]')).toHaveAttribute("data-active", "false");
  });

  it("toggles the mobile disclosure menu open and closed", async () => {
    const { container } = render(<MarketingHeader />);
    expect(container.querySelectorAll('a[href="/features"]')).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    expect(screen.getByRole("button", { name: /close menu/i })).toBeInTheDocument();
    expect(container.querySelectorAll('a[href="/features"]')).toHaveLength(2); // desktop + mobile panel

    await userEvent.click(screen.getByRole("button", { name: /close menu/i }));
    expect(container.querySelectorAll('a[href="/features"]')).toHaveLength(1);
  });
});
