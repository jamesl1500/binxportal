import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Plain-JS, zero-dependency script (it must run before `pnpm install`).
import { scanText, scanTree } from "../../../../scripts/check-code-integrity.mjs";

type Finding = { at: string; why: string };

const CLEAN_POSTCSS = `const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
`;

// The exact shape of the Sept–Nov 2026 injection, defanged: the trailing
// code is inert, but structurally identical (createRequire prelude, code
// hidden after hundreds of spaces on the export line, the campaign markers).
const INFECTED_POSTCSS =
  "import { createRequire } from 'node:module';\n" +
  "const require = createRequire(import.meta.url);\n" +
  CLEAN_POSTCSS.replace(
    "export default config;",
    "export default config;" +
      " ".repeat(400) +
      "global.o='8-hhn10697';var _$_6a5e=(function(m,h){var r=String.fromCharCode(127);return m.split(r)})('a',1);" +
      "global[_$_6a5e[0x0]]= require;var _$jsoPow,_$jsoIter;",
  );

const whys = (f: Finding[]) => f.map((x) => x.why).join("\n");

describe("check-code-integrity", () => {
  it("passes a clean config", () => {
    expect(scanText("apps/binx-web/postcss.config.mjs", CLEAN_POSTCSS)).toEqual([]);
  });

  it("flags the injected postcss config on several independent signals", () => {
    const findings: Finding[] = scanText("apps/binx-web/postcss.config.mjs", INFECTED_POSTCSS);
    const all = whys(findings);
    expect(all).toMatch(/hidden after a long run of whitespace/);
    expect(all).toMatch(/config file line is \d+ chars long/);
    expect(all).toMatch(/global\.o=/);
    expect(all).toMatch(/_\$jsoPow/);
    expect(all).toMatch(/exposes require on the global object/);
    expect(findings[0].at).toBe("apps/binx-web/postcss.config.mjs:9");
  });

  it("still catches whitespace-hidden code with no known marker (a variant)", () => {
    const variant = "module.exports = {};" + " ".repeat(200) + "doSomethingElse()";
    expect(whys(scanText("eslint.config.js", variant))).toMatch(/hidden after a long run/);
  });

  it("flags dynamic code evaluation only in tool-loaded config files", () => {
    const src = "const f = new Function('return 1');\nexport default {};\n";
    expect(whys(scanText("next.config.ts", src))).toMatch(/evaluates dynamically built code/);
    expect(scanText("src/lib/anything.ts", src)).toEqual([]);
  });

  it("does not flag ordinary long lines in non-config source", () => {
    const longString = `export const x = "${"a".repeat(2000)}";`;
    expect(scanText("src/lib/thing.ts", longString)).toEqual([]);
  });

  it("the binx-web app tree is clean right now", () => {
    // src/lib → binx-web root. Covers every config file Next/vitest/eslint load.
    const root = join(__dirname, "..", "..");
    expect(scanTree(root)).toEqual([]);
  });

  it("the committed postcss config is exactly the clean one", () => {
    const actual = readFileSync(join(__dirname, "..", "..", "postcss.config.mjs"), "utf8");
    expect(actual.replace(/\r\n/g, "\n")).toBe(CLEAN_POSTCSS);
  });
});
