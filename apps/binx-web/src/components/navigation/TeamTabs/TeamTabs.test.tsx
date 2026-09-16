import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedPathname = vi.fn(() => "/team");
vi.mock("next/navigation", () => ({ usePathname: () => mockedPathname() }));

// TeamTabs renders a PageCoachmark on the Invitations tab (managers only),
// which reads tutorial state via context — not under test here.
vi.mock("@/components/tutorial/TutorialProvider/TutorialProvider", () => ({
  useTutorial: () => ({ isPopupDismissed: () => true, dismissPopup: vi.fn() }),
}));

import TeamTabs from "./TeamTabs";

beforeEach(() => mockedPathname.mockReturnValue("/team"));

describe("TeamTabs", () => {
  it("shows only Members for a non-manager", () => {
    render(<TeamTabs canManage={false} />);
    expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute("href", "/team");
    expect(screen.queryByRole("link", { name: "Invitations" })).toBeNull();
  });

  it("shows Invitations for a manager and marks the active tab", () => {
    mockedPathname.mockReturnValue("/team/invitations");
    render(<TeamTabs canManage />);
    const invites = screen.getByRole("link", { name: "Invitations" });
    expect(invites).toHaveAttribute("href", "/team/invitations");
    expect(invites).toHaveAttribute("data-active", "true");
  });
});
