import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/activity/actions", () => ({ getMyActivityAction: vi.fn() }));

// The socket lifecycle itself is covered by useRealtimeSocket's own tests —
// here we just capture the `onEvent` callback so tests can simulate a
// pushed event without a real WebSocket.
let capturedOnEvent: ((event: { type: string; data?: unknown }) => void) | null = null;
vi.mock("@/hooks/useRealtimeSocket", () => ({
  useRealtimeSocket: (onEvent: (event: { type: string; data?: unknown }) => void) => {
    capturedOnEvent = onEvent;
    return "open";
  },
}));

import { getMyActivityAction } from "@/app/(app)/activity/actions";
import type { ActivityEntry, ActivityPage } from "@/lib/activity";

import SecurityActivityList from "./SecurityActivityList";

const mockedAction = vi.mocked(getMyActivityAction);

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: "s-1",
    category: "security",
    event_type: "login",
    visibility: "team",
    summary: "Signed in",
    actor_name: "Me",
    target_type: null,
    target_name: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnEvent = null;
});

describe("SecurityActivityList", () => {
  it("shows the empty state when there is nothing", () => {
    render(<SecurityActivityList initialPage={{ items: [], has_more: false }} />);
    expect(screen.getByText("No recent security activity.")).toBeInTheDocument();
  });

  it("renders seeded rows and loads more", async () => {
    mockedAction.mockResolvedValueOnce({
      page: { items: [entry({ id: "s-2", summary: "Password changed" })], has_more: false },
    });
    const initialPage: ActivityPage = { items: [entry({ id: "s-1", summary: "Signed in" })], has_more: true };
    const user = userEvent.setup();
    render(<SecurityActivityList initialPage={initialPage} />);

    expect(screen.getByText("Signed in")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /load more/i }));

    expect(mockedAction).toHaveBeenCalledWith({ limit: 15, offset: 1 });
    expect(await screen.findByText("Password changed")).toBeInTheDocument();
  });

  it("prepends a live-pushed security event without a network call", () => {
    const initialPage: ActivityPage = { items: [entry({ id: "s-1", summary: "Signed in" })], has_more: false };
    render(<SecurityActivityList initialPage={initialPage} />);
    expect(capturedOnEvent).not.toBeNull();

    act(() =>
      capturedOnEvent!({
        type: "activity.created",
        data: entry({ id: "s-live", summary: "Password changed just now" }),
      }),
    );

    expect(screen.getByText("Password changed just now")).toBeInTheDocument();
    expect(mockedAction).not.toHaveBeenCalled();
  });

  it("ignores a stray agency-activity event from the same socket", () => {
    const initialPage: ActivityPage = { items: [entry({ id: "s-1", summary: "Signed in" })], has_more: false };
    render(<SecurityActivityList initialPage={initialPage} />);

    act(() =>
      capturedOnEvent!({
        type: "activity.created",
        // log_agency_activity entries ride the same per-user socket but must
        // never land in a personal security list — see activity/service.py.
        data: entry({ id: "e-team", category: "team", summary: "Priya moved a task to Done" }),
      }),
    );

    expect(screen.queryByText("Priya moved a task to Done")).not.toBeInTheDocument();
  });

  it("shows a live-pushed event from an empty starting state", () => {
    render(<SecurityActivityList initialPage={{ items: [], has_more: false }} />);
    expect(screen.getByText("No recent security activity.")).toBeInTheDocument();

    act(() => capturedOnEvent!({ type: "activity.created", data: entry({ summary: "Signed in just now" }) }));

    expect(screen.getByText("Signed in just now")).toBeInTheDocument();
    expect(screen.queryByText("No recent security activity.")).not.toBeInTheDocument();
  });
});
