import { render, screen, waitFor } from "@testing-library/react";
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
