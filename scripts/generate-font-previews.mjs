#!/usr/bin/env node
/**
 * Generates SVG font preview images for all 11 MathJax fonts.
 *
 * Output: packages/app/public/font-previews/<font-name>.svg
 * Usage:  node scripts/generate-font-previews.mjs [--force]
 *
 * Each font's npm package is installed on demand (--no-save) if absent.
 * Pass --force to regenerate all previews even if the files already exist.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { optimize as svgoOptimize } from "svgo";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outDir = join(repoRoot, "packages", "app", "public", "font-previews");
const force = process.argv.includes("--force");

const FONTS = [
  "mathjax-newcm",
  "mathjax-asana",
  "mathjax-bonum",
  "mathjax-dejavu",
  "mathjax-fira",
  "mathjax-modern",
  "mathjax-pagella",
  "mathjax-schola",
  "mathjax-stix2",
  "mathjax-termes",
  "mathjax-tex",
];

// The preview phrase. Uses \text{} for the prose part and display-mode sum for the math.
const TEX =
  "\\text{Euler proved }\\textstyle\\sum_{n=1}^{\\infty}\\frac{1}{n^2}=\\frac{\\pi^2}{6}";

mkdirSync(outDir, { recursive: true });

let ok = 0;
let skipped = 0;
let failed = 0;

for (const font of FONTS) {
  const outPath = join(outDir, `${font}.svg`);

  if (!force && existsSync(outPath)) {
    console.log(`  skip  ${font}  (already exists; use --force to regenerate)`);
    skipped++;
    continue;
  }

  const packageName = `@mathjax/${font}-font`;
  const packageDir = join(repoRoot, "node_modules", "@mathjax", `${font}-font`);

  if (!existsSync(packageDir)) {
    console.log(`  install  ${packageName} …`);
    const install = spawnSync(
      "npm",
      ["install", "--no-save", "--no-audit", "--no-fund", packageName],
      { cwd: repoRoot, stdio: "inherit" }
    );
    if (install.status !== 0) {
      console.error(`  FAILED to install ${packageName}`);
      failed++;
      continue;
    }
  }

  process.stdout.write(`  render   ${font} … `);
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", renderScript(font, TEX)],
    { cwd: repoRoot, encoding: "utf8", timeout: 30_000 }
  );

  if (result.error || result.status !== 0) {
    console.log("FAILED");
    console.error(result.stderr || result.error?.message);
    failed++;
    continue;
  }

  const { data: optimized } = svgoOptimize(result.stdout, {
    multipass: true,
    plugins: [
      {
        name: "removeUnknownsAndDefaults",
        params: {
          unknownContent: true,
          unknownAttrs: true,
          defaultAttrs: true,
          defaultMarkupDeclarations: true,
          uselessOverrides: true,
          keepDataAttrs: false,
          keepAriaAttrs: true,
          keepRoleAttr: false
        }
      }
    ]
  });
  writeFileSync(outPath, optimized, "utf8");
  console.log("ok");
  ok++;
}

console.log(`\nDone: ${ok} generated, ${skipped} skipped, ${failed} failed.`);
if (failed > 0) process.exit(1);

// ---------------------------------------------------------------------------

function renderScript(font, tex) {
  // Runs in a fresh Node.js process so each font gets its own mathjax singleton.
  return `
import mathjaxPkg from 'mathjax';

const MathJax = await mathjaxPkg.init({
  loader: { load: ['input/tex', 'output/svg', '[tex]/textmacros'] },
  output: { font: ${JSON.stringify(font)} },
  tex: {
    packages: { '[+]': ['textmacros'] },
    formatError: (_jax, err) => { throw err; },
  },
  svg: { fontCache: 'none', linebreaks: { inline: false } },
  startup: { typeset: false },
});

const adaptor = MathJax.startup.adaptor;
const node = MathJax.tex2svg(${JSON.stringify(tex)}, { display: false });

// adaptor.innerHTML of the tex2svg container gives the full <svg …>…</svg> string.
let svg = adaptor.innerHTML(node);

// Ensure the SVG has an explicit black fill so it renders on light backgrounds.
svg = svg.replace('<svg ', '<svg fill="currentColor" ');

process.stdout.write(svg);
`;
}
