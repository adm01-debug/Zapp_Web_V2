#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const SCHEMA_VERSION = 1;
const DEFAULT_BASELINE = "scripts/ci/eslint-baseline.json";
const MAX_REPORTED_ISSUES = 50;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeEol(value) {
  return String(value ?? "").replace(/\r\n?/gu, "\n");
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function fileSha256(filePath) {
  return existsSync(filePath) ? sha256(normalizeEol(readFileSync(filePath, "utf8"))) : null;
}

function eslintVersion(root) {
  const packagePath = path.join(root, "node_modules", "eslint", "package.json");
  if (!existsSync(packagePath)) return null;
  try {
    return JSON.parse(readFileSync(packagePath, "utf8")).version ?? null;
  } catch {
    return null;
  }
}

function normalizeFilePath(filePath, root) {
  const absoluteRoot = path.resolve(root);
  const absoluteFile = path.resolve(filePath);
  const relative = path.relative(absoluteRoot, absoluteFile);

  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..")) {
    return (relative || ".").split(path.sep).join("/");
  }

  return absoluteFile.split(path.sep).join("/");
}

function normalizeMessage(message, root) {
  const absoluteRoot = path.resolve(root);
  const rootVariants = new Set([
    absoluteRoot,
    absoluteRoot.split(path.sep).join("/"),
    absoluteRoot.split(path.sep).join("\\"),
  ]);

  let normalized = normalizeEol(message);
  for (const rootVariant of rootVariants) {
    if (rootVariant) {
      normalized = normalized.split(rootVariant).join("<ROOT>");
    }
  }

  return normalizeWhitespace(normalized);
}

function position(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function sourceSpan(lines, message) {
  const line = position(message.line);
  const column = position(message.column);
  const endLine = position(message.endLine);
  const endColumn = position(message.endColumn);

  if (!line || !column || !endLine || !endColumn || endLine < line) {
    return "";
  }

  const parts = [];
  for (let currentLine = line; currentLine <= endLine; currentLine += 1) {
    const sourceLine = lines[currentLine - 1] ?? "";
    const start = currentLine === line ? column - 1 : 0;
    const end = currentLine === endLine ? Math.max(start, endColumn - 1) : sourceLine.length;
    parts.push(sourceLine.slice(start, end));
  }

  return normalizeWhitespace(parts.join("\n"));
}

function sourceAnchors(source, message) {
  if (typeof source !== "string") {
    return { spanHash: null, lineHash: null, contextHash: null };
  }

  const lines = normalizeEol(source).split("\n");
  const lineIndex = position(message.line) - 1;
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return { spanHash: null, lineHash: null, contextHash: null };
  }

  const line = normalizeWhitespace(lines[lineIndex]);
  let previous = "";
  let next = "";
  for (let index = lineIndex - 1; index >= 0 && !previous; index -= 1) {
    previous = normalizeWhitespace(lines[index]);
  }
  for (let index = lineIndex + 1; index < lines.length && !next; index += 1) {
    next = normalizeWhitespace(lines[index]);
  }
  const span = sourceSpan(lines, message);

  return {
    spanHash: span ? sha256(span) : null,
    lineHash: line ? sha256(line) : null,
    contextHash: previous || next ? sha256([previous, line, next].join("\n")) : null,
  };
}

function readResultSource(result, root) {
  if (typeof result.source === "string") {
    return normalizeEol(result.source);
  }

  const filePath = path.resolve(result.filePath);
  const relative = path.relative(path.resolve(root), filePath);
  const insideRoot = relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
  if (!insideRoot || !existsSync(filePath)) {
    return null;
  }

  return normalizeEol(readFileSync(filePath, "utf8"));
}

function normalizeIssue(result, message, root, source) {
  const anchors = sourceAnchors(source, message);
  return {
    file: normalizeFilePath(result.filePath, root),
    line: position(message.line),
    column: position(message.column),
    endLine: position(message.endLine),
    endColumn: position(message.endColumn),
    severity: Number(message.severity) || 0,
    ruleId: message.ruleId ?? null,
    messageId: message.messageId ?? null,
    message: normalizeMessage(message.message, root),
    ...anchors,
  };
}

function issueSortKey(issue) {
  return JSON.stringify([
    issue.file,
    issue.line,
    issue.column,
    issue.endLine,
    issue.endColumn,
    issue.severity,
    issue.ruleId,
    issue.messageId,
    issue.message,
    issue.spanHash,
    issue.lineHash,
    issue.contextHash,
  ]);
}

