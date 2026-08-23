import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { ensureDistBuildFresh } from "./ensure-dist-build.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
ensureDistBuildFresh(repoRoot);

const [{ parseTikz, createIncrementalParseSession }, { createIncrementalSemanticSession }, { emitSvg }] =
  await Promise.all([
    import(resolve(repoRoot, "packages/core/dist/parser/index.js")),
    import(resolve(repoRoot, "packages/core/dist/semantic/incremental.js")),
    import(resolve(repoRoot, "packages/core/dist/svg/emit.js"))
  ]);

const options = parseArgs(process.argv.slice(2));

console.log(`# Incremental drag benchmark`);
console.log(`# paths=${options.paths.join(",")} iterations=${options.iterations} warmups=1`);
for (const pathCount of options.paths) {
  printResult(benchmarkFrame(pathCount, 0, options.iterations));
  printResult(benchmarkFrame(pathCount, pathCount - 1, options.iterations));
}

if (!options.skipPaper) {
  printPaperResult(
    benchmarkPaperParse(options.paperPaths, options.paperPrefix, options.iterations)
  );
}

function benchmarkFrame(pathCount, targetIndex, iterations) {
  const baseSource = makeFigure(pathCount);
  const next = replaceStatementEndpoint(baseSource, targetIndex, targetIndex + 1.25, 1.5);
  const fullParse = [];
  const fullEval = [];
  const fullEmit = [];
  const incrementalParse = [];
  const incrementalEval = [];
  const incrementalEmit = [];
  let parseStrategy = null;
  let parseFallbackReason = null;
  let semanticStrategy = null;
  let semanticReplayMode = null;
  let semanticFallbackReason = null;
  let recomputeFromStatementIndex = null;
  let corridorEndStatementIndex = null;
  let affectedStatementCount = null;
  let recomputedStatementCount = null;
  let reusedStatementCount = null;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const started = performance.now();
    const parsed = parseTikz(next.source, {
      recover: true,
      activeFigureId: "figure:0",
      includeContextDefinitions: true
    });
    const parsedAt = performance.now();
    const semantic = createIncrementalSemanticSession().evaluate({
      figure: parsed.figure,
      source: next.source,
      hints: { trigger: "other" }
    }).semantic;
    const evaluatedAt = performance.now();
    emitSvg(semantic.scene, { padding: 18 });
    const emittedAt = performance.now();
    if (iteration > 0) {
      fullParse.push(parsedAt - started);
      fullEval.push(evaluatedAt - parsedAt);
      fullEmit.push(emittedAt - evaluatedAt);
    }
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const seededParse = parseTikz(baseSource, {
      recover: true,
      activeFigureId: "figure:0",
      includeContextDefinitions: true
    });
    const changedSourceId = seededParse.figure.body[targetIndex]?.id;
    if (!changedSourceId) {
      throw new Error(`Missing changed source id for statement ${targetIndex}`);
    }
    const parseSession = createIncrementalParseSession();
    parseSession.prime(seededParse, {
      activeFigureId: "figure:0",
      includeContextDefinitions: true
    });
    const semanticSession = createIncrementalSemanticSession();
    semanticSession.evaluate({
      figure: seededParse.figure,
      source: baseSource,
      hints: { trigger: "other" }
    });

    const started = performance.now();
    const parsed = parseSession.evaluate({
      source: next.source,
      activeFigureId: "figure:0",
      includeContextDefinitions: true,
      patches: [next.patch],
      changedSourceIds: [changedSourceId],
      trigger: "drag-element"
    });
    const parsedAt = performance.now();
    const semantic = semanticSession.evaluate({
      figure: parsed.parse.figure,
      source: next.source,
      hints: {
        trigger: "drag-element",
        changedSourceIds: [changedSourceId]
      }
    });
    const evaluatedAt = performance.now();
    emitSvg(semantic.semantic.scene, { padding: 18 });
    const emittedAt = performance.now();

    if (iteration > 0) {
      incrementalParse.push(parsedAt - started);
      incrementalEval.push(evaluatedAt - parsedAt);
      incrementalEmit.push(emittedAt - evaluatedAt);
      parseStrategy = parsed.stats.strategy;
      parseFallbackReason = parsed.stats.fallbackReason ?? null;
      semanticStrategy = semantic.stats.strategy;
      semanticReplayMode = semantic.stats.replayMode ?? null;
      semanticFallbackReason = semantic.stats.fallbackReason ?? null;
      recomputeFromStatementIndex = semantic.stats.recomputeFromStatementIndex;
      corridorEndStatementIndex = semantic.stats.corridorEndStatementIndex ?? null;
      affectedStatementCount = semantic.stats.affectedStatementCount ?? null;
      recomputedStatementCount = semantic.stats.recomputedStatementCount;
      reusedStatementCount = semantic.stats.reusedStatementCount;
    }
  }

  return {
    kind: "frame",
    pathCount,
    targetIndex,
    full: summarizePhaseTimes(fullParse, fullEval, fullEmit),
    incremental: {
      ...summarizePhaseTimes(incrementalParse, incrementalEval, incrementalEmit),
      parseStrategy,
      parseFallbackReason,
      semanticStrategy,
      semanticReplayMode,
      semanticFallbackReason,
      recomputeFromStatementIndex,
      corridorEndStatementIndex,
      affectedStatementCount,
      recomputedStatementCount,
      reusedStatementCount
    }
  };
}

