import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROFILING_SCENARIOS, getProfilingScenarioById } from "../profiling/scenario-registry";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));

type RunOptions = {
  scenarioId: string | null;
  category: string | null;
};

const options = parseArgs(process.argv.slice(2));
const selected = resolveScenarios(options);

if (selected.length === 0) {
  console.error("No profiling scenarios matched the requested filters.");
  process.exit(1);
}

const playwrightArgs = [
  "playwright",
  "test",
  "--config",
  "profiling/playwright.config.ts",
  ...selected.map((scenario) => scenario.specPath)
];

const result = spawnSync("npx", playwrightArgs, {
  cwd: path.resolve(THIS_DIR, ".."),
  stdio: "inherit",
  env: process.env
});

process.exit(result.status ?? 1);

function parseArgs(argv: string[]): RunOptions {
  let scenarioId: string | null = null;
  let category: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--scenario") {
      scenarioId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--category") {
      category = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--all") {
      scenarioId = null;
      category = null;
      continue;
    }
    throw new Error(`Unknown profiling argument: ${arg}`);
  }

  return {
    scenarioId,
    category
  };
}

function resolveScenarios(options: RunOptions) {
  if (options.scenarioId) {
    const scenario = getProfilingScenarioById(options.scenarioId);
    if (!scenario) {
      throw new Error(`Unknown profiling scenario id: ${options.scenarioId}`);
    }
    return [scenario];
  }
  if (options.category) {
    return PROFILING_SCENARIOS.filter((scenario) => scenario.category === options.category);
  }
  return PROFILING_SCENARIOS;
}
