import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MarketingCta from "./MarketingCta";

describe("MarketingCta", () => {
  it("renders the default heading and both CTA links", () => {
    render(<MarketingCta />);
    expect(screen.getByRole("heading", { name: /one place to run from/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /get started free/i })).toHaveAttribute("href", "/auth/signup");
    expect(screen.getByRole("link", { name: /talk to us/i })).toHaveAttribute("href", "/contact");
  });

  it("accepts a custom heading and sub", () => {
    render(<MarketingCta heading="Custom heading" sub="Custom sub" />);
    expect(screen.getByRole("heading", { name: "Custom heading" })).toBeInTheDocument();
    expect(screen.getByText("Custom sub")).toBeInTheDocument();
  });

  it("renders custom actions, with a plain anchor for a mailto link", () => {
    render(
      <MarketingCta
        primary={{ href: "mailto:hi@example.com", label: "Email us" }}
        secondary={{ href: "/auth/signup", label: "Try it" }}
      />,
    );
    expect(screen.getByRole("link", { name: /email us/i })).toHaveAttribute("href", "mailto:hi@example.com");
    expect(screen.getByRole("link", { name: /try it/i })).toHaveAttribute("href", "/auth/signup");
  });
});
