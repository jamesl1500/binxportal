import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import LeadTabs from "./LeadTabs";

function renderTabs(eventCount?: number) {
  return render(
    <LeadTabs
      details={<div>details panel</div>}
      timeline={<div>timeline panel</div>}
      analysis={<div>analysis panel</div>}
      eventCount={eventCount}
    />,
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/leads/lead-1");
});

describe("LeadTabs", () => {
  it("shows the Details panel by default", () => {
    renderTabs();

    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("details panel")).toBeVisible();
    expect(screen.getByText("timeline panel")).not.toBeVisible();
    expect(screen.getByText("analysis panel")).not.toBeVisible();
  });

  it("switches panels on click and mirrors the tab to the hash", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(screen.getByText("timeline panel")).toBeVisible();
    expect(screen.getByText("details panel")).not.toBeVisible();
    expect(window.location.hash).toBe("#timeline");

    await user.click(screen.getByRole("tab", { name: "AI analysis" }));
    expect(screen.getByText("analysis panel")).toBeVisible();
    expect(window.location.hash).toBe("#ai");

    await user.click(screen.getByRole("tab", { name: "Details" }));
    expect(window.location.hash).toBe("");
  });

  it("opens on the tab named by the URL hash", () => {
    window.history.replaceState(null, "", "/leads/lead-1#ai");
    renderTabs();

    expect(screen.getByText("analysis panel")).toBeVisible();
    expect(screen.getByRole("tab", { name: "AI analysis" })).toHaveAttribute("aria-selected", "true");
  });

  it("falls back to Details for an unknown hash", () => {
    window.history.replaceState(null, "", "/leads/lead-1#nope");
    renderTabs();

    expect(screen.getByText("details panel")).toBeVisible();
  });

  it("keeps inactive panels mounted so form state survives a tab switch", async () => {
    const user = userEvent.setup();
    render(
      <LeadTabs
        details={<input aria-label="name" />}
        timeline={<div>timeline panel</div>}
        analysis={<div>analysis panel</div>}
      />,
    );

    await user.type(screen.getByLabelText("name"), "Acme");
    await user.click(screen.getByRole("tab", { name: "Timeline" }));
    await user.click(screen.getByRole("tab", { name: "Details" }));

    expect(screen.getByLabelText("name")).toHaveValue("Acme");
  });

  it("badges the Timeline tab with the event count", () => {
    renderTabs(4);

    expect(screen.getByRole("tab", { name: /Timeline/ })).toHaveTextContent("4");
  });
});
