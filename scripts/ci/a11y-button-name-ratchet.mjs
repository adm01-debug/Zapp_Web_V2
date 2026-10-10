#!/usr/bin/env node
// Ratchet: fails CI if the count of a11y button-name violations grows
// above baseline. Covers three defect classes from the Y13 audit:
//   1. <Button size="icon"> without aria-label, title, or sr-only text
//   2. <SelectTrigger> without accessible name (aria-label, aria-labelledby, or text)
//   3. <TabsTrigger> without accessible name (aria-label, aria-labelledby, or text)
//
// Usage: node scripts/ci/a11y-button-name-ratchet.mjs [--update-baseline]
//        node scripts/ci/a11y-button-name-ratchet.mjs [--root <dir>]

import { existsSync, readFileSync, readdirSync, lstatSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASELINE = path.join(__dirname, "a11y-button-name-baseline.json");
const DEFAULT_ROOT = path.join(__dirname, "..", "..");

function normalizeEol(value) {
  return String(value ?? "").replace(/\r\n?/gu, "\n");
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

// Collect all .tsx and .ts files under src/.
export function listSourceFiles(root) {
  const results = [];
  const stack = [path.join(root, "src")];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!existsSync(dir)) continue;
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const stat = lstatSync(full);
      if (stat.isDirectory()) {
        stack.push(full);
      } else if (stat.isFile() && /\.(tsx?|jsx?)$/u.test(entry)) {
        results.push(full);
      }
    }
  }
  return results;
}

