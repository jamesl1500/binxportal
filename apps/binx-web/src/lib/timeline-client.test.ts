import { describe, expect, it } from "vitest";

import { celebrationDraft, daysFromToday, relativeDay, winHref } from "./timeline-client";

describe("winHref", () => {
  it("links clients, invoices, projects and proposals", () => {
    expect(winHref({ target_type: "client", target_id: "c1" })).toBe("/clients/c1");
    expect(winHref({ target_type: "invoice", target_id: "i1" })).toBe("/invoices/i1");
    expect(winHref({ target_type: "project", target_id: "p1" })).toBe("/projects/p1");
    expect(winHref({ target_type: "proposal", target_id: "pr1" })).toBe("/proposals/pr1");
  });

  it("returns null for anything else", () => {
    expect(winHref({ target_type: "user", target_id: "u1" })).toBeNull();
    expect(winHref({ target_type: "client", target_id: null })).toBeNull();
    expect(winHref({ target_type: null, target_id: null })).toBeNull();
  });
});

describe("celebrationDraft", () => {
  it("welcomes new teammates and marks anniversaries, with an @mention", () => {
    expect(celebrationDraft({ kind: "joined", user_name: "bob", years: null })).toBe(
      "👋 Welcome to the team, @bob! ",
    );
    expect(celebrationDraft({ kind: "anniversary", user_name: "alice", years: 3 })).toBe(
      "🎉 Happy 3-year work anniversary, @alice! ",
    );
  });
});

describe("daysFromToday / relativeDay", () => {
  const today = new Date(2026, 10, 20, 23, 30); // local Nov 20, late evening

  it("counts calendar days, whatever the time of day", () => {
    expect(daysFromToday("2026-11-20", today)).toBe(0);
    expect(daysFromToday("2026-11-21", today)).toBe(1);
    expect(daysFromToday("2026-11-17", today)).toBe(-3);
    expect(daysFromToday("2027-01-01", today)).toBe(42);
  });

  it("reads naturally", () => {
    expect(relativeDay(0)).toBe("today");
    expect(relativeDay(1)).toBe("tomorrow");
    expect(relativeDay(-1)).toBe("yesterday");
    expect(relativeDay(5)).toBe("in 5 days");
    expect(relativeDay(-4)).toBe("4 days ago");
  });
});
