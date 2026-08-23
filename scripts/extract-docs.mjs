#!/usr/bin/env node
/**
 * Extract TikZ documentation snippets from tikz-dev HTML files.
 *
 * Output (lazy-loadable in web/desktop app):
 *   packages/app/public/docs/keys/index.json
 *   packages/app/public/docs/keys/<chunk>.json
 *
 * Entry schema:
 *   {
 *     type: "key" | "command" | "style",
 *     signatureHtml: string,
 *     defaultHtml: string,
 *     snippetHtml: string,
 *     page: string,
 *     anchor: string,
 *     href: string
 *   }
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "parse5";

const TIKZDEV_DIR = join(import.meta.dirname, "..", "tikz-dev");
const OUT_DIR = join(import.meta.dirname, "..", "packages", "app", "public", "docs", "keys");
const DOCS_BASE_URL = "https://tikz.dev";

const INCLUDE_PREFIXES = ["tikz-"];
const INCLUDE_FILES = new Set([
  "library-shapes",
  "library-decorations",
  "library-patterns",
  "library-shadows",
  "library-fadings",
  "library-matrix",
  "pgffor"
]);

const INLINE_ALLOWED_TAGS = new Set(["code", "kbd", "i", "em", "strong", "b", "sub", "sup", "br"]);

export function main() {
  const files = readdirSync(TIKZDEV_DIR)
    .filter((name) => {
      if (!name.endsWith(".html") || name === "pgfmanual_html.html") return false;
      const page = basename(name, ".html");
      return INCLUDE_PREFIXES.some((prefix) => page.startsWith(prefix)) || INCLUDE_FILES.has(page);
    })
    .sort();

  prepareOutDir(OUT_DIR);

  const index = {};
  let entryCount = 0;
  let fileCount = 0;

  for (const file of files) {
    const page = basename(file, ".html");
    const html = readFileSync(join(TIKZDEV_DIR, file), "utf8");
    const chunk = extractEntriesFromHtml(page, html);

    for (const keyName of Object.keys(chunk)) {
      index[keyName] = page;
      entryCount += 1;
    }

    if (Object.keys(chunk).length > 0) {
      fileCount += 1;
      writeFileSync(join(OUT_DIR, `${page}.json`), JSON.stringify(chunk, null, 2));
    }
  }

  writeFileSync(join(OUT_DIR, "index.json"), JSON.stringify(index, null, 2));

  console.log(`Extracted ${entryCount} docs keys from ${fileCount} files into ${OUT_DIR}`);
}

export function extractEntriesFromHtml(page, html) {
  const doc = parse(html);
  const manualEntries = findElementsByClass(doc, "manualentry");

  const chunk = {};
  for (const manualEntry of manualEntries) {
    const entry = extractManualEntry(page, manualEntry);
    if (!entry || entry.keyNames.length === 0) continue;

    for (const keyName of entry.keyNames) {
      chunk[keyName] = {
        type: entry.type,
        signatureHtml: entry.signatureHtml,
        defaultHtml: entry.defaultHtml,
        snippetHtml: entry.snippetHtml,
        page: entry.page,
        anchor: entry.anchor,
        href: entry.href
      };
    }
  }

  return chunk;
}

function prepareOutDir(outDir) {
  mkdirSync(outDir, { recursive: true });
  for (const file of readdirSync(outDir)) {
    if (file.endsWith(".json")) {
      rmSync(join(outDir, file), { force: true });
    }
  }
}

function extractManualEntry(page, manualEntryNode) {
  const headline = findFirstByClass(manualEntryNode, "entryheadline");
  if (!headline) return null;
  const flowContainer = getEntryFlowContainer(manualEntryNode, headline);

  const headlineAnchors = findAnchorsWithPgfId(headline);
  const fallbackAnchors = headlineAnchors.length > 0 ? [] : findEarlyParagraphAnchors(flowContainer);
  const anchors = headlineAnchors.length > 0 ? headlineAnchors : fallbackAnchors;
  if (anchors.length === 0) return null;

  const keyNames = dedupe(
    anchors
      .flatMap((id) => anchorIdToKeyNames(id))
      .filter((value) => value.length > 0)
  );
  if (keyNames.length === 0) return null;

  const signatureNode = findFirstByClass(headline, "hl-def");
  const defaultNode = findFirstByClass(headline, "hl-default");
  const signatureHtml = sanitizeInlineContainer(signatureNode);
  const defaultHtml = sanitizeInlineContainer(defaultNode);
  const snippetHtml = extractSnippetHtml(flowContainer, headline);

  const type = inferEntryType(keyNames, defaultHtml);
  const anchor = anchors[0];
  const href = `${DOCS_BASE_URL}/${page}#${encodeHashAnchor(anchor)}`;

  return {
    keyNames,
    type,
    signatureHtml,
    defaultHtml,
    snippetHtml,
    page,
    anchor,
    href
  };
}

function extractSnippetHtml(flowContainerNode, headlineNode) {
  const paragraphNodes = [];
  let afterHeadline = false;

  for (const child of flowContainerNode.childNodes ?? []) {
    if (!afterHeadline) {
      if (child === headlineNode) {
        afterHeadline = true;
      }
      continue;
    }

    if (isElement(child, "figure")) {
      break;
    }
    if (isElement(child, "div") && hasClass(child, "manualentry")) {
      break;
    }
    if (isElement(child, "p")) {
      paragraphNodes.push(child);
      if (paragraphNodes.length >= 2) break;
    }
  }

  const paragraphs = paragraphNodes
    .map((node) => sanitizeParagraph(node))
    .filter((html) => stripTags(html).trim().length > 0)
    .filter((html) => !stripTags(html).trim().toLowerCase().startsWith("alias "));

  return paragraphs.join("");
}

function inferEntryType(keyNames, defaultHtml) {
  if (keyNames.some((name) => name.startsWith("\\"))) return "command";
  const defaultText = stripTags(defaultHtml).toLowerCase();
  if (defaultText.includes("style")) return "style";
  return "key";
}

export function anchorIdToKeyNames(anchorId) {
  if (!anchorId.startsWith("pgf.")) return [];
  if (anchorId.includes("meta(")) return [];

  if (anchorId === "pgf.--") return ["--"];
  if (anchorId === "pgf.-bar/") return ["-|"];
  if (anchorId === "pgf.bar/-") return ["|-"];
  if (anchorId === "pgf...") return [".."];

  let rest = anchorId.slice("pgf.".length);

  if (rest.startsWith("back/")) {
    const command = rest.slice("back/".length).trim();
    if (!command) return [];
    return [`\\${command.toLowerCase()}`];
  }

  rest = rest.replace(/:/g, " ").trim();

  if (rest.startsWith("./")) {
    const canonical = normalizeCanonicalPath(rest.slice(1));
    return canonicalPathAliases(canonical);
  }

  if (rest.startsWith("/")) {
    const canonical = normalizeCanonicalPath(rest);
    return canonicalPathAliases(canonical);
  }

  const short = normalizeInlineKey(rest);
  return short ? [short] : [];
}

function canonicalPathAliases(canonical) {
  if (!canonical) return [];
  const aliases = [canonical];
  const tail = canonical.split("/").filter(Boolean).pop() ?? "";
  if (tail.length > 0) aliases.push(tail);
  return dedupe(aliases);
}

function normalizeCanonicalPath(pathValue) {
  const normalized = `/${pathValue.replace(/^\/+/, "")}`.replace(/\s+/g, " ").trim();
  if (!normalized.startsWith("/")) return null;
  return normalized;
}

function normalizeInlineKey(value) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function findEarlyParagraphAnchors(flowContainerNode) {
  const anchors = [];
  for (const child of flowContainerNode.childNodes ?? []) {
    if (isElement(child, "figure")) break;
    if (!isElement(child, "p")) continue;
    anchors.push(...findAnchorsWithPgfId(child));
    if (anchors.length > 0) break;
  }
  return dedupe(anchors);
}

function getEntryFlowContainer(manualEntryNode, headlineNode) {
  if (headlineNode?.parentNode && headlineNode.parentNode !== manualEntryNode) {
    return headlineNode.parentNode;
  }
  return manualEntryNode;
}

function findAnchorsWithPgfId(node) {
  const anchors = [];
  walk(node, (candidate) => {
    if (!isElement(candidate, "a")) return;
    const id = getAttr(candidate, "id");
    if (!id || !id.startsWith("pgf.")) return;
    anchors.push(id);
  });
  return dedupe(anchors);
}

function findElementsByClass(root, className) {
  const result = [];
  walk(root, (node) => {
    if (isElement(node, "div") && hasClass(node, className)) {
      result.push(node);
    }
  });
  return result;
}

function findFirstByClass(root, className) {
  let found = null;
  walk(root, (node) => {
    if (found) return;
    if (isElement(node) && hasClass(node, className)) {
      found = node;
    }
  });
  return found;
}

function walk(node, visitor) {
  visitor(node);
  const children = node?.childNodes ?? [];
  for (const child of children) {
    walk(child, visitor);
  }
}

function hasClass(node, className) {
  const value = getAttr(node, "class");
  if (!value) return false;
  return value.split(/\s+/).includes(className);
}

function getAttr(node, name) {
  const attrs = node?.attrs ?? [];
  const attr = attrs.find((item) => item.name === name);
  return attr?.value ?? null;
}

function isElement(node, tagName = null) {
  if (!node || node.nodeName === "#text" || node.nodeName === "#comment") return false;
  if (!tagName) return Boolean(node.tagName);
  return node.tagName === tagName;
}

function sanitizeParagraph(node) {
  return `<p>${sanitizeChildrenInline(node)}</p>`;
}

function sanitizeInlineContainer(node) {
  if (!node) return "";
  return sanitizeChildrenInline(node).trim();
}

function sanitizeChildrenInline(node) {
  let html = "";
  for (const child of node.childNodes ?? []) {
    html += sanitizeInlineNode(child);
  }
  return html;
}

function sanitizeInlineNode(node) {
  if (!node) return "";
  if (node.nodeName === "#text") {
    return escapeHtml(normalizeText(node.value ?? ""));
  }
  if (node.nodeName === "br") {
    return "<br>";
  }
  if (!isElement(node)) {
    return "";
  }

  const tag = node.tagName;
  if (tag === "a") {
    return sanitizeChildrenInline(node);
  }
  if (tag === "span" && hasClass(node, "verb")) {
    return `<code>${sanitizeChildrenInline(node)}</code>`;
  }
  if (tag === "span" && hasClass(node, "angle")) {
    return escapeHtml(normalizeText(extractText(node)));
  }
  if (tag === "img" || tag === "figure" || tag === "button" || tag === "script" || tag === "style") {
    return "";
  }

  if (INLINE_ALLOWED_TAGS.has(tag)) {
    return `<${tag}>${sanitizeChildrenInline(node)}</${tag}>`;
  }

  return sanitizeChildrenInline(node);
}

function extractText(node) {
  let text = "";
  walk(node, (candidate) => {
    if (candidate.nodeName === "#text") {
      text += candidate.value ?? "";
    }
  });
  return normalizeText(text);
}

function normalizeText(value) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, "");
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function dedupe(values) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function encodeHashAnchor(anchor) {
  return encodeURIComponent(anchor).replace(/%2F/g, "/");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
