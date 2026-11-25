import { afterEach, describe, expect, it, vi } from "vitest";

const mockHeaderMap = new Headers();
vi.mock("next/headers", () => ({
  headers: async () => mockHeaderMap,
}));

import { clientIpHeaders, resolveClientIp, resolveClientUserAgent } from "@/lib/client-ip";

describe("resolveClientIp", () => {
  it("uses the first X-Forwarded-For hop by default", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    });
    expect(resolveClientIp(headers, "s3cret")).toBe("203.0.113.7");
  });

  it("trusts a forwarded client IP only with the shared secret", () => {
    const headers = new Headers({
      "x-forwarded-for": "10.0.0.5",
      "x-binx-client-ip": "203.0.113.9",
      "x-binx-proxy-secret": "s3cret",
    });
    expect(resolveClientIp(headers, "s3cret")).toBe("203.0.113.9");
  });

  it("ignores a forwarded client IP sent with the wrong secret", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.4",
      "x-binx-client-ip": "203.0.113.9",
      "x-binx-proxy-secret": "guess",
    });
    expect(resolveClientIp(headers, "s3cret")).toBe("198.51.100.4");
  });
});

describe("clientIpHeaders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const key of [...mockHeaderMap.keys()]) mockHeaderMap.delete(key);
  });

  it("sends nothing when the secret isn't configured", async () => {
    vi.stubEnv("PROXY_SHARED_SECRET", "");
    mockHeaderMap.set("x-forwarded-for", "203.0.113.7");
    expect(await clientIpHeaders()).toEqual({});
  });

  it("sends the visitor's IP with the secret when configured", async () => {
    vi.stubEnv("PROXY_SHARED_SECRET", "s3cret");
    mockHeaderMap.set("x-forwarded-for", "203.0.113.7");
    expect(await clientIpHeaders()).toEqual({
      "x-binx-client-ip": "203.0.113.7",
      "x-binx-proxy-secret": "s3cret",
    });
  });

  it("forwards the visitor's browser for signature evidence", async () => {
    vi.stubEnv("PROXY_SHARED_SECRET", "s3cret");
    mockHeaderMap.set("x-forwarded-for", "203.0.113.7");
    mockHeaderMap.set("user-agent", "Mozilla/5.0 (Chrome)");
    expect(await clientIpHeaders()).toEqual({
      "x-binx-client-ip": "203.0.113.7",
      "x-binx-proxy-secret": "s3cret",
      "x-binx-client-ua": "Mozilla/5.0 (Chrome)",
    });
  });
});

describe("resolveClientUserAgent", () => {
  it("trusts a forwarded browser only with the shared secret", () => {
    const forwarded = new Headers({
      "user-agent": "node",
      "x-binx-client-ua": "Mozilla/5.0 (Safari)",
      "x-binx-proxy-secret": "s3cret",
    });
    expect(resolveClientUserAgent(forwarded, "s3cret")).toBe("Mozilla/5.0 (Safari)");
    expect(resolveClientUserAgent(forwarded, "other")).toBe("node");
  });
});
