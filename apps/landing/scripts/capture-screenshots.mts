import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type ViewportSize } from "@playwright/test";

type CaptureTarget = {
  name: string;
  viewport: ViewportSize;
};

type Options = {
  url: string;
  outDir: string;
  waitMs: number;
  fullPage: boolean;
  targets: CaptureTarget[];
};

const DEFAULT_TARGETS: CaptureTarget[] = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } }
];

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await mkdir(options.outDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      reducedMotion: "no-preference"
    });
    const page = await context.newPage();

    for (const target of options.targets) {
      await page.setViewportSize(target.viewport);
      await page.goto(options.url, { waitUntil: "networkidle" });
      await page.waitForTimeout(options.waitMs);

      const outputPath = path.join(options.outDir, `${target.name}.png`);
      await page.screenshot({
        path: outputPath,
        fullPage: options.fullPage,
        type: "png"
      });
      console.log(`[landing-screenshots] wrote ${outputPath}`);
    }

    await context.close();
  } finally {
    await browser.close();
  }
}

function parseArgs(args: string[]): Options {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const landingDir = path.resolve(scriptDir, "..");
  const options: Options = {
    url: "http://127.0.0.1:5173/",
    outDir: path.resolve(landingDir, "artifacts/screenshots"),
    waitMs: 500,
    fullPage: true,
    targets: DEFAULT_TARGETS
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--url" && next) {
      options.url = next;
      index++;
      continue;
    }

    if (arg === "--out" && next) {
      options.outDir = path.resolve(next);
      index++;
      continue;
    }

    if (arg === "--wait-ms" && next) {
      options.waitMs = Number(next);
      index++;
      continue;
    }

    if (arg === "--viewport" && next) {
      options.targets = [...(options.targets === DEFAULT_TARGETS ? [] : options.targets), parseViewport(next)];
      index++;
      continue;
    }

    if (arg === "--viewport-only" && next) {
      options.targets = [parseViewport(next)];
      index++;
      continue;
    }

    if (arg === "--viewport-only") {
      throw new Error("--viewport-only requires a value like desktop:1440x1000");
    }

    if (arg === "--viewport") {
      throw new Error("--viewport requires a value like desktop:1440x1000");
    }

    if (arg === "--no-full-page") {
      options.fullPage = false;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(options.waitMs) || options.waitMs < 0) {
    throw new Error("--wait-ms must be a non-negative number");
  }

  return options;
}

function parseViewport(raw: string): CaptureTarget {
  const match = /^([a-zA-Z0-9_-]+):(\d+)x(\d+)$/.exec(raw);
  if (!match) {
    throw new Error(`Invalid viewport "${raw}". Use name:WIDTHxHEIGHT, for example desktop:1440x1000.`);
  }

  return {
    name: match[1],
    viewport: {
      width: Number(match[2]),
      height: Number(match[3])
    }
  };
}

function printHelp(): void {
  console.log(`Capture landing page screenshots.

Usage:
  npm run capture:landing-screenshots
  npm run capture:landing-screenshots -- --url http://127.0.0.1:4175 --out apps/landing/artifacts/screenshots
  npm run capture:landing-screenshots -- --viewport-only desktop:1440x1000
  npm run capture:landing-screenshots -- --viewport tablet:900x1100 --viewport mobile:390x844

Options:
  --url URL                 Landing page URL. Defaults to http://127.0.0.1:5173/
  --out DIR                 Output directory. Defaults to apps/landing/artifacts/screenshots
  --wait-ms MS              Extra wait after page load. Defaults to 500
  --viewport NAME:WIDTHxHEIGHT
                            Add a viewport. Replaces defaults on first use.
  --viewport-only NAME:WIDTHxHEIGHT
                            Capture one viewport only.
  --no-full-page            Capture only the viewport instead of the full page.
`);
}

void main().catch((error) => {
  console.error("[landing-screenshots] failed:", error);
  process.exitCode = 1;
});
