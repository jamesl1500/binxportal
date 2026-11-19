import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AuditEntry } from "@/lib/admin-client";

import AuditTimeline from "./AuditTimeline";

const ENTRIES: AuditEntry[] = [
  {
    id: "e1",
    actor_id: "admin",
    actor_name: "Binx Admin",
    action: "deactivated",
    target_type: "user",
    target_id: "u1",
    target_label: "tess@pixel.example",
    detail: "Deactivated the account — Left the agency",
    created_at: "2026-11-18T15:00:00Z",
  },
  {
    id: "e2",
    actor_id: "admin",
    actor_name: "Binx Admin",
    action: "note",
    target_type: "agency",
    target_id: "a1",
    target_label: "Pixel Forge",
    detail: "Asked about custom domains",
    created_at: "2026-11-17T15:00:00Z",
  },
];

describe("AuditTimeline", () => {
  it("shows what was done, the detail and who did it", () => {
    render(<AuditTimeline entries={ENTRIES} />);
    expect(screen.getByText("Deactivated")).toBeInTheDocument();
    expect(screen.getByText("Deactivated the account — Left the agency")).toBeInTheDocument();
    expect(screen.getAllByText("by Binx Admin")).toHaveLength(2);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links to each target on the global log", () => {
    render(<AuditTimeline entries={ENTRIES} showTarget />);
    expect(screen.getByRole("link", { name: "tess@pixel.example" })).toHaveAttribute("href", "/admin/users/u1");
    expect(screen.getByRole("link", { name: "Pixel Forge" })).toHaveAttribute("href", "/admin/agencies/a1");
  });

  it("has an empty state", () => {
    render(<AuditTimeline entries={[]} emptyText="Nothing yet." />);
    expect(screen.getByText("Nothing yet.")).toBeInTheDocument();
  });
});
