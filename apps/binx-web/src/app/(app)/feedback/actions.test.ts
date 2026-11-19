import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ refresh: vi.fn() }));

vi.mock("@/lib/feedback", () => ({
  submitFeedback: vi.fn(),
  answerPulse: vi.fn(),
  dismissPulse: vi.fn(),
  updateFeedback: vi.fn(),
}));

import { refresh } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import { dismissPulse, submitFeedback, updateFeedback } from "@/lib/feedback";
import {
  dismissPulseAction,
  submitFeedbackAction,
  updateFeedbackAction,
} from "./actions";

const mockedSubmit = vi.mocked(submitFeedback);
const mockedDismiss = vi.mocked(dismissPulse);
const mockedUpdate = vi.mocked(updateFeedback);

const INPUT = {
  surface: "app" as const,
  kind: "idea" as const,
  message: "Dark mode",
  allowContact: true,
  pagePath: "/dashboard",
  userAgent: null,
  viewport: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitFeedbackAction", () => {
  it("returns the saved feedback and refreshes", async () => {
    mockedSubmit.mockResolvedValueOnce({ id: "f1" } as never);
    await expect(submitFeedbackAction(INPUT)).resolves.toEqual({ feedback: { id: "f1" } });
    expect(refresh).toHaveBeenCalled();
  });

  it("rejects a blank message without calling the API", async () => {
    await expect(submitFeedbackAction({ ...INPUT, message: "   " })).resolves.toEqual({
      error: "Tell us a little about it",
    });
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  it("passes API errors through and hides unexpected ones", async () => {
    mockedSubmit.mockRejectedValueOnce(new AuthApiError("Slow down", 429));
    await expect(submitFeedbackAction(INPUT)).resolves.toEqual({ error: "Slow down" });
    mockedSubmit.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(submitFeedbackAction(INPUT)).resolves.toEqual({
      error: "Unable to send your feedback. Please try again.",
    });
  });
});

describe("dismissPulseAction", () => {
  it("dismisses by key", async () => {
    mockedDismiss.mockResolvedValueOnce();
    await expect(dismissPulseAction("first-week")).resolves.toEqual({});
    expect(mockedDismiss).toHaveBeenCalledWith("first-week");
  });
});

describe("updateFeedbackAction", () => {
  it("saves and refreshes the triage page", async () => {
    mockedUpdate.mockResolvedValueOnce({ id: "f1", status: "done" } as never);
    await expect(updateFeedbackAction("f1", { status: "done" })).resolves.toEqual({
      feedback: { id: "f1", status: "done" },
    });
    expect(mockedUpdate).toHaveBeenCalledWith("f1", { status: "done" });
    expect(refresh).toHaveBeenCalled();
  });

  it("reports a forbidden edit", async () => {
    mockedUpdate.mockRejectedValueOnce(new AuthApiError("Insufficient permissions", 403));
    await expect(updateFeedbackAction("f1", { status: "done" })).resolves.toEqual({
      error: "Insufficient permissions",
    });
  });
});