// Detect <Button size="icon"> (or size='icon') without aria-label, title, or sr-only text.
function detectButtonIconViolations(content, filePath) {
  const violations = [];
  const buttonRegex = /<Button\b[^>]*size=["']icon["'][^>]*>/gu;
  let match;
  while ((match = buttonRegex.exec(content)) !== null) {
    const tag = match[0];
    const tagStart = match.index;
    const hasAriaLabel = /aria-label\s*=\s*["'][^"']*["']/u.test(tag);
    const hasTitle = /title\s*=\s*["'][^"']*["']/u.test(tag);
    const isSelfClosing = tag.endsWith("/>");

    if (hasAriaLabel || hasTitle) continue;

    if (isSelfClosing) {
      violations.push({
        file: filePath,
        line: content.slice(0, tagStart).split("\n").length,
        type: "button-icon-no-accessible-name",
        snippet: normalizeWhitespace(tag),
      });
      continue;
    }

    const closingTag = "</Button>";
    const closingIndex = content.indexOf(closingTag, tagStart + tag.length);
    if (closingIndex === -1) continue;

    const innerContent = content.slice(tagStart + tag.length, closingIndex);
    const hasSrOnly = /className\s*=\s*["'][^"']*sr-only[^"']*["']/u.test(innerContent);
    const hasVisibleText = innerContent.replace(/<[^>]+>/gu, "").trim().length > 0;

    if (!hasSrOnly && !hasVisibleText) {
      violations.push({
        file: filePath,
        line: content.slice(0, tagStart).split("\n").length,
        type: "button-icon-no-accessible-name",
        snippet: normalizeWhitespace(tag),
      });
    }
  }
  return violations;
}

// Detect <SelectTrigger ...> without aria-label, aria-labelledby, or text content.
function detectSelectTriggerViolations(content, filePath) {
  const violations = [];
  const triggerRegex = /<SelectTrigger\b[^>]*>/gu;
  let match;
  while ((match = triggerRegex.exec(content)) !== null) {
    const tag = match[0];
    const tagStart = match.index;

    const hasAriaLabel = /aria-label\s*=\s*["'][^"']*["']/u.test(tag);
    const hasAriaLabelledBy = /aria-labelledby\s*=\s*["'][^"']*["']/u.test(tag);

    if (hasAriaLabel || hasAriaLabelledBy) continue;

    if (tag.endsWith("/>")) {
      violations.push({
        file: filePath,
        line: content.slice(0, tagStart).split("\n").length,
        type: "select-trigger-no-accessible-name",
        snippet: normalizeWhitespace(tag),
      });
      continue;
    }

    const closingTag = "</SelectTrigger>";
    const closingIndex = content.indexOf(closingTag, tagStart + tag.length);
    if (closingIndex === -1) continue;

    const innerContent = content.slice(tagStart + tag.length, closingIndex);
    const hasText = innerContent.replace(/<[^>]+>/gu, "").trim().length > 0;

    if (!hasText) {
      violations.push({
        file: filePath,
        line: content.slice(0, tagStart).split("\n").length,
        type: "select-trigger-no-accessible-name",
        snippet: normalizeWhitespace(tag),
      });
    }
  }
  return violations;
}

// Detect <TabsTrigger ...> without aria-label, aria-labelledby, or text content.
function detectTabsTriggerViolations(content, filePath) {
  const violations = [];
  const triggerRegex = /<TabsTrigger\b[^>]*>/gu;
  let match;
  while ((match = triggerRegex.exec(content)) !== null) {
    const tag = match[0];
    const tagStart = match.index;

    const hasAriaLabel = /aria-label\s*=\s*["'][^"']*["']/u.test(tag);
    const hasAriaLabelledBy = /aria-labelledby\s*=\s*["'][^"']*["']/u.test(tag);

    if (hasAriaLabel || hasAriaLabelledBy) continue;

    if (tag.endsWith("/>")) {
      violations.push({
        file: filePath,
        line: content.slice(0, tagStart).split("\n").length,
        type: "tabs-trigger-no-accessible-name",
        snippet: normalizeWhitespace(tag),
      });
      continue;
    }

    const closingTag = "</TabsTrigger>";
    const closingIndex = content.indexOf(closingTag, tagStart + tag.length);
    if (closingIndex === -1) continue;

    const innerContent = content.slice(tagStart + tag.length, closingIndex);
    const hasText = innerContent.replace(/<[^>]+>/gu, "").trim().length > 0;

    if (!hasText) {
      violations.push({
        file: filePath,
        line: content.slice(0, tagStart).split("\n").length,
        type: "tabs-trigger-no-accessible-name",
        snippet: normalizeWhitespace(tag),
      });
    }
  }
  return violations;
}

export function scanFile(filePath, root) {
  const content = normalizeEol(readFileSync(filePath, "utf8"));
  const relPath = path.relative(root, filePath).split(path.sep).join("/");
  const buttonViolations = detectButtonIconViolations(content, relPath);
  const selectViolations = detectSelectTriggerViolations(content, relPath);
  const tabsViolations = detectTabsTriggerViolations(content, relPath);
  return [...buttonViolations, ...selectViolations, ...tabsViolations];
}

export function scanAll(root) {
  const files = listSourceFiles(root);
  const allViolations = [];
  for (const file of files) {
    try {
      const violations = scanFile(file, root);
      allViolations.push(...violations);
    } catch {
      // skip files that cannot be read
    }
  }
  return allViolations;
}

export function runRatchet({ root = DEFAULT_ROOT, baselinePath = DEFAULT_BASELINE, updateBaseline = false } = {}) {
  try {
    root = path.resolve(root);
    baselinePath = path.resolve(root, baselinePath);

    const violations = scanAll(root);
    const count = violations.length;

    if (updateBaseline) {
      const baseline = { baseline: count, generatedAt: new Date().toISOString(), schemaVersion: 1 };
      writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
      console.log(`Baseline atualizado: ${count} violacao(oes) em ${baselinePath}`);
      return 0;
    }

    let baseline = 0;
    if (existsSync(baselinePath)) {
      const data = JSON.parse(readFileSync(baselinePath, "utf8"));
      baseline = data.baseline ?? 0;
    }

    console.log(`a11y button-name violations: ${count} (baseline: ${baseline})`);

    if (count > baseline) {
      console.error(`\nERROR: ${count - baseline} new a11y button-name violation(s) introduced.`);
      for (const v of violations) {
        console.error(`  ${v.file}:${v.line} ${v.type}: ${v.snippet}`);
      }
      console.error("Fix the violations or update the baseline.");
      return 1;
    }

    if (count < baseline) {
      console.log(`\nGreat: ${baseline - count} violation(s) eliminated.`);
      console.log(`Update ${baselinePath} to ${count} to tighten the ratchet.`);
    }

    return 0;
  } catch (error) {
    console.error(`ERRO no a11y-button-name ratchet: ${error.message}`);
    return 2;
  }
}

export function main() {
  const argv = process.argv.slice(2);
  let root = DEFAULT_ROOT;
  let baselinePath = DEFAULT_BASELINE;
  let updateBaseline = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--update-baseline") {
      updateBaseline = true;
    } else if (arg === "--root" || arg === "--baseline") {
      const value = argv[i + 1];
      if (!value) throw new Error(`Valor ausente para ${arg}.`);
      if (arg === "--root") root = value;
      else baselinePath = value;
      i += 1;
    } else if (arg === "--help") {
      console.log(`Uso:
  node scripts/ci/a11y-button-name-ratchet.mjs
  node scripts/ci/a11y-button-name-ratchet.mjs --update-baseline
  node scripts/ci/a11y-button-name-ratchet.mjs --root <dir> --baseline <path>

Opcoes:
  --update-baseline  Reescreve o baseline com a contagem atual
  --root <dir>       Raiz do projeto (padrao: repo root)
  --baseline <path>  Caminho do arquivo baseline`);
      return 0;
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }

  return runRatchet({ root, baselinePath, updateBaseline });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
