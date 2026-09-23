import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Renders a PageCoachmark on the link, which reads tutorial state via
// context — not under test here.
vi.mock("@/components/tutorial/TutorialProvider/TutorialProvider", () => ({
  useTutorial: () => ({ isPopupDismissed: () => true, dismissPopup: vi.fn() }),
}));

import NewClientButton from "./NewClientButton";

describe("NewClientButton", () => {
  it("links to /clients/new", () => {
    render(<NewClientButton />);
    expect(screen.getByRole("link", { name: /new client/i })).toHaveAttribute("href", "/clients/new");
  });
});
