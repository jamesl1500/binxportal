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

  it("renders all three steps with their index labels", () => {
    render(<OnboardingSteps />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
  });
});
