import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/activity/actions", () => ({ getAgencyActivityAction: vi.fn() }));

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

import { getAgencyActivityAction } from "@/app/(app)/activity/actions";
import type { ActivityEntry, ActivityPage } from "@/lib/activity";

import ActivityFeed from "./ActivityFeed";

const mockedAction = vi.mocked(getAgencyActivityAction);

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: "e-1",
    category: "team",
    event_type: "member_joined",
    visibility: "team",
    summary: "Sam joined the agency as a member",
    actor_name: "Sam Smith",
    target_type: "user",
    target_name: "Sam Smith",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

const initialPage: ActivityPage = {
  items: [
    entry({ id: "e-1", summary: "Sam joined the agency as a member" }),
    entry({
      id: "e-2",
      category: "invoicing",
      event_type: "billing_settings_updated",
      visibility: "admin",
      summary: "Dana updated the billing settings",
      actor_name: "Dana Doe",
    }),
  ],
  has_more: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnEvent = null;
});

describe("ActivityFeed", () => {
  it("renders the seeded entries and flags admin-only rows", () => {
    render(<ActivityFeed agencyId="a-1" initialPage={initialPage} />);
    expect(screen.getByText("Sam joined the agency as a member")).toBeInTheDocument();
    expect(screen.getByText("Dana updated the billing settings")).toBeInTheDocument();
    expect(screen.getByText("Admins only")).toBeInTheDocument();
  });

  it("refetches filtered by category when a chip is clicked", async () => {
    mockedAction.mockResolvedValueOnce({
      page: { items: [entry({ id: "e-3", category: "invoicing", summary: "Invoice INV-9 issued" })], has_more: false },
    });
    const user = userEvent.setup();
    render(<ActivityFeed agencyId="a-1" initialPage={initialPage} />);

    await user.click(screen.getByRole("button", { name: "Invoicing" }));

    expect(mockedAction).toHaveBeenCalledWith("a-1", { category: "invoicing", limit: 30, offset: 0 });
    expect(await screen.findByText("Invoice INV-9 issued")).toBeInTheDocument();
    expect(screen.queryByText("Sam joined the agency as a member")).not.toBeInTheDocument();
  });

  it("appends the next page on Load more", async () => {
    mockedAction.mockResolvedValueOnce({
      page: { items: [entry({ id: "e-9", summary: "Older entry" })], has_more: false },
    });
    const user = userEvent.setup();
    render(<ActivityFeed agencyId="a-1" initialPage={{ ...initialPage, has_more: true }} />);

    await user.click(screen.getByRole("button", { name: /load more/i }));

    expect(mockedAction).toHaveBeenCalledWith("a-1", { category: undefined, limit: 30, offset: 2 });
    expect(await screen.findByText("Older entry")).toBeInTheDocument();
    expect(screen.getByText("Sam joined the agency as a member")).toBeInTheDocument();
  });

  it("prepends a live-pushed entry without a network call", () => {
    render(<ActivityFeed agencyId="a-1" initialPage={initialPage} />);
    expect(capturedOnEvent).not.toBeNull();

    act(() =>
      capturedOnEvent!({
        type: "activity.created",
        data: entry({ id: "e-live", summary: "Priya moved a task to Done" }),
      }),
    );

    expect(screen.getByText("Priya moved a task to Done")).toBeInTheDocument();
    expect(mockedAction).not.toHaveBeenCalled();
  });

  it("drops a live entry from a category the current filter excludes", async () => {
    mockedAction.mockResolvedValueOnce({
      page: { items: [entry({ id: "e-3", category: "invoicing", summary: "Invoice INV-9 issued" })], has_more: false },
    });
    const user = userEvent.setup();
    render(<ActivityFeed agencyId="a-1" initialPage={initialPage} />);
    await user.click(screen.getByRole("button", { name: "Invoicing" }));
    await screen.findByText("Invoice INV-9 issued");

    act(() =>
      capturedOnEvent!({
        type: "activity.created",
        data: entry({ id: "e-live", category: "team", summary: "Priya moved a task to Done" }),
      }),
    );

    expect(screen.queryByText("Priya moved a task to Done")).not.toBeInTheDocument();
  });

  it("never shows a stray account-security entry from the same socket", () => {
    render(<ActivityFeed agencyId="a-1" initialPage={initialPage} />);

    act(() =>
      capturedOnEvent!({
        type: "activity.created",
        // log_account_activity entries ride the same per-user socket but
        // must never land in the agency feed — see activity/service.py.
        data: entry({ id: "e-sec", category: "security", summary: "Signed in from a new device" }),
      }),
    );

    expect(screen.queryByText("Signed in from a new device")).not.toBeInTheDocument();
  });

  it("ignores unrelated realtime events", () => {
    render(<ActivityFeed agencyId="a-1" initialPage={initialPage} />);
    act(() => capturedOnEvent!({ type: "board.item.created", data: {} }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
