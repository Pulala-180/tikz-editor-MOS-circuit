#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compareTikzRenderers, RendererComparisonError } from "./compare-tikz-renderers.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultInputDir = join(repoRoot, "docs", "comparison-inputs");
const defaultOutDir = join(repoRoot, "artifacts", "renderer-compare");
const validReferenceModes = new Set(["pdf-png", "dvisvgm-svg", "dvisvgm-svg-png"]);
const defaultDiffThresholdPercentByFixture = {
  "arrows-01-common-tips": 1.5,
  "arrows-02-curves-bending": 3.5,
  "arrows-03-multi-tips": 1.5,
  "arrows-04-colors-reversed": 2.0
};

if (isMain(import.meta.url)) {
  await runCli();
}

async function runCli() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printUsage();
      process.exit(0);
    }

    const inputDir = resolve(args.inputDir ?? defaultInputDir);
    const outDir = resolve(args.outDir ?? defaultOutDir);
    const files = collectTexFiles(inputDir);
    if (files.length === 0) {
      throw new Error(`No .tex files found in input directory: ${inputDir}`);
    }

    mkdirSync(outDir, { recursive: true });
    const entries = [];
    let okCount = 0;
    let failCount = 0;
    let thresholdFailCount = 0;

    for (let index = 0; index < files.length; index += 1) {
      const filePath = files[index];
      const runName = basename(filePath, extname(filePath));
      process.stdout.write(`[${index + 1}/${files.length}] ${runName}\n`);

      try {
        const result = await compareTikzRenderers({
          inputPath: filePath,
          outDir,
          name: runName,
          includeTimestamp: args.includeTimestamp,
          referenceMode: args.referenceMode
        });

        const thresholdPercent = defaultDiffThresholdPercentByFixture[runName] ?? null;
        const diff = computeNormalizedPixelDiffPercent(
          result.outputs.oursComparablePng ?? null,
          result.outputs.latexComparablePng ?? null,
          result.runDir
        );
        const thresholdPassed =
          thresholdPercent == null || !diff.ok ? null : diff.normalizedPercent <= thresholdPercent;

        const entry = {
          name: runName,
          filePath,
          status: "ok",
          runDir: result.runDir,
          reportPath: result.reportPath,
          diff,
          thresholdPercent,
          thresholdPassed
        };

        const thresholdFailed =
          thresholdPercent != null &&
          args.enforceThresholds &&
          (!diff.ok || (typeof thresholdPassed === "boolean" && !thresholdPassed));
        if (thresholdFailed) {
          thresholdFailCount += 1;
          failCount += 1;
          entry.status = "threshold-failed";
          entry.error = diff.ok
            ? `Normalized pixel diff ${diff.normalizedPercent.toFixed(4)}% exceeds threshold ${thresholdPercent.toFixed(4)}%.`
            : `Unable to compute normalized diff: ${diff.error}`;
          entries.push(entry);

          if (!args.continueOnError) {
            throw new Error(`[${runName}] ${entry.error}`);
          }
          continue;
        }

        okCount += 1;
        entries.push(entry);
      } catch (error) {
        failCount += 1;
        if (error instanceof RendererComparisonError) {
          entries.push({
            name: runName,
            filePath,
            status: "error",
            runDir: error.runDir ?? null,
            reportPath: error.reportPath ?? null,
            error: error.message
          });
          if (!args.continueOnError) {
            throw error;
          }
        } else {
          entries.push({
            name: runName,
            filePath,
            status: "error",
            runDir: null,
            reportPath: null,
            error: error instanceof Error ? error.message : String(error)
          });
          if (!args.continueOnError) {
            throw error;
          }
        }
      }
    }

    const manifest = {
      generatedAt: new Date().toISOString(),
      inputDir,
      outDir,
      referenceMode: args.referenceMode,
      includeTimestamp: args.includeTimestamp,
      enforceThresholds: args.enforceThresholds,
      totals: {
        fixtures: files.length,
        succeeded: okCount,
        failed: failCount,
        thresholdFailed: thresholdFailCount
      },
      entries
    };

    const manifestName = args.includeTimestamp
      ? `arrow-comparison-manifest-${timestampSlug()}.json`
      : "arrow-comparison-manifest.json";
    const manifestPath = join(outDir, manifestName);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    console.log(
      JSON.stringify(
        {
          inputDir,
          outDir,
          manifestPath,
          totals: manifest.totals
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function parseArgs(argv) {
  const parsed = {
    inputDir: null,
    outDir: null,
    includeTimestamp: false,
    continueOnError: false,
    referenceMode: "pdf-png",
    enforceThresholds: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--input-dir") {
      parsed.inputDir = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--out-dir") {
      parsed.outDir = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--with-timestamp") {
      parsed.includeTimestamp = true;
      continue;
    }
    if (arg === "--continue-on-error") {
      parsed.continueOnError = true;
      continue;
    }
    if (arg === "--reference-mode") {
      const mode = argv[i + 1] ?? "";
      if (!validReferenceModes.has(mode)) {
        throw new Error(`--reference-mode must be one of: ${[...validReferenceModes].join(", ")}.`);
      }
      parsed.referenceMode = mode;
      i += 1;
      continue;
    }
    if (arg === "--enforce-thresholds") {
      parsed.enforceThresholds = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function collectTexFiles(inputDir) {
  if (!existsSync(inputDir)) {
    throw new Error(`Input directory not found: ${inputDir}`);
  }

  const entries = readdirSync(inputDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tex"))
    .map((entry) => join(inputDir, entry.name));
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function printUsage() {
  console.log(`Usage:
  node scripts/compare-arrow-fixtures.mjs
  node scripts/compare-arrow-fixtures.mjs --reference-mode dvisvgm-svg
  node scripts/compare-arrow-fixtures.mjs --with-timestamp
  node scripts/compare-arrow-fixtures.mjs --continue-on-error
  node scripts/compare-arrow-fixtures.mjs --enforce-thresholds

Defaults:
  --input-dir ${defaultInputDir}
  --out-dir ${defaultOutDir}
  --reference-mode pdf-png
  writes deterministic run directories (no timestamp)
  threshold checks (when enabled):
    arrows-01-common-tips <= 1.5%
    arrows-02-curves-bending <= 3.5%
    arrows-03-multi-tips <= 1.5%
    arrows-04-colors-reversed <= 2.0%
`);
}

function computeNormalizedPixelDiffPercent(oursPngPath, referencePngPath, scratchDir) {
  if (!oursPngPath || !referencePngPath) {
    return { ok: false, error: "Comparable PNG assets are missing for one or both renderers." };
  }
  if (!existsSync(oursPngPath) || !existsSync(referencePngPath)) {
    return { ok: false, error: "Comparable PNG file not found." };
  }

  const oursSize = identifyPngSize(oursPngPath);
  const referenceSize = identifyPngSize(referencePngPath);
  if (!oursSize || !referenceSize) {
    return { ok: false, error: "Unable to read comparable PNG dimensions with ImageMagick identify." };
  }
  let oursComparablePath = oursPngPath;
  let referenceComparablePath = referencePngPath;
  let width = oursSize.width;
  let height = oursSize.height;
  if (oursSize.width !== referenceSize.width || oursSize.height !== referenceSize.height) {
    const targetWidth = Math.max(oursSize.width, referenceSize.width);
    const targetHeight = Math.max(oursSize.height, referenceSize.height);
    const oursExpandedPath = join(scratchDir, "ours-comparable-for-diff.png");
    const referenceExpandedPath = join(scratchDir, "latex-comparable-for-diff.png");
    if (!padPngToExtent(oursPngPath, oursExpandedPath, targetWidth, targetHeight)) {
      return {
        ok: false,
        error: `Failed to normalize renderer comparable PNG size (${oursSize.width}x${oursSize.height}) to ${targetWidth}x${targetHeight}.`
      };
    }
    if (!padPngToExtent(referencePngPath, referenceExpandedPath, targetWidth, targetHeight)) {
      return {
        ok: false,
        error: `Failed to normalize reference comparable PNG size (${referenceSize.width}x${referenceSize.height}) to ${targetWidth}x${targetHeight}.`
      };
    }
    oursComparablePath = oursExpandedPath;
    referenceComparablePath = referenceExpandedPath;
    width = targetWidth;
    height = targetHeight;
  }

  const compare = runCommand("magick", ["compare", "-metric", "AE", oursComparablePath, referenceComparablePath, "null:"]);
  if (!(compare.status === 0 || compare.status === 1)) {
    return {
      ok: false,
      error: compare.stderr.trim() || compare.stdout.trim() || "ImageMagick compare failed."
    };
  }

  const metricText = `${compare.stderr}\n${compare.stdout}`;
  const metricMatch = metricText.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);
  if (!metricMatch) {
    return {
      ok: false,
      error: "ImageMagick compare did not return an AE metric."
    };
  }

  const differingPixels = Number.parseFloat(metricMatch[0]);
  if (!Number.isFinite(differingPixels)) {
    return {
      ok: false,
      error: `Invalid AE metric: ${metricMatch[0]}`
    };
  }

  const totalPixels = width * height;
  if (totalPixels <= 0) {
    return {
      ok: false,
      error: "Invalid comparable image size (no pixels)."
    };
  }

  const normalizedPercent = (differingPixels / totalPixels) * 100;
  return {
    ok: true,
    differingPixels,
    totalPixels,
    normalizedPercent
  };
}

function identifyPngSize(pngPath) {
  const identified = runCommand("magick", ["identify", "-format", "%w %h", pngPath]);
  if (identified.status !== 0) {
    return null;
  }
  const [widthRaw, heightRaw] = identified.stdout.trim().split(/\s+/);
  const width = Number.parseInt(widthRaw ?? "", 10);
  const height = Number.parseInt(heightRaw ?? "", 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function padPngToExtent(inputPath, outputPath, width, height) {
  const result = runCommand("magick", [
    inputPath,
    "-background",
    "white",
    "-gravity",
    "northwest",
    "-extent",
    `${width}x${height}`,
    outputPath
  ]);
  return result.status === 0 && existsSync(outputPath);
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function isMain(metaUrl) {
  if (!process.argv[1]) {
    return false;
  }
  return fileURLToPath(metaUrl) === resolve(process.argv[1]);
}
