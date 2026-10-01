import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/imports/BulkImportWizard/BulkImportWizard", () => ({
  default: ({ kind, onImported }: { kind: string; onImported: (r: { imported: number }) => void }) => (
    <button onClick={() => onImported({ imported: kind === "clients" ? 12 : 3 })}>fake-import-{kind}</button>
  ),
}));

import OnboardingImport from "./OnboardingImport";

describe("OnboardingImport", () => {
  it("is skippable, and turns into Finish once something is imported", async () => {
    render(<OnboardingImport agencyId="a1" canInvite />);
    expect(screen.getByRole("link", { name: "Skip for now" })).toHaveAttribute("href", "/dashboard");

    await userEvent.click(screen.getByRole("button", { name: "fake-import-clients" }));
    expect(screen.getByRole("link", { name: "Finish setup" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("tab", { name: /Clients/ })).toHaveTextContent("12");
  });

  it("switches tabs without unmounting the other import", async () => {
    render(<OnboardingImport agencyId="a1" canInvite />);
    await userEvent.click(screen.getByRole("tab", { name: /Team/ }));
    expect(screen.getByRole("tab", { name: /Team/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "fake-import-team" })).toBeVisible();
    expect(screen.getByRole("button", { name: "fake-import-clients", hidden: true })).not.toBeVisible();
  });

  it("hides the team tab for people who can't invite", () => {
    render(<OnboardingImport agencyId="a1" canInvite={false} />);
    expect(screen.queryByRole("tab", { name: /Team/ })).not.toBeInTheDocument();
  });
});