function createSnapshot(report, root = process.cwd()) {
  if (!Array.isArray(report)) {
    throw new TypeError("O relatorio do ESLint deve ser um array JSON.");
  }

  const files = [];
  const issues = [];
  const scannedFiles = [];

  for (const result of report) {
    if (!result || typeof result.filePath !== "string" || !Array.isArray(result.messages)) {
      throw new TypeError("Entrada invalida no relatorio JSON do ESLint.");
    }

    const source = readResultSource(result, root);
    const normalizedPath = normalizeFilePath(result.filePath, root);
    scannedFiles.push(normalizedPath);
    const normalizedIssues = [];
    for (const message of result.messages) {
      if ((Number(message.severity) || 0) > 0) {
        normalizedIssues.push(normalizeIssue(result, message, root, source));
      }
    }

    if (normalizedIssues.length > 0) {
      files.push({
        path: normalizedPath,
        sha256: source === null ? null : sha256(source),
      });
    }
    issues.push(...normalizedIssues);
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  issues.sort((left, right) => issueSortKey(left).localeCompare(issueSortKey(right)));
  scannedFiles.sort();

  return {
    schemaVersion: SCHEMA_VERSION,
    command: "eslint . --format json",
    eslintVersion: eslintVersion(root),
    eslintConfigSha256: fileSha256(path.join(root, "eslint.config.js")),
    files,
    issues,
    scannedFiles,
  };
}

export function createBaseline(report, root = process.cwd()) {
  const baseline = createSnapshot(report, root);
  delete baseline.scannedFiles;
  return baseline;
}

function validateBaseline(baseline) {
  if (
    !baseline ||
    baseline.schemaVersion !== SCHEMA_VERSION ||
    baseline.command !== "eslint . --format json" ||
    !(typeof baseline.eslintVersion === "string" || baseline.eslintVersion === null) ||
    !(typeof baseline.eslintConfigSha256 === "string" || baseline.eslintConfigSha256 === null) ||
    !Array.isArray(baseline.files) ||
    !Array.isArray(baseline.issues)
  ) {
    throw new Error(`Baseline ESLint invalido ou com schema diferente de ${SCHEMA_VERSION}.`);
  }
}

function uniqueRenameAliases(baseline, current) {
  const baselinePaths = new Set(baseline.files.map((file) => file.path));
  const currentPaths = new Set(current.scannedFiles);
  const missingByHash = new Map();
  const addedByHash = new Map();

  for (const file of baseline.files) {
    if (file.sha256 && !currentPaths.has(file.path)) {
      const paths = missingByHash.get(file.sha256) ?? [];
      paths.push(file.path);
      missingByHash.set(file.sha256, paths);
    }
  }

  for (const file of current.files) {
    if (file.sha256 && !baselinePaths.has(file.path)) {
      const paths = addedByHash.get(file.sha256) ?? [];
      paths.push(file.path);
      addedByHash.set(file.sha256, paths);
    }
  }

  const aliases = new Map();
  for (const [hash, missingPaths] of missingByHash) {
    const addedPaths = addedByHash.get(hash) ?? [];
    if (missingPaths.length === 1 && addedPaths.length === 1) {
      aliases.set(addedPaths[0], missingPaths[0]);
    }
  }

  return aliases;
}

function locationKey(issue, canonicalFile) {
  return JSON.stringify([
    canonicalFile,
    issue.line,
    issue.column,
    issue.endLine,
    issue.endColumn,
    issue.severity,
    issue.ruleId,
    issue.messageId,
    issue.message,
    issue.spanHash,
    issue.lineHash,
  ]);
}

function anchoredKey(issue, canonicalFile, anchorField) {
  if (!issue[anchorField]) return null;

  return JSON.stringify([
    canonicalFile,
    issue.severity,
    issue.ruleId,
    issue.messageId,
    issue.message,
    issue[anchorField],
  ]);
}

function matchPhase(baselineIssues, currentIssues, baselineMatched, currentMatched, keyForIssue) {
  const available = new Map();

  for (let index = 0; index < baselineIssues.length; index += 1) {
    if (baselineMatched.has(index)) continue;
    const key = keyForIssue(baselineIssues[index], baselineIssues[index].file);
    if (key === null) continue;
    const indices = available.get(key) ?? [];
    indices.push(index);
    available.set(key, indices);
  }

  for (let index = 0; index < currentIssues.length; index += 1) {
    if (currentMatched.has(index)) continue;
    const { issue, canonicalFile } = currentIssues[index];
    const key = keyForIssue(issue, canonicalFile);
    if (key === null) continue;
    const candidates = available.get(key);
    if (!candidates?.length) continue;

    const baselineIndex = candidates.shift();
    baselineMatched.add(baselineIndex);
    currentMatched.add(index);
  }
}

export function compareBaseline(baseline, report, root = process.cwd()) {
  validateBaseline(baseline);
  const current = createSnapshot(report, root);
  if (
    baseline.eslintVersion !== current.eslintVersion ||
    baseline.eslintConfigSha256 !== current.eslintConfigSha256
  ) {
    throw new Error(
      "O ESLint ou eslint.config.js mudou desde a geracao do baseline. Revise a mudanca e regenere o baseline.",
    );
  }
  const aliases = uniqueRenameAliases(baseline, current);
  const currentIssues = current.issues.map((issue) => ({
    issue,
    canonicalFile: aliases.get(issue.file) ?? issue.file,
  }));
  const baselineMatched = new Set();
  const currentMatched = new Set();

  matchPhase(baseline.issues, currentIssues, baselineMatched, currentMatched, locationKey);
  matchPhase(
    baseline.issues,
    currentIssues,
    baselineMatched,
    currentMatched,
    (issue, canonicalFile) => anchoredKey(issue, canonicalFile, "contextHash"),
  );

  const added = currentIssues
    .filter((_, index) => !currentMatched.has(index))
    .map(({ issue }) => issue);
  const removed = baseline.issues.filter((_, index) => !baselineMatched.has(index));

  return {
    baselineCount: baseline.issues.length,
    currentCount: current.issues.length,
    matchedCount: currentMatched.size,
    added,
    removed,
    renameAliases: Object.fromEntries([...aliases.entries()].sort()),
  };
}

function parseArguments(argv) {
  const options = {
    baseline: DEFAULT_BASELINE,
    report: null,
    root: process.cwd(),
    updateBaseline: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--update-baseline") {
      options.updateBaseline = true;
    } else if (argument === "--baseline" || argument === "--report" || argument === "--root") {
      const value = argv[index + 1];
      if (!value) throw new Error(`Valor ausente para ${argument}.`);
      options[argument.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
    } else if (argument === "--help") {
      options.help = true;
    } else {
      throw new Error(`Argumento desconhecido: ${argument}`);
    }
  }

  options.root = path.resolve(options.root);
  options.baseline = path.resolve(options.root, options.baseline);
  if (options.report) options.report = path.resolve(options.root, options.report);
  return options;
}

function runEslint(root) {
  const eslintEntry = path.join(root, "node_modules", "eslint", "bin", "eslint.js");
  if (!existsSync(eslintEntry)) {
    throw new Error("ESLint local nao encontrado. Execute a instalacao das dependencias primeiro.");
  }

  const result = spawnSync(process.execPath, [eslintEntry, ".", "--format", "json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`ESLint falhou com exit ${result.status}: ${normalizeWhitespace(result.stderr)}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`ESLint nao produziu JSON valido: ${error.message}`);
  }
}

function readJson(filePath, description) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Nao foi possivel ler ${description} em ${filePath}: ${error.message}`);
  }
}

function formatIssue(issue) {
  const severity = issue.severity === 2 ? "error" : "warning";
  const rule = issue.ruleId ?? "parser";
  return `${issue.file}:${issue.line}:${issue.column} ${severity} ${rule} - ${issue.message}`;
}

export function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArguments(argv);
    if (options.help) {
      console.log(`Uso:
  node scripts/ci/lint-ratchet.mjs
  node scripts/ci/lint-ratchet.mjs --update-baseline

Opcoes de teste: --report <eslint.json> --baseline <arquivo> --root <diretorio>`);
      return 0;
    }

    const report = options.report ? readJson(options.report, "relatorio ESLint") : runEslint(options.root);
    const current = createBaseline(report, options.root);

    if (options.updateBaseline) {
      writeFileSync(options.baseline, `${JSON.stringify(current, null, 2)}\n`, "utf8");
      console.log(`Baseline ESLint atualizado: ${current.issues.length} ocorrencias em ${options.baseline}`);
      return 0;
    }

    const baseline = readJson(options.baseline, "baseline ESLint");
    const comparison = compareBaseline(baseline, report, options.root);
    console.log(
      `Lint ratchet: baseline=${comparison.baselineCount}, atual=${comparison.currentCount}, ` +
        `mantidas=${comparison.matchedCount}, removidas=${comparison.removed.length}, novas=${comparison.added.length}`,
    );

    const aliases = Object.entries(comparison.renameAliases);
    for (const [currentFile, baselineFile] of aliases) {
      console.log(`Arquivo renomeado reconhecido: ${baselineFile} -> ${currentFile}`);
    }

    if (comparison.added.length === 0) {
      console.log("OK: nenhuma nova divida de lint foi introduzida.");
      return 0;
    }

    console.error("FALHA: novas ocorrencias de lint detectadas:");
    for (const issue of comparison.added.slice(0, MAX_REPORTED_ISSUES)) {
      console.error(`  ${formatIssue(issue)}`);
    }
    if (comparison.added.length > MAX_REPORTED_ISSUES) {
      console.error(`  ... e mais ${comparison.added.length - MAX_REPORTED_ISSUES} ocorrencias.`);
    }
    console.error(
      "Corrija as novas ocorrencias. Atualize o baseline somente quando a nova divida tiver aprovacao explicita.",
    );
    return 1;
  } catch (error) {
    console.error(`ERRO no lint ratchet: ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
