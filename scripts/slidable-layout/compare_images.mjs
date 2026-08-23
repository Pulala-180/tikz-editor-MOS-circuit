import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const vision = "C:/Users/gd180/.dsh/skills/visionmax/scripts/vision.mjs";
const prompt = readFileSync(path.join(dir, "compare_prompt.md"), "utf-8");

const [original, generated, out = path.join(dir, "gemini_diff.md")] = process.argv.slice(2);
if (!original || !generated) {
  console.error("usage: node compare_images.mjs <original-image> <generated-image> [out.md]");
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  [vision, original, generated, prompt],
  { encoding: "utf-8", timeout: 180000, maxBuffer: 16 * 1024 * 1024 }
);

const report = [
  result.stdout?.trim() || "(no stdout)",
  result.stderr?.trim() ? "\n--- vision.mjs stderr ---\n" + result.stderr.trim() : "",
].join("\n");

writeFileSync(out, report, "utf-8");
console.log(`wrote ${out}`);
if (result.status !== 0) process.exit(result.status ?? 1);
