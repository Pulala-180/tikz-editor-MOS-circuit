import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const TRACES_DIR = path.join(THIS_DIR, "traces");

async function startCDPProfile(page: import("@playwright/test").Page) {
  const client = await page.context().newCDPSession(page);
  await client.send("Profiler.enable");
  await client.send("Profiler.start");
  return client;
}

async function stopCDPProfile(client: import("playwright-core").CDPSession, filename: string): Promise<string> {
  const { profile } = await client.send("Profiler.stop");
  await client.send("Profiler.disable");

  fs.mkdirSync(TRACES_DIR, { recursive: true });
  const outPath = path.join(TRACES_DIR, filename);
  fs.writeFileSync(outPath, JSON.stringify(profile, null, 2), "utf8");
  return outPath;
}

test("profile landing page animation loop", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const client = await startCDPProfile(page);
  await page.waitForTimeout(10000);
  const reportPath = await stopCDPProfile(client, "landing-home.cpuprofile");
  console.log(`[profiling] wrote ${reportPath}`);
});
