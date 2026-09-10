import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LeadScoreBadge from "./LeadScoreBadge";

describe("LeadScoreBadge", () => {
  it("renders a muted chip when there is no score", () => {
    render(<LeadScoreBadge score={null} />);
    const chip = screen.getByText("Not scored");
    expect(chip).toHaveAttribute("data-tone", "none");
  });

  it.each([
    [85, "high"],
    [55, "mid"],
    [10, "low"],
    [70, "high"],
    [40, "mid"],
  ])("scores %d as tone %s", (score, expected) => {
    render(<LeadScoreBadge score={score} />);
    expect(screen.getByText(`Score ${score}`)).toHaveAttribute("data-tone", expected);
  });
});
