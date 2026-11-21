import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MarketingFooter from "./MarketingFooter";

describe("MarketingFooter", () => {
  it("renders the link columns with working hrefs", () => {
    render(<MarketingFooter />);
    expect(screen.getByRole("navigation", { name: "Product" }).querySelectorAll("a")).toHaveLength(6);
    expect(screen.getByRole("navigation", { name: "Company" }).querySelector('a[href="/investors"]')).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Legal" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Product" }).querySelector('a[href="/pricing"]')).not.toBeNull();
  });

  it("gives every /for/* use-case page a persistent sitewide link", () => {
    render(<MarketingFooter />);
    const useCases = screen.getByRole("navigation", { name: "Use cases" });
    expect(useCases.querySelector('a[href="/for/design-studios"]')).not.toBeNull();
    expect(useCases.querySelector('a[href="/for/marketing-teams"]')).not.toBeNull();
    expect(useCases.querySelector('a[href="/for/branding-agencies"]')).not.toBeNull();
    expect(useCases.querySelector('a[href="/for/freelance-collectives"]')).not.toBeNull();
  });

  it("shows the current year and credits Foundry Frame in a new tab", () => {
    render(<MarketingFooter />);
    expect(screen.getByText(new RegExp(String(new Date().getFullYear())))).toBeInTheDocument();
    const credit = screen.getByRole("link", { name: /a foundry frame project/i });
    expect(credit).toHaveAttribute("href", "https://www.foundryframe.com");
    expect(credit).toHaveAttribute("target", "_blank");
    // noopener for safety; no noreferrer, so the studio's analytics see Binx.
    expect(credit).toHaveAttribute("rel", "noopener");
    // Screen readers are told it opens a new tab.
    expect(credit).toHaveAccessibleName(/opens in a new tab/i);
  });
});
