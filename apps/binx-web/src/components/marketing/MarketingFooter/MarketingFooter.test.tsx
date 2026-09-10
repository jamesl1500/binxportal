import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MarketingFooter from "./MarketingFooter";

describe("MarketingFooter", () => {
  it("renders the three link columns with working hrefs", () => {
    render(<MarketingFooter />);
    expect(screen.getByRole("navigation", { name: "Product" }).querySelectorAll("a")).toHaveLength(4);
    expect(screen.getByRole("navigation", { name: "Company" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Legal" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Product" }).querySelector('a[href="/pricing"]')).not.toBeNull();
  });

  it("shows the current year and a contact mailto link", () => {
    render(<MarketingFooter />);
    expect(screen.getByText(new RegExp(String(new Date().getFullYear())))).toBeInTheDocument();
    const mail = screen.getByRole("link", { name: /@/ });
    expect(mail).toHaveAttribute("href", expect.stringContaining("mailto:"));
  });
});
