#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";

main();

function main() {
  const argv = process.argv.slice(2);
  const subcommand = argv[0];
  if (subcommand === "compare") {
    const options = parseCompareArgs(argv.slice(1));
    const result = compareProfiles(options);
    outputResult(result, options.json);
    return;
  }
  if (subcommand === "compare-report") {
    const options = parseCompareReportArgs(argv.slice(1));
    const result = compareReports(options.leftReportPath, options.rightReportPath);
    outputResult(result, options.json);
    return;
  }

  const options = parseAnalyzeArgs(argv);
  const result = analyzeProfile(options.profilePath, {
    distDir: options.distDir,
    limit: options.limit,
    appOnly: options.appOnly
  });
  outputResult(result, options.json);
}

function usage() {
  console.error(`Usage:
  node scripts/analyze-cpuprofile.mjs <profile.cpuprofile> [limit] [--dist <dist-dir>] [--json] [--app-only]
  node scripts/analyze-cpuprofile.mjs compare <left.cpuprofile> <right.cpuprofile> [limit] [--dist <dist-dir>] [--dist-left <dir>] [--dist-right <dir>] [--json] [--app-only]
  node scripts/analyze-cpuprofile.mjs compare-report <left-report.json> <right-report.json> [--json]`);
  process.exit(1);
}

function parseAnalyzeArgs(argv) {
  const positional = [];
  let distDir = null;
  let json = false;
  let appOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dist") {
      distDir = argv[++index] ?? null;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--app-only") {
      appOnly = true;
      continue;
    }
    positional.push(arg);
  }
  const profilePath = positional[0];
  const limit = Number(positional[1] ?? 25);
  if (!profilePath) {
    usage();
  }
  return {
    profilePath,
    limit,
    distDir,
    json,
    appOnly
  };
}

function parseCompareArgs(argv) {
  const positional = [];
  let distDir = null;
  let distLeft = null;
  let distRight = null;
  let json = false;
  let appOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dist") {
      distDir = argv[++index] ?? null;
      continue;
    }
    if (arg === "--dist-left") {
      distLeft = argv[++index] ?? null;
      continue;
    }
    if (arg === "--dist-right") {
      distRight = argv[++index] ?? null;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--app-only") {
      appOnly = true;
      continue;
    }
    positional.push(arg);
  }
  const [leftProfilePath, rightProfilePath] = positional;
  const limit = Number(positional[2] ?? 25);
  if (!leftProfilePath || !rightProfilePath) {
    usage();
  }
  return {
    leftProfilePath,
    rightProfilePath,
    limit,
    distLeft: distLeft ?? distDir,
    distRight: distRight ?? distDir,
    json,
    appOnly
  };
}

function parseCompareReportArgs(argv) {
  const positional = [];
  let json = false;
  for (const arg of argv) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    positional.push(arg);
  }
  const [leftReportPath, rightReportPath] = positional;
  if (!leftReportPath || !rightReportPath) {
    usage();
  }
  return {
    leftReportPath,
    rightReportPath,
    json
  };
}

function createResolver(distDir) {
  const sourceMaps = new Map();

  function loadSourceMap(url) {
    if (!distDir || !url) {
      return null;
    }
    const basename = url.split("/").pop();
    if (!basename || !basename.endsWith(".js")) {
      return null;
    }
    if (sourceMaps.has(basename)) {
      return sourceMaps.get(basename);
    }
    const mapPath = path.join(distDir, "assets", `${basename}.map`);
    try {
      const mapRaw = JSON.parse(fs.readFileSync(mapPath, "utf8"));
      const tracer = new TraceMap(mapRaw);
      const entry = { tracer, mapPath };
      sourceMaps.set(basename, entry);
      return entry;
    } catch {
      sourceMaps.set(basename, null);
      return null;
    }
  }

  return {
    resolveFrame(frame) {
      if (!frame.url || frame.lineNumber == null) {
        return null;
      }
      const entry = loadSourceMap(frame.url);
      if (!entry) {
        return null;
      }
      const pos = originalPositionFor(entry.tracer, {
        line: frame.lineNumber + 1,
        column: frame.columnNumber ?? 0
      });
      if (!pos.source) {
        return null;
      }
      const absSource = path.resolve(path.dirname(entry.mapPath), pos.source);
      return {
        fn: pos.name || frame.functionName || "(anonymous)",
        source: path.relative(process.cwd(), absSource),
        line: pos.line
      };
    }
  };
}

