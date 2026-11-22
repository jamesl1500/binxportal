import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reportToSentry = vi.fn();
vi.mock("@/lib/sentry-client", () => ({
  reportError: (...args: unknown[]) => reportToSentry(...args),
}));

import {
  ERRORS_ENDPOINT,
  MAX_REPORTS_PER_PAGE,
  reportClientError,
  resetReportedErrors,
} from "./error-reporting";

const fetchMock = vi.fn();

beforeEach(() => {
  resetReportedErrors();
  reportToSentry.mockReset().mockResolvedValue("sentry-event-1");
  fetchMock
    .mockReset()
    .mockResolvedValue(
      new Response(JSON.stringify({ reference: "7F3A9C21" }), { status: 202 }),
    );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sentBody(call = 0) {
  return JSON.parse(fetchMock.mock.calls[call][1].body as string);
}

describe("reportClientError", () => {
  it("sends to Sentry, then to the Binx log with Sentry's event id", async () => {
    const reference = await reportClientError(new TypeError("x is undefined"), {
      source: "error-boundary",
    });

    expect(reference).toBe("7F3A9C21");
    expect(reportToSentry).toHaveBeenCalledWith(expect.any(TypeError), {
      binx_source: "error-boundary",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      ERRORS_ENDPOINT,
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
    expect(sentBody()).toMatchObject({
      runtime: "browser",
      level: "error",
      error_type: "TypeError",
      message: "x is undefined",
      sentry_event_id: "sentry-event-1",
      route_type: "error-boundary",
      path: "/",
    });
  });

  it("still reports to Binx when Sentry is off or fails", async () => {
    reportToSentry.mockRejectedValueOnce(new Error("sdk failed to load"));
    expect(await reportClientError(new Error("boom"))).toBe("7F3A9C21");
    expect(sentBody().sentry_event_id).toBeUndefined();
  });

  it("sends the same error only once per page", async () => {
    await reportClientError(new Error("same"));
    expect(await reportClientError(new Error("same"))).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it(`stops after ${MAX_REPORTS_PER_PAGE} reports`, async () => {
    for (let i = 0; i < MAX_REPORTS_PER_PAGE + 3; i += 1) {
      await reportClientError(new Error(`error ${i}`));
    }
    expect(fetchMock).toHaveBeenCalledTimes(MAX_REPORTS_PER_PAGE);
  });

  it("drops noise entirely", async () => {
    expect(
      await reportClientError(new Error("Transition was skipped")),
    ).toBeUndefined();
    expect(reportToSentry).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never rejects when the report can't be sent", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(
      reportClientError(new Error("offline")),
    ).resolves.toBeUndefined();

    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    await expect(
      reportClientError(new Error("server down")),
    ).resolves.toBeUndefined();
  });
});
