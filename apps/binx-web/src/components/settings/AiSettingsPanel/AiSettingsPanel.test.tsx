import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/settings/actions", () => ({
  updateAiSettingsAction: vi.fn(),
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { updateAiSettingsAction } from "@/app/(app)/settings/actions";
import type { AiSettings } from "@/lib/ai";

import AiSettingsPanel from "./AiSettingsPanel";

const mockedUpdate = vi.mocked(updateAiSettingsAction);

const settings: AiSettings = {
  is_enabled: true,
  monthly_budget_cents: 2000,
  daily_user_request_cap: 50,
  configured: true,
  plan_monthly_budget_cents: 20000,
  plan_daily_user_cap: 200,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AiSettingsPanel", () => {
  it("shows a read-only summary for a member (no edit controls)", () => {
    render(<AiSettingsPanel agencyId="a1" settings={settings} canEdit={false} />);

    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.getByText("$20.00")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument();
  });

  it("prefills the editable form for an owner/admin", () => {
    render(<AiSettingsPanel agencyId="a1" settings={settings} canEdit />);

    expect(screen.getByLabelText("Monthly budget (USD)")).toHaveValue(20);
    expect(screen.getByLabelText("Daily requests per person")).toHaveValue(50);
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("rejects an invalid daily cap before submitting", async () => {
    const user = userEvent.setup();
    render(<AiSettingsPanel agencyId="a1" settings={settings} canEdit />);

    await user.clear(screen.getByLabelText("Daily requests per person"));
    await user.type(screen.getByLabelText("Daily requests per person"), "0");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/whole number of at least 1/i)).toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("submits the budget in cents, shows success, and refreshes", async () => {
    mockedUpdate.mockResolvedValueOnce({ settings });
    const user = userEvent.setup();
    render(<AiSettingsPanel agencyId="a1" settings={settings} canEdit />);

    await user.clear(screen.getByLabelText("Monthly budget (USD)"));
    await user.type(screen.getByLabelText("Monthly budget (USD)"), "35.50");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("AI settings saved.")).toBeInTheDocument();
    expect(mockedUpdate).toHaveBeenCalledWith("a1", {
      isEnabled: true,
      monthlyBudgetCents: 3550,
      dailyUserRequestCap: 50,
    });
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("shows the server error on failure", async () => {
    mockedUpdate.mockResolvedValueOnce({ error: "Insufficient permissions for this agency" });
    const user = userEvent.setup();
    render(<AiSettingsPanel agencyId="a1" settings={settings} canEdit />);

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Insufficient permissions for this agency")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
