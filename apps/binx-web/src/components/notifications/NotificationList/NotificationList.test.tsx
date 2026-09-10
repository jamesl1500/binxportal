import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/app/(app)/notifications/actions", () => ({
  getNotificationsAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
  markNotificationReadAction: vi.fn(),
  dismissNotificationAction: vi.fn(),
}));

import {
  dismissNotificationAction,
  getNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/(app)/notifications/actions";
import type { AppNotification, NotificationPage } from "@/lib/notifications";

import NotificationList from "./NotificationList";

const mockedList = vi.mocked(getNotificationsAction);
const mockedMarkAll = vi.mocked(markAllNotificationsReadAction);
const mockedMarkRead = vi.mocked(markNotificationReadAction);
const mockedDismiss = vi.mocked(dismissNotificationAction);

function note(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "n-1",
    agency_id: "a-1",
    category: "team",
    event_type: "invite_accepted",
    title: "Sam joined Acme",
    body: null,
    link: "/team",
    actor_name: "Sam",
    read_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

const initialPage: NotificationPage = {
  items: [note({ id: "n-1", title: "Sam joined Acme" }), note({ id: "n-2", title: "Invoice INV-1 was issued", category: "invoicing", read_at: new Date().toISOString() })],
  unread_count: 1,
  has_more: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedMarkRead.mockResolvedValue({ notification: note() });
  mockedMarkAll.mockResolvedValue({});
  mockedDismiss.mockResolvedValue({});
});

describe("NotificationList", () => {
  it("renders the seeded rows", () => {
    render(<NotificationList initialPage={initialPage} />);
    expect(screen.getByText("Sam joined Acme")).toBeInTheDocument();
    expect(screen.getByText("Invoice INV-1 was issued")).toBeInTheDocument();
  });

  it("refetches with unread_only when the Unread tab is chosen", async () => {
    mockedList.mockResolvedValueOnce({
      page: { items: [note({ id: "n-1" })], unread_count: 1, has_more: false },
    });
    const user = userEvent.setup();
    render(<NotificationList initialPage={initialPage} />);

    await user.click(screen.getByRole("tab", { name: /unread/i }));

    expect(mockedList).toHaveBeenCalledWith({ unreadOnly: true, limit: 20, offset: 0 });
    expect(await screen.findByText("Sam joined Acme")).toBeInTheDocument();
  });

  it("dismisses a row and calls the action", async () => {
    const user = userEvent.setup();
    render(<NotificationList initialPage={initialPage} />);

    const rows = screen.getAllByRole("button", { name: "Dismiss notification" });
    await user.click(rows[0]);

    expect(mockedDismiss).toHaveBeenCalledWith("n-1");
    expect(screen.queryByText("Sam joined Acme")).not.toBeInTheDocument();
  });

  it("opens a row: marks read and navigates", async () => {
    const user = userEvent.setup();
    render(<NotificationList initialPage={initialPage} />);

    await user.click(screen.getByText("Sam joined Acme"));

    expect(mockedMarkRead).toHaveBeenCalledWith("n-1");
    expect(push).toHaveBeenCalledWith("/team");
  });

  it("loads another page when has_more", async () => {
    mockedList.mockResolvedValueOnce({
      page: { items: [note({ id: "n-3", title: "Later one" })], unread_count: 1, has_more: false },
    });
    const user = userEvent.setup();
    render(<NotificationList initialPage={{ ...initialPage, has_more: true }} />);

    await user.click(screen.getByRole("button", { name: /load more/i }));

    expect(mockedList).toHaveBeenCalledWith({ unreadOnly: false, limit: 20, offset: 2 });
    expect(await screen.findByText("Later one")).toBeInTheDocument();
  });
});
