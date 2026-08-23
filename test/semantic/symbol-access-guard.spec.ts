import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SEMANTIC_ROOT = path.resolve("packages/core/src/semantic");
const ALLOWED_FILES = new Set([
  path.resolve("packages/core/src/semantic/context.ts")
]);

const FORBIDDEN_PATTERNS = [
  "macroBindings.get(",
  "macroBindings.set(",
  "macroBindings.delete(",
  "colorAliases.get(",
  "colorAliases.set(",
  "colorAliases.delete("
];

function collectTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(abs));
      continue;
    }
    if (entry.isFile() && abs.endsWith(".ts")) {
      files.push(abs);
    }
  }
  return files;
}

describe("semantic symbol access guard", () => {
  it("disallows direct macro/color map reads and writes outside context accessors", () => {
    const offenders: string[] = [];
    const files = collectTsFiles(SEMANTIC_ROOT);
    for (const file of files) {
      if (ALLOWED_FILES.has(file)) {
        continue;
      }
      const source = fs.readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (source.includes(pattern)) {
          offenders.push(`${path.relative(process.cwd(), file)} => ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

