import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AiUsageSummary } from "@/lib/ai";

import AiUsagePanel from "./AiUsagePanel";

const base: AiUsageSummary = {
  configured: true,
  is_enabled: true,
  monthly_budget_cents: 2000,
  month_spent_cents: 500,
  daily_user_request_cap: 50,
  today_request_count: 3,
  plan_monthly_budget_cents: 20000,
  plan_daily_user_cap: 200,
  recent_events: [],
};

describe("AiUsagePanel", () => {
  it("shows a friendly message when AI isn't configured", () => {
    render(<AiUsagePanel usage={{ ...base, configured: false }} />);
    expect(screen.getByText(/no anthropic api key is configured/i)).toBeInTheDocument();
  });

  it("renders the spend-vs-budget percentage and today's count", () => {
    render(<AiUsagePanel usage={base} />);
    expect(screen.getByText("$5.00 of $20.00 this month")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("flags an over-budget agency", () => {
    render(<AiUsagePanel usage={{ ...base, month_spent_cents: 2500 }} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText(/budget is used up/i)).toBeInTheDocument();
  });

  it("shows an empty state with no usage yet", () => {
    render(<AiUsagePanel usage={base} />);
    expect(screen.getByText("No AI calls yet.")).toBeInTheDocument();
  });

  it("lists recent events with feature label and status", () => {
    render(
      <AiUsagePanel
        usage={{
          ...base,
          recent_events: [
            {
              id: "e1",
              feature: "lead_analysis",
              model: "claude-opus-5",
              input_tokens: 1000,
              output_tokens: 200,
              cost_cents: 3,
              status: "ok",
              error_message: null,
              user_name: "Olivia Owner",
              created_at: new Date().toISOString(),
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Lead analysis")).toBeInTheDocument();
    expect(screen.getByText("Olivia Owner")).toBeInTheDocument();
    expect(screen.getByText("ok")).toBeInTheDocument();
  });
});
