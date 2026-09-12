import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai", () => ({
  generateProjectSummary: vi.fn(),
  suggestProjectTasks: vi.fn(),
  applyProjectTaskSuggestions: vi.fn(),
}));

import { applyProjectTaskSuggestions, generateProjectSummary, suggestProjectTasks } from "@/lib/ai";
import { AuthApiError } from "@/lib/auth";
import {
  applyProjectTaskSuggestionsAction,
  generateProjectSummaryAction,
  suggestProjectTasksAction,
} from "./actions";

const mockedSummary = vi.mocked(generateProjectSummary);
const mockedSuggest = vi.mocked(suggestProjectTasks);
const mockedApply = vi.mocked(applyProjectTaskSuggestions);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateProjectSummaryAction", () => {
  it("returns the draft on success", async () => {
    mockedSummary.mockResolvedValueOnce("Great progress this week.");
    await expect(generateProjectSummaryAction("a1", "p1")).resolves.toEqual({ draft: "Great progress this week." });
  });

  it("returns the AuthApiError message on failure", async () => {
    mockedSummary.mockRejectedValueOnce(new AuthApiError("nope", 429));
    await expect(generateProjectSummaryAction("a1", "p1")).resolves.toEqual({ error: "nope" });
  });
});

describe("suggestProjectTasksAction", () => {
  it("returns the suggested lists on success", async () => {
    const suggestions = { lists: [{ name: "Discovery", tasks: [{ title: "Kickoff call", description: null }] }] };
    mockedSuggest.mockResolvedValueOnce(suggestions);
    await expect(suggestProjectTasksAction("a1", "p1")).resolves.toEqual({ suggestions });
  });

  it("falls back to a generic message on a non-auth error", async () => {
    mockedSuggest.mockRejectedValueOnce(new Error("boom"));
    await expect(suggestProjectTasksAction("a1", "p1")).resolves.toEqual({
      error: "Unable to suggest a starter task list",
    });
  });
});

describe("applyProjectTaskSuggestionsAction", () => {
  it("returns no error on success", async () => {
    mockedApply.mockResolvedValueOnce(undefined);
    const suggestions = { lists: [{ name: "Discovery", tasks: [{ title: "Kickoff call", description: null }] }] };
    await expect(applyProjectTaskSuggestionsAction("a1", "p1", suggestions)).resolves.toEqual({});
    expect(mockedApply).toHaveBeenCalledWith("a1", "p1", suggestions);
  });

  it("surfaces the AuthApiError message on failure", async () => {
    mockedApply.mockRejectedValueOnce(new AuthApiError("This agency's $20.00 monthly AI budget is used up.", 429));
    await expect(applyProjectTaskSuggestionsAction("a1", "p1", { lists: [] })).resolves.toEqual({
      error: "This agency's $20.00 monthly AI budget is used up.",
    });
  });
});