function analyzeProfile(profilePath, options) {
  const raw = JSON.parse(fs.readFileSync(profilePath, "utf8"));
  const nodes = raw.nodes ?? [];
  const samples = raw.samples ?? [];
  const timeDeltas = raw.timeDeltas ?? [];
  if (!Array.isArray(nodes) || !Array.isArray(samples) || !Array.isArray(timeDeltas)) {
    throw new Error("Unsupported cpuprofile format");
  }

  const resolver = createResolver(options.distDir);
  const childrenById = new Map(nodes.map((node) => [node.id, node.children ?? []]));
  const selfTimeById = new Map();
  for (let index = 0; index < samples.length; index += 1) {
    const id = samples[index];
    selfTimeById.set(id, (selfTimeById.get(id) ?? 0) + (timeDeltas[index] ?? 0));
  }

  const totalTimeById = new Map();
  function computeTotalTime(id) {
    if (totalTimeById.has(id)) {
      return totalTimeById.get(id);
    }
    let total = selfTimeById.get(id) ?? 0;
    for (const childId of childrenById.get(id) ?? []) {
      total += computeTotalTime(childId);
    }
    totalTimeById.set(id, total);
    return total;
  }
  for (const node of nodes) {
    computeTotalTime(node.id);
  }

  const entries = nodes.map((node) => {
    const resolved = resolver.resolveFrame(node.callFrame ?? {});
    const functionName = resolved?.fn || node.callFrame?.functionName || "(anonymous)";
    const source = resolved?.source ?? formatFrameSource(node.callFrame ?? {});
    const line = resolved?.line ?? (node.callFrame?.lineNumber != null ? node.callFrame.lineNumber + 1 : 0);
    return {
      id: node.id,
      functionName,
      source,
      line,
      label: `${functionName}  ${source}:${line}`,
      selfTimeMs: round1((selfTimeById.get(node.id) ?? 0) / 1000),
      totalTimeMs: round1((totalTimeById.get(node.id) ?? 0) / 1000)
    };
  });

  const filteredEntries = options.appOnly ? entries.filter((entry) => isAppEntry(entry)) : entries;
  const totalProfileMs = round1(timeDeltas.reduce((sum, value) => sum + value, 0) / 1000);
  return {
    kind: "profile-analysis",
    profilePath,
    distDir: options.distDir ?? null,
    appOnly: options.appOnly,
    totalSampledTimeMs: totalProfileMs,
    topSelf: takeTop(filteredEntries, "selfTimeMs", options.limit),
    topTotal: takeTop(filteredEntries, "totalTimeMs", options.limit),
    groupedByFunction: summarizeGroups(filteredEntries, (entry) => `${entry.functionName}  ${entry.source}`),
    groupedByFile: summarizeGroups(filteredEntries, (entry) => entry.source)
  };
}

function compareProfiles(options) {
  const left = analyzeProfile(options.leftProfilePath, {
    distDir: options.distLeft,
    limit: options.limit,
    appOnly: options.appOnly
  });
  const right = analyzeProfile(options.rightProfilePath, {
    distDir: options.distRight,
    limit: options.limit,
    appOnly: options.appOnly
  });
  return {
    kind: "profile-compare",
    leftProfilePath: options.leftProfilePath,
    rightProfilePath: options.rightProfilePath,
    appOnly: options.appOnly,
    totalSampledTimeMs: {
      left: left.totalSampledTimeMs,
      right: right.totalSampledTimeMs,
      delta: round1(right.totalSampledTimeMs - left.totalSampledTimeMs)
    },
    selfTimeByFunctionDelta: diffGrouped(left.groupedByFunction, right.groupedByFunction, options.limit),
    totalTimeByFunctionDelta: diffGrouped(
      summarizeGroups(left.topTotal, (entry) => `${entry.functionName}  ${entry.source}`),
      summarizeGroups(right.topTotal, (entry) => `${entry.functionName}  ${entry.source}`),
      options.limit
    ),
    selfTimeByFileDelta: diffGrouped(left.groupedByFile, right.groupedByFile, options.limit)
  };
}

