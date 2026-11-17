#!/usr/bin/env node
// Code-integrity guard: fails if any JS/TS file in the repo carries the
// shape of the config-file injection this repo was hit by (Sept–Nov 2026).
//
// The attack appends an obfuscated loader to the END of an existing line of a
// build config (postcss.config.mjs, eslint.config.js, …), pushed hundreds of
// columns to the right with spaces so it's invisible in an editor and in most
// diff views. Loading that config (`next dev`, `next build`, vitest with
// `css: true`, eslint's config loader) runs it. It then pulls a further
// payload from a blockchain transaction and `eval`s it.
//
// This script ONLY READS FILES AS TEXT. It never imports or executes any of
// them, so it's safe to run before `pnpm install` / `next build` — which is
// exactly where CI and the `dev`/`build`/`test` scripts run it. Zero deps:
// plain Node, so it works on a fresh checkout.
//
// Usage: node scripts/check-code-integrity.mjs [rootDir]

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".venv",
  "venv",
  "coverage",
  "playwright-report",
  "test-results",
  "dist",
  "build",
  "cdk.out",
  ".turbo",
  "__pycache__",
]);

const SCANNED_EXT = /\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/i;

// Files whose job is to be loaded *by tooling*: the injection's favourite
// targets. They get the stricter checks below.
const CONFIG_FILE =
  /(?:^|[\\/])(?:[\w.-]+\.config\.[cm]?[jt]s|\.eslintrc(?:\.[cm]?js)?|babel\.config\.[cm]?js|gulpfile\.[cm]?js|Gruntfile\.[cm]?js)$/i;

// Generated files that are legitimately long-lined.
const ALLOW_LONG_LINES = /(?:^|[\\/])(?:api-schema\.d\.ts|next-env\.d\.ts)$/;

const MARKER_EXEMPT = /(?:^|[\\/])check-code-integrity(?:\.test)?\.(?:mjs|ts)$/;

/** Known indicators from the decoded payload. */
export const MARKERS = [
  { re: /\bglobal\.o\s*=\s*['"]/, why: "loader campaign marker (global.o=…)" },
  { re: /_\$jso(?:Pow|Iter)\b/, why: "payload helper names (_$jsoPow/_$jsoIter)" },
  { re: /global\[_\$_[0-9a-f]{4}\[/, why: "obfuscated global[_$_xxxx[…]] write" },
  { re: /596dcc9fda875309ff85eba09cf5a97d/i, why: "payload C2 wallet fragment" },
  { re: /8l%Sljl>J>U61O,n/, why: "payload XOR key" },
  {
    re: /String\.fromCharCode\(127\)[\s\S]{0,200}\.split\(/,
    why: "string-shuffle decoder (fromCharCode(127) + split/join)",
  },
];

/** Scan one file's text. Returns a list of findings (empty = clean). */
export function scanText(path, text) {
  const findings = [];
  const isConfig = CONFIG_FILE.test(path);
  const lines = text.split(/\r?\n/);

  lines.forEach((line, i) => {
    const at = `${path}:${i + 1}`;
    // Code hidden off-screen: a long run of spaces/tabs with code after it.
    if (/\S[ \t]{80,}\S/.test(line)) {
      findings.push({ at, why: "code hidden after a long run of whitespace" });
    }
    if (isConfig && line.length > 400 && !ALLOW_LONG_LINES.test(path)) {
      findings.push({ at, why: `config file line is ${line.length} chars long` });
    }
  });

  // The guard and its test necessarily contain the marker strings
  // themselves; every other check still applies to them.
  const markers = MARKER_EXEMPT.test(path) ? [] : MARKERS;
  for (const { re, why } of markers) {
    const m = re.exec(text);
    if (m) {
      const lineNo = text.slice(0, m.index).split("\n").length;
      findings.push({ at: `${path}:${lineNo}`, why });
    }
  }

  if (isConfig) {
    // A build config has no business building code at runtime or exposing
    // `require` on the global object.
    if (/\bnew\s+Function\s*\(|\[\s*['"]constructor['"]\s*\]\s*\(|\beval\s*\(/.test(text)) {
      findings.push({ at: path, why: "config file evaluates dynamically built code" });
    }
    // Allows one level of nested brackets: `global[_$_6a5e[0x0]] = require`.
    if (/\bglobal(?:This)?\s*(?:\[(?:[^[\]]|\[[^\]]*\])+\]|\.\w+)\s*=\s*require\b/.test(text)) {
      findings.push({ at: path, why: "config file exposes require on the global object" });
    }
  }
  return findings;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) yield* walk(full);
    // Skip anything big — real sources here are tiny; this keeps the scan
    // fast and avoids generated bundles.
    else if (SCANNED_EXT.test(name) && st.size < 2_000_000) yield full;
  }
}

export function scanTree(root) {
  const findings = [];
  for (const file of walk(root)) {
    const rel = relative(root, file);
    findings.push(...scanText(rel, readFileSync(file, "utf8")));
  }
  return findings;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
  const findings = scanTree(root);
  if (findings.length) {
    console.error("\n✖ Code-integrity check FAILED — possible injected code:\n");
    for (const f of findings) console.error(`  ${f.at}\n      ${f.why}`);
    console.error(
      "\nDo NOT run dev/build/test until this is investigated. See docs/security/2026-11-config-injection.md.\n",
    );
    process.exit(1);
  }
  console.log(`✓ Code-integrity check passed (${root})`);
}
