import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedPathname = vi.fn(() => "/portal");
vi.mock("next/navigation", () => ({ usePathname: () => mockedPathname() }));
vi.mock("@/app/(app)/actions", () => ({ updateTutorialProgressAction: vi.fn() }));

import PortalOnboardingProvider from "@/components/portal/PortalOnboardingProvider/PortalOnboardingProvider";
import type { PortalPendingKickoff } from "@/lib/portal";
import { KICKOFF_INVITE_STORAGE_KEY, kickoffInviteKey, PORTAL_TOUR_ID } from "@/lib/portal-insights";
import PortalKickoffInvite from "./PortalKickoffInvite";

function kickoff(overrides: Partial<PortalPendingKickoff> = {}): PortalPendingKickoff {
  return {
    id: "k1",
    project_id: "p1",
    project_name: "Brand refresh",
    title: "Project kickoff",
    intro_message: "A few questions before we start.",
    question_count: 5,
    required_count: 3,
    sent_at: "2026-09-25T10:00:00Z",
    last_nudged_at: null,
    ...overrides,
  };
}

function renderInvite(kickoffs: PortalPendingKickoff[], { tourSeen = true } = {}) {
  return render(
    <PortalOnboardingProvider
      initialProgress={{ tour_completed: false, dismissed_popups: tourSeen ? [PORTAL_TOUR_ID] : [] }}
    >
      <PortalKickoffInvite kickoffs={kickoffs} agencyName="Northlight" contactFirstName="Priya" logoSrc={null} />
    </PortalOnboardingProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedPathname.mockReturnValue("/portal");
  window.sessionStorage.clear();
});

describe("PortalKickoffInvite", () => {
  it("invites the client into a single pending kickoff", async () => {
    renderInvite([kickoff()]);

    expect(await screen.findByRole("heading", { name: "Let's kick off Brand refresh" })).toBeInTheDocument();
    expect(screen.getByText(/Hi Priya, Northlight needs a few answers/)).toBeInTheDocument();
    expect(screen.getByText("A few questions before we start.")).toBeInTheDocument();
    expect(screen.getByText(/5 questions · 3 required/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start kickoff/ })).toHaveAttribute("href", "/portal/projects/p1/kickoff");
  });

  it("lists every kickoff when there are several", async () => {
    renderInvite([kickoff(), kickoff({ id: "k2", project_id: "p2", project_name: "Website" })]);

    expect(await screen.findByRole("heading", { name: "2 kickoffs are waiting on you" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Website/ })).toHaveAttribute("href", "/portal/projects/p2/kickoff");
    expect(screen.getByRole("link", { name: /Start the first one/ })).toHaveAttribute(
      "href",
      "/portal/projects/p1/kickoff",
    );
  });

  it("renders nothing without pending kickoffs", () => {
    renderInvite([]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("waits for the welcome tour to finish first", async () => {
    renderInvite([kickoff()], { tourSeen: false });
    // Only the tour is open for now (it's a separate component, not rendered here).
    await waitFor(() => expect(screen.queryByRole("heading", { name: /kick off/ })).not.toBeInTheDocument());
  });

  it("snoozes for the session on Remind me later", async () => {
    const user = userEvent.setup();
    const { unmount } = renderInvite([kickoff()]);
    await screen.findByRole("heading", { name: "Let's kick off Brand refresh" });

    await user.click(screen.getByRole("button", { name: "Remind me later" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.sessionStorage.getItem(KICKOFF_INVITE_STORAGE_KEY)).toBe(kickoffInviteKey([kickoff()]));

    unmount();
    renderInvite([kickoff()]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("comes back when staff nudge the kickoff after a snooze", async () => {
    window.sessionStorage.setItem(KICKOFF_INVITE_STORAGE_KEY, kickoffInviteKey([kickoff()]));
    renderInvite([kickoff({ last_nudged_at: "2026-09-26T09:00:00Z" })]);

    expect(await screen.findByRole("heading", { name: "Let's kick off Brand refresh" })).toBeInTheDocument();
  });

  it("stays out of the way on the kickoff page itself, counting it as seen", async () => {
    mockedPathname.mockReturnValue("/portal/projects/p1/kickoff");
    renderInvite([kickoff()]);

    await waitFor(() =>
      expect(window.sessionStorage.getItem(KICKOFF_INVITE_STORAGE_KEY)).toBe(kickoffInviteKey([kickoff()])),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