function compareReports(leftReportPath, rightReportPath) {
  const left = JSON.parse(fs.readFileSync(leftReportPath, "utf8"));
  const right = JSON.parse(fs.readFileSync(rightReportPath, "utf8"));
  const leftVariants = new Map((left.variants ?? []).map((variant) => [variant.id, variant]));
  const rightVariants = new Map((right.variants ?? []).map((variant) => [variant.id, variant]));
  const variantIds = [...new Set([...leftVariants.keys(), ...rightVariants.keys()])].sort();

  return {
    kind: "scenario-report-compare",
    leftReportPath,
    rightReportPath,
    leftScenario: left.scenario ?? null,
    rightScenario: right.scenario ?? null,
    variantDiffs: variantIds.map((variantId) => {
      const leftVariant = leftVariants.get(variantId) ?? null;
      const rightVariant = rightVariants.get(variantId) ?? null;
      return {
        variantId,
        leftLabel: leftVariant?.label ?? null,
        rightLabel: rightVariant?.label ?? null,
        metricDelta: diffPlainNumbers(leftVariant?.metrics ?? null, rightVariant?.metrics ?? null),
        frameStatsDelta: diffPlainNumbers(leftVariant?.frameStats ?? null, rightVariant?.frameStats ?? null),
        instrumentationDelta: {
          counters: diffPlainNumbers(leftVariant?.instrumentation?.counters ?? null, rightVariant?.instrumentation?.counters ?? null),
          computeDurationMs: {
            left: round1(sumDurations(leftVariant?.instrumentation?.computeTimings)),
            right: round1(sumDurations(rightVariant?.instrumentation?.computeTimings)),
            delta: round1(sumDurations(rightVariant?.instrumentation?.computeTimings) - sumDurations(leftVariant?.instrumentation?.computeTimings))
          },
          svgPatchDurationMs: {
            left: round1(sumDurations(leftVariant?.instrumentation?.svgPatchTimings)),
            right: round1(sumDurations(rightVariant?.instrumentation?.svgPatchTimings)),
            delta: round1(sumDurations(rightVariant?.instrumentation?.svgPatchTimings) - sumDurations(leftVariant?.instrumentation?.svgPatchTimings))
          }
        }
      };
    })
  };
}

function summarizeGroups(entries, keyFn) {
  const grouped = new Map();
  for (const entry of entries) {
    const key = keyFn(entry);
    const current = grouped.get(key) ?? { key, selfTimeMs: 0, totalTimeMs: 0 };
    current.selfTimeMs += entry.selfTimeMs ?? 0;
    current.totalTimeMs += entry.totalTimeMs ?? 0;
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map((entry) => ({
      key: entry.key,
      selfTimeMs: round1(entry.selfTimeMs),
      totalTimeMs: round1(entry.totalTimeMs)
    }))
    .sort((left, right) => right.selfTimeMs - left.selfTimeMs);
}

function diffGrouped(leftEntries, rightEntries, limit) {
  const leftMap = new Map(leftEntries.map((entry) => [entry.key, entry]));
  const rightMap = new Map(rightEntries.map((entry) => [entry.key, entry]));
  return [...new Set([...leftMap.keys(), ...rightMap.keys()])]
    .map((key) => {
      const left = leftMap.get(key) ?? { selfTimeMs: 0, totalTimeMs: 0 };
      const right = rightMap.get(key) ?? { selfTimeMs: 0, totalTimeMs: 0 };
      return {
        key,
        leftSelfTimeMs: round1(left.selfTimeMs ?? 0),
        rightSelfTimeMs: round1(right.selfTimeMs ?? 0),
        deltaSelfTimeMs: round1((right.selfTimeMs ?? 0) - (left.selfTimeMs ?? 0)),
        leftTotalTimeMs: round1(left.totalTimeMs ?? 0),
        rightTotalTimeMs: round1(right.totalTimeMs ?? 0),
        deltaTotalTimeMs: round1((right.totalTimeMs ?? 0) - (left.totalTimeMs ?? 0))
      };
    })
    .sort((left, right) => Math.abs(right.deltaSelfTimeMs) - Math.abs(left.deltaSelfTimeMs))
    .slice(0, limit);
}

function diffPlainNumbers(left, right) {
  const keys = [...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])].sort();
  return keys
    .map((key) => {
      const leftValue = numericValue(left?.[key]);
      const rightValue = numericValue(right?.[key]);
      if (leftValue == null && rightValue == null) {
        return null;
      }
      return {
        key,
        left: leftValue,
        right: rightValue,
        delta: leftValue != null && rightValue != null ? round1(rightValue - leftValue) : null
      };
    })
    .filter(Boolean);
}

function takeTop(entries, field, limit) {
  return entries
    .filter((entry) => (entry[field] ?? 0) > 0.05)
    .sort((left, right) => right[field] - left[field])
    .slice(0, limit);
}

