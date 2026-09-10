import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/activity/actions", () => ({ getMyActivityAction: vi.fn() }));

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
});