function benchmarkPaperParse(pathCount, prefixSize, iterations) {
  const baseSource = makePaper(prefixSize, pathCount);
  const next = replaceStatementEndpoint(baseSource, pathCount - 1, pathCount - 1 + 1.25, 1.5);
  const seededParse = parseTikz(baseSource, {
    recover: true,
    activeFigureId: "figure:0",
    includeContextDefinitions: true
  });
  const changedSourceId = seededParse.figure.body[pathCount - 1]?.id;
  if (!changedSourceId) {
    throw new Error(`Missing changed source id for paper statement ${pathCount - 1}`);
  }

  const fullParse = [];
  const incrementalParse = [];
  let strategy = null;
  let fallbackReason = null;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const started = performance.now();
    parseTikz(next.source, {
      recover: true,
      activeFigureId: "figure:0",
      includeContextDefinitions: true
    });
    const ended = performance.now();
    if (iteration > 0) {
      fullParse.push(ended - started);
    }
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const parseSession = createIncrementalParseSession();
    parseSession.prime(seededParse, {
      activeFigureId: "figure:0",
      includeContextDefinitions: true
    });
    const started = performance.now();
    const result = parseSession.evaluate({
      source: next.source,
      activeFigureId: "figure:0",
      includeContextDefinitions: true,
      patches: [next.patch],
      changedSourceIds: [changedSourceId],
      trigger: "drag-element"
    });
    const ended = performance.now();
    if (iteration > 0) {
      incrementalParse.push(ended - started);
      strategy = result.stats.strategy;
      fallbackReason = result.stats.fallbackReason ?? null;
    }
  }

  const fullParseMs = average(fullParse);
  const incrementalParseMs = average(incrementalParse);
  return {
    kind: "paper",
    pathCount,
    prefixSize,
    sourceLength: baseSource.length,
    fullParseMs: round2(fullParseMs),
    incrementalParseMs: round2(incrementalParseMs),
    speedup: round2(fullParseMs / incrementalParseMs),
    strategy,
    fallbackReason
  };
}

function summarizePhaseTimes(parseTimes, evalTimes, emitTimes) {
  const parseMs = average(parseTimes);
  const evalMs = average(evalTimes);
  const emitMs = average(emitTimes);
  return {
    parseMs: round2(parseMs),
    evalMs: round2(evalMs),
    emitMs: round2(emitMs),
    totalMs: round2(parseMs + evalMs + emitMs)
  };
}

function makeFigure(pathCount) {
  const lines = ["\\begin{tikzpicture}"];
  for (let index = 0; index < pathCount; index += 1) {
    lines.push(`\\draw (${index},0) -- (${index + 1},1);`);
  }
  lines.push("\\end{tikzpicture}");
  return lines.join("\n");
}

function makePaper(prefixSize, pathCount) {
  const prefix = "x".repeat(prefixSize);
  return `${prefix}\n${makeFigure(pathCount)}\n${prefix}`;
}

function replaceStatementEndpoint(source, statementIndex, nextX, nextY) {
  const oldText = `\\draw (${statementIndex},0) -- (${statementIndex + 1},1);`;
  const replacement = `\\draw (${statementIndex},0) -- (${nextX},${nextY});`;
  const from = source.indexOf(oldText);
  if (from < 0) {
    throw new Error(`Could not find source text for statement ${statementIndex}`);
  }
  const to = from + oldText.length;
  return {
    source: `${source.slice(0, from)}${replacement}${source.slice(to)}`,
    patch: {
      oldSpan: { from, to },
      newSpan: { from, to: from + replacement.length },
      replacement
    }
  };
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round2(value) {
  return Number(value.toFixed(2));
}

function printResult(result) {
  console.log(JSON.stringify(result));
}

function printPaperResult(result) {
  console.log(JSON.stringify(result));
}

function parseArgs(argv) {
  const options = {
    paths: [100, 1000, 5000],
    iterations: 6,
    paperPrefix: 500_000,
    paperPaths: 1000,
    skipPaper: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--paths") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--paths requires a comma-separated value");
      }
      options.paths = value.split(",").map((entry) => parseInteger(entry, "--paths"));
      index += 1;
      continue;
    }
    if (arg === "--iterations") {
      const value = argv[index + 1];
      options.iterations = parseInteger(value, "--iterations");
      index += 1;
      continue;
    }
    if (arg === "--paper-prefix") {
      const value = argv[index + 1];
      options.paperPrefix = parseInteger(value, "--paper-prefix");
      index += 1;
      continue;
    }
    if (arg === "--paper-paths") {
      const value = argv[index + 1];
      options.paperPaths = parseInteger(value, "--paper-paths");
      index += 1;
      continue;
    }
    if (arg === "--skip-paper") {
      options.skipPaper = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function parseInteger(value, flagName) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flagName} requires a positive integer`);
  }
  return parsed;
}