function sumDurations(entries) {
  return (entries ?? []).reduce((sum, entry) => {
    const durationMs = numericValue(entry?.durationMs ?? 0);
    return sum + (durationMs ?? 0);
  }, 0);
}

function numericValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isAppEntry(entry) {
  return (
    entry.source.startsWith("packages/app/") ||
    entry.source.startsWith("packages/core/") ||
    entry.source.startsWith("apps/web/") ||
    entry.source.startsWith("/Users/")
  );
}

function formatFrameSource(frame) {
  const url = frame.url || "(native)";
  if (url.includes("/node_modules/")) {
    return url;
  }
  return path.relative(process.cwd(), url) || url;
}

function round1(value) {
  return Number(value.toFixed(1));
}

function outputResult(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.kind === "profile-analysis") {
    console.log(`Profile: ${result.profilePath}`);
    console.log(`Total sampled time: ${result.totalSampledTimeMs.toFixed(1)} ms`);
    if (result.distDir) {
      console.log(`Source maps: ${result.distDir}`);
    }
    printRanked("Top by self time", result.topSelf, (entry) => `${entry.selfTimeMs.toFixed(1).padStart(8)} ms  ${entry.label}`);
    printRanked("Top by total time", result.topTotal, (entry) => `${entry.totalTimeMs.toFixed(1).padStart(8)} ms  ${entry.label}`);
    printRanked("Grouped by file", result.groupedByFile.slice(0, 15), (entry) => `${entry.selfTimeMs.toFixed(1).padStart(8)} ms  ${entry.key}`);
    return;
  }
  if (result.kind === "profile-compare") {
    console.log(`Compare: ${result.leftProfilePath} -> ${result.rightProfilePath}`);
    console.log(
      `Total sampled time: ${result.totalSampledTimeMs.left.toFixed(1)} ms -> ${result.totalSampledTimeMs.right.toFixed(1)} ms (${formatDelta(result.totalSampledTimeMs.delta)})`
    );
    printRanked(
      "Top self-time deltas by function",
      result.selfTimeByFunctionDelta,
      (entry) =>
        `${formatDelta(entry.deltaSelfTimeMs).padStart(9)}  self ${entry.leftSelfTimeMs.toFixed(1)} -> ${entry.rightSelfTimeMs.toFixed(1)} ms  ${entry.key}`
    );
    printRanked(
      "Top self-time deltas by file",
      result.selfTimeByFileDelta,
      (entry) =>
        `${formatDelta(entry.deltaSelfTimeMs).padStart(9)}  self ${entry.leftSelfTimeMs.toFixed(1)} -> ${entry.rightSelfTimeMs.toFixed(1)} ms  ${entry.key}`
    );
    return;
  }
  if (result.kind === "scenario-report-compare") {
    console.log(`Compare reports: ${result.leftReportPath} -> ${result.rightReportPath}`);
    for (const variant of result.variantDiffs) {
      console.log(`\nVariant: ${variant.variantId}`);
      for (const metric of variant.metricDelta) {
        console.log(`  metric ${metric.key}: ${metric.left ?? "n/a"} -> ${metric.right ?? "n/a"} (${metric.delta == null ? "n/a" : formatDelta(metric.delta)})`);
      }
      for (const counter of variant.instrumentationDelta.counters) {
        console.log(`  counter ${counter.key}: ${counter.left ?? "n/a"} -> ${counter.right ?? "n/a"} (${counter.delta == null ? "n/a" : formatCountDelta(counter.delta)})`);
      }
      console.log(
        `  compute duration: ${variant.instrumentationDelta.computeDurationMs.left.toFixed(1)} -> ${variant.instrumentationDelta.computeDurationMs.right.toFixed(1)} ms (${formatDelta(variant.instrumentationDelta.computeDurationMs.delta)})`
      );
      console.log(
        `  svg patch duration: ${variant.instrumentationDelta.svgPatchDurationMs.left.toFixed(1)} -> ${variant.instrumentationDelta.svgPatchDurationMs.right.toFixed(1)} ms (${formatDelta(variant.instrumentationDelta.svgPatchDurationMs.delta)})`
      );
    }
  }
}

function printRanked(title, entries, formatLine) {
  console.log(`\n${title}:`);
  for (const entry of entries) {
    console.log(formatLine(entry));
  }
}

function formatDelta(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} ms`;
}

function formatCountDelta(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}
