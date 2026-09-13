import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/app/(app)/notifications/actions", () => ({
  getNotificationsAction: vi.fn(),
  getUnreadCountAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
  markNotificationReadAction: vi.fn(),
}));

// The socket lifecycle itself (ticket fetch, reconnect backoff) is covered by
// useRealtimeSocket's own tests — here we just capture the `onEvent`
// callback NotificationBell registers, so tests can simulate a pushed event
// without a real WebSocket.
let capturedOnEvent: ((event: { type: string; data?: unknown }) => void) | null = null;
vi.mock("@/hooks/useRealtimeSocket", () => ({
  useRealtimeSocket: (onEvent: (event: { type: string; data?: unknown }) => void) => {
    capturedOnEvent = onEvent;
    return "open";
  },
}));

const mockedToast = vi.fn();
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => mockedToast(...args) }));

import {
  getNotificationsAction,
  getUnreadCountAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/(app)/notifications/actions";
import type { AppNotification } from "@/lib/notifications";

import NotificationBell from "./NotificationBell";

const mockedList = vi.mocked(getNotificationsAction);
const mockedCount = vi.mocked(getUnreadCountAction);
const mockedMarkAll = vi.mocked(markAllNotificationsReadAction);
const mockedMarkRead = vi.mocked(markNotificationReadAction);

function note(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "n-1",
    agency_id: "a-1",
    category: "projects",
    event_type: "task_assigned",
    title: "You were assigned “Ship it”",
    body: "Alex assigned it to you in Launch.",
    link: "/projects/p-1",
    actor_name: "Alex",
    read_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnEvent = null;
  mockedCount.mockResolvedValue(2);
  mockedList.mockResolvedValue({ page: { items: [note()], unread_count: 2, has_more: false } });
  mockedMarkAll.mockResolvedValue({});
  mockedMarkRead.mockResolvedValue({ notification: note({ read_at: new Date().toISOString() }) });
});

describe("NotificationBell", () => {
  it("shows the unread badge from its initial props", () => {
    render(<NotificationBell initialUnreadCount={3} initialItems={[]} />);
    expect(screen.getByRole("button", { name: /3 unread/ })).toHaveTextContent("3");
  });

  it("refreshes the list when the dropdown opens", async () => {
    const user = userEvent.setup();
    render(<NotificationBell initialUnreadCount={2} initialItems={[]} />);

    await user.click(screen.getByRole("button", { name: /notifications/i }));

    expect(await screen.findByText("You were assigned “Ship it”")).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith({ limit: 8 });
  });

  it("marks a row read and navigates to its link when clicked", async () => {
    const user = userEvent.setup();
    render(<NotificationBell initialUnreadCount={2} initialItems={[note()]} />);

    await user.click(screen.getByRole("button", { name: /notifications/i }));
    await user.click(await screen.findByText("You were assigned “Ship it”"));

    expect(mockedMarkRead).toHaveBeenCalledWith("n-1");
    expect(push).toHaveBeenCalledWith("/projects/p-1");
  });

  it("marks everything read from the header action", async () => {
    const user = userEvent.setup();
    render(<NotificationBell initialUnreadCount={2} initialItems={[note()]} />);

    await user.click(screen.getByRole("button", { name: /notifications/i }));
    await user.click(await screen.findByRole("button", { name: /mark all as read/i }));

    await waitFor(() => expect(mockedMarkAll).toHaveBeenCalled());
  });
});

describe("NotificationBell realtime", () => {
  it("toasts and bumps the badge when a notification is pushed live", () => {
    render(<NotificationBell initialUnreadCount={1} initialItems={[]} />);
    expect(capturedOnEvent).not.toBeNull();

    const pushed = note({ id: "n-live", title: "Live update", body: "Fresh off the socket" });
    act(() => capturedOnEvent!({ type: "notification.created", data: pushed }));

    expect(screen.getByRole("button", { name: /2 unread/ })).toHaveTextContent("2");
    expect(mockedToast).toHaveBeenCalledWith(
      "Live update",
      expect.objectContaining({ description: "Fresh off the socket" }),
    );
  });

  it("shows a pushed notification immediately if the dropdown is already open", async () => {
    const user = userEvent.setup();
    render(<NotificationBell initialUnreadCount={1} initialItems={[]} />);

    // Opening triggers its own list refresh, resolving to the default mocked
    // item — that settles before the live push below is simulated.
    await user.click(screen.getByRole("button", { name: /notifications/i }));
    await screen.findByText("You were assigned “Ship it”");

    const pushed = note({ id: "n-live", title: "Live update", body: "Fresh off the socket" });
    act(() => capturedOnEvent!({ type: "notification.created", data: pushed }));

    expect(screen.getByText("Live update")).toBeInTheDocument();
  });

  it("navigates via the toast's action when the pushed notification has a link", () => {
    render(<NotificationBell initialUnreadCount={0} initialItems={[]} />);
    act(() => capturedOnEvent!({ type: "notification.created", data: note({ link: "/invoices/i-1" }) }));

    const call = mockedToast.mock.calls[0];
    const options = call[1] as { action?: { label: string; onClick: () => void } };
    options.action!.onClick();

    expect(push).toHaveBeenCalledWith("/invoices/i-1");
  });

  it("ignores unrelated realtime events", () => {
    render(<NotificationBell initialUnreadCount={1} initialItems={[]} />);
    act(() => capturedOnEvent!({ type: "board.item.created", data: {} }));

    expect(screen.getByRole("button", { name: /1 unread/ })).toHaveTextContent("1");
    expect(mockedToast).not.toHaveBeenCalled();
  });
});
