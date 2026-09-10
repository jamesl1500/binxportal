import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/activity/actions", () => ({ getAgencyActivityAction: vi.fn() }));

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
});
