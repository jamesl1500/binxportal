import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import robots, { APP_SEGMENTS } from "@/app/robots";

describe("robots", () => {
  it("disallows every top-level route in the (app) group", () => {
    const appDir = path.join(__dirname, "(app)");
    const segments = readdirSync(appDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      expect(APP_SEGMENTS).toContain(segment);
    }
  });

  it("disallows the public proposal share page", () => {
    const rules = robots().rules;
    const disallow = Array.isArray(rules) ? rules.flatMap((r) => r.disallow ?? []) : rules.disallow;
    expect(disallow).toContain("/proposals");
  });
});
