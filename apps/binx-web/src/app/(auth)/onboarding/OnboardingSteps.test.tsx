import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockedPathname = vi.fn(() => "/onboarding/one");
vi.mock("next/navigation", () => ({ usePathname: () => mockedPathname() }));

import OnboardingSteps from "./OnboardingSteps";

describe("OnboardingSteps", () => {
  it("marks step one active on /onboarding/one", () => {
    mockedPathname.mockReturnValue("/onboarding/one");
    render(<OnboardingSteps />);

    expect(screen.getByText("Tell us about you").closest("li")).toHaveAttribute("data-active", "true");
    expect(screen.getByText("Create your agency").closest("li")).toHaveAttribute("data-active", "false");
    expect(screen.getByText("Choose your plan").closest("li")).toHaveAttribute("data-active", "false");
  });

  it("marks step three active on /onboarding/three", () => {
    mockedPathname.mockReturnValue("/onboarding/three");
    render(<OnboardingSteps />);

    expect(screen.getByText("Choose your plan").closest("li")).toHaveAttribute("data-active", "true");
    expect(screen.getByText("Tell us about you").closest("li")).toHaveAttribute("data-active", "false");
  });

  it("marks the optional import step active on /onboarding/four", () => {
    mockedPathname.mockReturnValue("/onboarding/four");
    render(<OnboardingSteps />);

    expect(screen.getByText("Bring your clients & team").closest("li")).toHaveAttribute("data-active", "true");
    expect(screen.getByText("Choose your plan").closest("li")).toHaveAttribute("data-active", "false");
  });

  it("marks the optional payments step active on /onboarding/five", () => {
    mockedPathname.mockReturnValue("/onboarding/five");
    render(<OnboardingSteps />);

    expect(screen.getByText("Get paid online").closest("li")).toHaveAttribute("data-active", "true");
  });

  it("renders all five steps with their index labels", () => {
    render(<OnboardingSteps />);
    for (const index of ["01", "02", "03", "04", "05"]) {
      expect(screen.getByText(index)).toBeInTheDocument();
    }
  });
});
