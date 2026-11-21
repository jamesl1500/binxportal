import type { Schemas } from "@/lib/api-types";
import type { TimelineAuthor, TimelineHighlights } from "@/lib/timeline-client";

export function person(overrides: Partial<TimelineAuthor> = {}): TimelineAuthor {
  return {
    user_id: "u2",
    name: "Bob Member",
    member_id: "m2",
    has_avatar: false,
    avatar_version: null,
    role: "member",
    ...overrides,
  };
}

export function highlights(overrides: Partial<TimelineHighlights> = {}): TimelineHighlights {
  return {
    upcoming_meetings: [
      {
        id: "mt1",
        title: "Design review",
        starts_at: "2026-11-21T15:00:00Z",
        ends_at: "2026-11-21T15:30:00Z",
        client_name: "Acme Co",
      },
    ],
    celebrations: [
      { kind: "joined", person: person(), user_name: "bob", day: "2026-11-18", years: null },
      {
        kind: "anniversary",
        person: person({ user_id: "u1", name: "Alice Owner", member_id: "m1", role: "owner" }),
        user_name: "alice",
        day: "2026-11-22",
        years: 3,
      },
    ],
    wins: [
      {
        id: "w1",
        event_type: "proposal_signed",
        summary: "Acme signed the Website proposal",
        target_type: "proposal",
        target_id: "pr1",
        created_at: "2026-11-19T12:00:00Z",
      },
    ],
    this_week: {
      posts: 4,
      comments: 7,
      reactions: 12,
      top_contributors: [{ person: person(), posts: 3, comments: 2 }],
    },
    ...overrides,
  };
}

export function myWork(overrides: Partial<Schemas["MyWorkRead"]> = {}): Schemas["MyWorkRead"] {
  return {
    total_open: 2,
    overdue_count: 1,
    due_soon_count: 1,
    tasks: [
      {
        id: "t1",
        title: "Send the homepage copy",
        due_date: "2026-11-18",
        overdue: true,
        project_id: "p1",
        project_name: "Website",
        client_name: "Acme Co",
        list_name: "Doing",
      },
    ],
    ...overrides,
  };
}
