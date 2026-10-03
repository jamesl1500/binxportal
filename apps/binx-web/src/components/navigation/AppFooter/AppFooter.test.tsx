import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AppFooter from "./AppFooter";

describe("AppFooter", () => {
  it("shows the current year's copyright", () => {
    render(<AppFooter />);
    expect(screen.getByText(new RegExp(String(new Date().getFullYear())))).toBeInTheDocument();
  });

  it("links to privacy, terms, and support", () => {
    render(<AppFooter />);
    const nav = screen.getByRole("navigation", { name: "Legal" });
    expect(nav.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/terms"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/contact"]')).not.toBeNull();
  });
});
