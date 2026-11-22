import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));

import { buildServerReport, reportServerError } from "./error-reporting-server";

const info = {
  path: "/projects/abc?tab=files",
  method: "GET",
  headers: {
    cookie: "theme=dark; binx_access_token=tok%2E123; other=1",
    "user-agent": "Mozilla/5.0",
    "x-forwarded-for": "203.0.113.7, 10.0.0.1",
  },
};
const context = {
  routePath: "/(app)/projects/[projectId]",
  routeType: "render",
};

describe("buildServerReport", () => {
  it("describes the error and where it happened", () => {
    const report = buildServerReport(
      new Error("render failed"),
      info,
      context,
      "evt",
    );
    expect(report).toMatchObject({
      runtime: "server",
      level: "error",
      error_type: "Error",
      message: "render failed",
      path: "/projects/abc",
      method: "GET",
      route: "/(app)/projects/[projectId]",
      route_type: "render",
      sentry_event_id: "evt",
      user_agent: "Mozilla/5.0",
    });
  });

  it("skips Next's redirect/notFound control flow", () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    expect(buildServerReport(redirect, info, context)).toBeNull();
    const notFound = Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(buildServerReport(notFound, info, context)).toBeNull();
  });

  it("skips errors binx-api already recorded", () => {
    const relayed = new Error(
      "Something went wrong on our end. Reference: 7F3A9C21",
    );
    expect(buildServerReport(relayed, info, context)).toBeNull();
  });

  it("treats an API 4xx that broke the page as a warning", () => {
    const forbidden = Object.assign(new Error("Insufficient permissions"), {
      status: 403,
    });
    expect(buildServerReport(forbidden, info, context)?.level).toBe("warning");
  });
});

describe("reportServerError", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test/");
    vi.stubEnv("PROXY_SHARED_SECRET", "");
    fetchMock
      .mockReset()
      .mockResolvedValue(new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("posts to binx-api with the visitor's token", async () => {
    await reportServerError(new Error("boom"), info, context);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/errors/report");
    expect(init.headers.authorization).toBe("Bearer tok.123");
    expect(init.headers["x-binx-client-ip"]).toBeUndefined();
    expect(JSON.parse(init.body).message).toBe("boom");
  });

  it("forwards the visitor's IP when the proxy secret is set", async () => {
    vi.stubEnv("PROXY_SHARED_SECRET", "s3cret");
    await reportServerError(new Error("boom"), info, context);
    const { headers } = fetchMock.mock.calls[0][1];
    expect(headers["x-binx-client-ip"]).toBe("203.0.113.7");
    expect(headers["x-binx-proxy-secret"]).toBe("s3cret");
  });

  it("never throws when binx-api is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(
      reportServerError(new Error("boom"), info, context),
    ).resolves.toBeUndefined();
  });

  it("sends nothing it should skip", async () => {
    await reportServerError(new Error("x. Reference: 7F3A9C21"), info, context);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
