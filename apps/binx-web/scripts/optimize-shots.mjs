/**
 * optimize-shots.mjs
 *
 * Turns the raw PNGs from `e2e/capture-marketing.spec.ts` into the committed
 * marketing images: resized to a sensible width and re-encoded as WebP.
 *
 *   node scripts/optimize-shots.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "e2e", "screenshots");
const outDir = path.join(root, "public", "marketing");

const TARGETS = ["portal", "canvas", "invoicing", "dashboard"];
const WIDTH = 1600;

fs.mkdirSync(outDir, { recursive: true });

let done = 0;
for (const name of TARGETS) {
  const src = path.join(srcDir, `${name}.png`);
  if (!fs.existsSync(src)) {
    console.warn(`skip ${name}: ${path.relative(root, src)} not found (run the @screenshots spec first)`);
    continue;
  }
  const out = path.join(outDir, `${name}.webp`);
  await sharp(src)
    .resize({ width: WIDTH, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(out);
  const { size } = fs.statSync(out);
  console.log(`${name}.webp  ${(size / 1024).toFixed(0)} KB`);
  done += 1;
}

console.log(`\n${done} image(s) written to ${path.relative(root, outDir)}`);
