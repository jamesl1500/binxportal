import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Renders a PageCoachmark on the link, which reads tutorial state via
// context — not under test here.
vi.mock("@/components/tutorial/TutorialProvider/TutorialProvider", () => ({
  useTutorial: () => ({ isPopupDismissed: () => true, dismissPopup: vi.fn() }),
}));

import NewLeadButton from "./NewLeadButton";

describe("NewLeadButton", () => {
  it("links to /leads/new", () => {
    render(<NewLeadButton />);
    expect(screen.getByRole("link", { name: /new lead/i })).toHaveAttribute("href", "/leads/new");
  });
});
