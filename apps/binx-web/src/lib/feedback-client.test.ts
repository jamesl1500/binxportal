import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureFeedbackContext,
  feedbackHistoryPath,
  parseInboxFilter,
} from "@/lib/feedback-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("feedbackHistoryPath", () => {
  it("sends portal clients to the portal page and staff to /feedback", () => {
    expect(feedbackHistoryPath("portal")).toBe("/portal/feedback");
    expect(feedbackHistoryPath("app")).toBe("/feedback");
  });
});

describe("captureFeedbackContext", () => {
  it("records the path, browser and viewport", () => {
    window.innerWidth = 1280;
    window.innerHeight = 720;
    const context = captureFeedbackContext("/invoices/abc");
    expect(context.pagePath).toBe("/invoices/abc");
    expect(context.viewport).toBe("1280x720");
    expect(context.userAgent).toBe(window.navigator.userAgent);
  });

  it("never includes the query string (it can carry tokens)", () => {
    window.history.pushState({}, "", "/auth/reset-password?token=secret");
    const context = captureFeedbackContext();
    expect(context.pagePath).toBe("/auth/reset-password");
    expect(JSON.stringify(context)).not.toContain("secret");
    window.history.pushState({}, "", "/");
  });

  it("clips an absurdly long path to the API's limit", () => {
    expect(captureFeedbackContext(`/${"a".repeat(900)}`).pagePath).toHaveLength(512);
  });
});

describe("parseInboxFilter", () => {
  it("defaults to the open view", () => {
    expect(parseInboxFilter({})).toEqual({
      status: "open",
      kind: undefined,
      surface: undefined,
      q: undefined,
      offset: 0,
    });
  });

  it("maps status=all to no status filter", () => {
    expect(parseInboxFilter({ status: "all" }).status).toBeUndefined();
  });

  it("keeps valid values", () => {
    expect(
      parseInboxFilter({ status: "planned", kind: "pulse", surface: "portal", q: "  logo ", offset: "25" }),
    ).toEqual({ status: "planned", kind: "pulse", surface: "portal", q: "logo", offset: 25 });
  });

  it("drops anything binx-api would reject instead of erroring the page", () => {
    expect(
      parseInboxFilter({ status: "bogus", kind: "rant", surface: "email", offset: "-5", q: "   " }),
    ).toEqual({ status: "open", kind: undefined, surface: undefined, q: undefined, offset: 0 });
    expect(parseInboxFilter({ offset: "abc" }).offset).toBe(0);
  });
});
