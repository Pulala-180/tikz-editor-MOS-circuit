import { existsSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, join } from "node:path";

const SOURCE_EXTENSIONS = new Set([".ts", ".grammar"]);
const DIST_EXTENSIONS = new Set([".js", ".d.ts", ".map"]);
let alreadyEnsured = false;

export function ensureDistBuildFresh(repoRoot) {
  const distEntry = join(repoRoot, "packages", "core", "dist", "index.js");
  if (alreadyEnsured && existsSync(distEntry)) {
    return distEntry;
  }

  if (!existsSync(distEntry) || isDistStale(repoRoot)) {
    const build = spawnSync("npm", ["run", "-w", "@tikz-editor/core", "build"], { cwd: repoRoot, stdio: "inherit" });
    if (build.status !== 0) {
      throw new Error("Failed to build core dist output (`npm run -w @tikz-editor/core build`).");
    }
  }

  if (!existsSync(distEntry)) {
    throw new Error("Build output missing at packages/core/dist/index.js after core build.");
  }

  alreadyEnsured = true;
  return distEntry;
}

function isDistStale(repoRoot) {
  const newestSource = Math.max(
    latestFileMtime(join(repoRoot, "packages", "core", "src"), SOURCE_EXTENSIONS),
    fileMtime(join(repoRoot, "tsconfig.json")),
    fileMtime(join(repoRoot, "package.json")),
    fileMtime(join(repoRoot, "packages", "core", "tsconfig.json")),
    fileMtime(join(repoRoot, "packages", "core", "package.json"))
  );
  const newestDist = latestFileMtime(join(repoRoot, "packages", "core", "dist"), DIST_EXTENSIONS);
  return newestDist < newestSource;
}

function latestFileMtime(rootPath, allowedExtensions) {
  if (!existsSync(rootPath)) {
    return Number.NEGATIVE_INFINITY;
  }

  const stack = [rootPath];
  let latest = Number.NEGATIVE_INFINITY;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let stat;
    try {
      stat = statSync(current);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      let entries = [];
      try {
        entries = readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        stack.push(join(current, entry.name));
      }
      continue;
    }

    if (!stat.isFile()) {
      continue;
    }

    const extension = extname(current);
    if (allowedExtensions && !allowedExtensions.has(extension)) {
      continue;
    }

    if (stat.mtimeMs > latest) {
      latest = stat.mtimeMs;
    }
  }

  return latest;
}

function fileMtime(path) {
  if (!existsSync(path)) {
    return Number.NEGATIVE_INFINITY;
  }
  try {
    return statSync(path).mtimeMs;
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
}
