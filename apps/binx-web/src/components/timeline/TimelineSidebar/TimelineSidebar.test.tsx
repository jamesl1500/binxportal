import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import TimelineSidebar from "./TimelineSidebar";
import { highlights, myWork } from "./fixtures";

function renderRail(props: Partial<Parameters<typeof TimelineSidebar>[0]> = {}) {
  const onStartPost = vi.fn();
  render(
    <TimelineSidebar
      agencyId="a1"
      currentUserId="u1"
      highlights={highlights()}
      myWork={myWork()}
      onStartPost={onStartPost}
      {...props}
    />,
  );
  return { onStartPost };
}

describe("TimelineSidebar", () => {
  it("shows every card with its data", () => {
    renderRail();

    const week = screen.getByRole("region", { name: "Your week" });
    expect(within(week).getByText("Send the homepage copy")).toBeInTheDocument();
    expect(within(week).getByRole("link", { name: /Send the homepage copy/ })).toHaveAttribute("href", "/projects/p1");

    const comingUp = screen.getByRole("region", { name: "Coming up" });
    expect(within(comingUp).getByText("Design review")).toBeInTheDocument();
    expect(within(comingUp).getByText(/Acme Co/)).toBeInTheDocument();

    const wins = screen.getByRole("region", { name: "Recent wins" });
    expect(within(wins).getByRole("link", { name: /Acme signed the Website proposal/ })).toHaveAttribute(
      "href",
      "/proposals/pr1",
    );

    const thisWeek = screen.getByRole("region", { name: "This week on the timeline" });
    expect(within(thisWeek).getByText("12")).toBeInTheDocument();
    expect(within(thisWeek).getByText("3 posts · 2 comments")).toBeInTheDocument();
  });

  it("'Say congrats' starts a post that @mentions them; you can't congratulate yourself", async () => {
    const { onStartPost } = renderRail();
    const celebrate = screen.getByRole("region", { name: "Celebrate" });

    await userEvent.click(within(celebrate).getByRole("button", { name: "Say congrats to Bob Member" }));
    expect(onStartPost).toHaveBeenCalledWith("👋 Welcome to the team, @bob! ");

    // Alice (u1) is the viewer: her anniversary shows, without a button.
    expect(within(celebrate).getByText("Alice Owner")).toBeInTheDocument();
    expect(within(celebrate).queryByRole("button", { name: /Alice Owner/ })).not.toBeInTheDocument();
    expect(within(celebrate).getByRole("link", { name: "Bob Member" })).toHaveAttribute("href", "/team/m2");
  });

  it("hides Celebrate when there's nobody to celebrate, and shows empty lines elsewhere", () => {
    renderRail({
      highlights: highlights({
        upcoming_meetings: [],
        celebrations: [],
        wins: [],
        this_week: { posts: 0, comments: 0, reactions: 0, top_contributors: [] },
      }),
      myWork: myWork({ tasks: [], overdue_count: 0, due_soon_count: 0, total_open: 0 }),
    });

    expect(screen.queryByRole("region", { name: "Celebrate" })).not.toBeInTheDocument();
    expect(screen.getByText(/No client meetings in the next 7 days/)).toBeInTheDocument();
    expect(screen.getByText(/Signed proposals, payments and new clients show up here/)).toBeInTheDocument();
    expect(screen.getByText(/Be the first to post this week/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing assigned to you/)).toBeInTheDocument();
  });

  it("leaves out what failed to load", () => {
    renderRail({ highlights: null });
    expect(screen.getByRole("region", { name: "Your week" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Coming up" })).not.toBeInTheDocument();
  });
});
