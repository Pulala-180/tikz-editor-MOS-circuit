import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadFixture(name: string): string {
  return readFileSync(join(process.cwd(), "test", "fixtures", name), "utf8");
}
