import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications-client", () => ({ relativeTime: () => "2h ago" }));

import ActivityTeaser from "./ActivityTeaser";

const entry = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, summary: `Thing ${id} happened`, actor_name: "Jane Doe", created_at: "2026-01-01T00:00:00Z", ...over }) as never;

describe("ActivityTeaser", () => {
  it("renders the empty state with no entries", () => {
    render(<ActivityTeaser entries={[]} />);
    expect(screen.getByText("No activity yet.")).toBeInTheDocument();
  });

  it("renders a row per entry with initials and relative time", () => {
    render(<ActivityTeaser entries={[entry("1"), entry("2", { actor_name: null })]} />);
    expect(screen.getByText("Thing 1 happened")).toBeInTheDocument();
    expect(screen.getByText("JD")).toBeInTheDocument(); // Jane Doe
    expect(screen.getByText("•")).toBeInTheDocument(); // null actor
    expect(screen.getAllByText("2h ago")).toHaveLength(2);
  });
});
