import { describe, expect, it } from "vitest";

import nextConfig, { securityHeaders } from "../../next.config";

describe("next.config security headers", () => {
  it("applies the baseline headers to every path", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toEqual([{ source: "/:path*", headers: securityHeaders }]);
  });

  it("sets HSTS, nosniff, anti-framing, referrer and permissions policies", () => {
    const h = Object.fromEntries(securityHeaders.map(({ key, value }) => [key, value]));
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d{8,}/);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toContain("camera=()");
  });

  it("does not advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
