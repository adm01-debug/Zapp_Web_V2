#!/usr/bin/env node

// tsc --noEmit (sem -p/-b) e um no-op nesta config: tsconfig.json tem "files": []
// e so "references" para tsconfig.app.json/tsconfig.node.json. Sem "--build", o
// tsc nao resolve as referencias e sai com exit 0 sem checar nenhum arquivo. O
// jeito correto de checar um projeto com references e "tsc --build" (-b), que
// respeita noEmit de cada projeto referenciado e falha de verdade se houver erro.
//
// O repo possui divida de tipos legada (confirmada rodando "tsc -b" de verdade,
// nao o comando quebrado). Este ratchet segue o mesmo principio do lint-ratchet.mjs:
// compara ocorrencias contra um baseline e falha so se uma NOVA ocorrencia aparecer.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const SCHEMA_VERSION = 1;
const DEFAULT_BASELINE = "scripts/ci/typecheck-baseline.json";
const COMMAND = "tsc -b --force";
const MAX_REPORTED_ISSUES = 50;

function normalizeEol(value) {
  return String(value ?? "").replace(/\r\n?/gu, "\n");
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function normalizeFilePath(filePath, root) {
  const absoluteRoot = path.resolve(root);
  const absoluteFile = path.resolve(root, filePath);
  const relative = path.relative(absoluteRoot, absoluteFile);
  return (relative || ".").split(path.sep).join("/");
}

// Saida do tsc: "path/to/file.ts(12,34): error TS2322: mensagem\n  continuacao indentada\n..."
const ISSUE_HEADER = /^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.*)$/u;

function parseTscOutput(output, root) {
  const lines = normalizeEol(output).split("\n");
  const issues = [];
  let current = null;

  for (const rawLine of lines) {
    const header = ISSUE_HEADER.exec(rawLine);
    if (header) {
      if (current) issues.push(current);
      const [, file, line, column, severity, code, firstMessageLine] = header;
      current = {
        file: normalizeFilePath(file, root),
        line: Number(line),
        column: Number(column),
        severity,
        code,
        messageLines: [firstMessageLine],
      };
    } else if (current && rawLine.trim().length > 0) {
      current.messageLines.push(rawLine.trim());
    }
  }
  if (current) issues.push(current);

  return issues
    .map((issue) => ({
      file: issue.file,
      line: issue.line,
      column: issue.column,
      severity: issue.severity,
      code: issue.code,
      message: normalizeWhitespace(issue.messageLines.join(" ")),
    }))
    .sort((a, b) =>
      JSON.stringify([a.file, a.code, a.message, a.line, a.column]).localeCompare(
        JSON.stringify([b.file, b.code, b.message, b.line, b.column]),
      ),
    );
}

// Chave de correspondencia deliberadamente SEM linha/coluna: um erro identico
// (mesmo arquivo + mesmo codigo TS + mesma mensagem) continua sendo o "mesmo"
// erro conhecido mesmo que outra edicao no arquivo desloque a linha. Se o
// numero de ocorrencias iguais mudar (multiset), conta como novo/removido.
function issueKey(issue) {
  return JSON.stringify([issue.file, issue.severity, issue.code, issue.message]);
}

function diffMultisets(baselineIssues, currentIssues) {
  const baselineByKey = new Map();
  for (const issue of baselineIssues) {
    const key = issueKey(issue);
    const bucket = baselineByKey.get(key) ?? [];
    bucket.push(issue);
    baselineByKey.set(key, bucket);
  }

  const added = [];
  for (const issue of currentIssues) {
    const key = issueKey(issue);
    const bucket = baselineByKey.get(key);
    if (bucket && bucket.length > 0) {
      bucket.pop();
    } else {
      added.push(issue);
    }
  }

  const removed = [...baselineByKey.values()].flat();
  return { added, removed };
}

export function createBaseline(output, root = process.cwd()) {
  const issues = parseTscOutput(output, root);
  return { schemaVersion: SCHEMA_VERSION, command: COMMAND, issues };
}

function validateBaseline(baseline) {
  if (!baseline || baseline.schemaVersion !== SCHEMA_VERSION || !Array.isArray(baseline.issues)) {
    throw new Error(`Baseline de typecheck invalido ou com schema diferente de ${SCHEMA_VERSION}.`);
  }
}

export function compareBaseline(baseline, output, root = process.cwd()) {
  validateBaseline(baseline);
  const current = parseTscOutput(output, root);
  const { added, removed } = diffMultisets(baseline.issues, current);
  return {
    baselineCount: baseline.issues.length,
    currentCount: current.length,
    added,
    removed,
  };
}

function runTsc(root) {
  const tscEntry = path.join(root, "node_modules", "typescript", "bin", "tsc");
  if (!existsSync(tscEntry)) {
    throw new Error("TypeScript local nao encontrado. Execute a instalacao das dependencias primeiro.");
  }

  // -b/--build respeita "references" (o unico jeito correto de checar este
  // repo). --force ignora o cache incremental para nunca reportar falso-verde.
  const result = spawnSync(process.execPath, [tscEntry, "-b", "--force"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  // tsc -b sai com 1 quando ha erro de tipo (esperado), 2 em erro de config/CLI.
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`tsc -b falhou com exit ${result.status}: ${normalizeWhitespace(result.stderr)}`);
  }

  return `${result.stdout}\n${result.stderr}`;
}

function parseArguments(argv) {
  const options = { baseline: DEFAULT_BASELINE, output: null, root: process.cwd(), updateBaseline: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--update-baseline") {
      options.updateBaseline = true;
    } else if (argument === "--baseline" || argument === "--output" || argument === "--root") {
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
  if (options.output) options.output = path.resolve(options.root, options.output);
  return options;
}

function readJson(filePath, description) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Nao foi possivel ler ${description} em ${filePath}: ${error.message}`);
  }
}

function formatIssue(issue) {
  return `${issue.file}(${issue.line},${issue.column}) ${issue.severity} ${issue.code} - ${issue.message}`;
}

export function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArguments(argv);
    if (options.help) {
      console.log(`Uso:
  node scripts/ci/typecheck-ratchet.mjs
  node scripts/ci/typecheck-ratchet.mjs --update-baseline

Opcoes de teste: --output <tsc.txt> --baseline <arquivo> --root <diretorio>`);
      return 0;
    }

    const output = options.output ? readFileSync(options.output, "utf8") : runTsc(options.root);

    if (options.updateBaseline) {
      const baseline = createBaseline(output, options.root);
      writeFileSync(options.baseline, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
      console.log(`Baseline de typecheck atualizado: ${baseline.issues.length} ocorrencias em ${options.baseline}`);
      return 0;
    }

    const baseline = readJson(options.baseline, "baseline de typecheck");
    const comparison = compareBaseline(baseline, output, options.root);
    console.log(
      `Typecheck ratchet: baseline=${comparison.baselineCount}, atual=${comparison.currentCount}, ` +
        `removidas=${comparison.removed.length}, novas=${comparison.added.length}`,
    );

    if (comparison.added.length === 0) {
      console.log("OK: nenhum novo erro de tipo foi introduzido.");
      return 0;
    }

    console.error("FALHA: novos erros de tipo detectados:");
    for (const issue of comparison.added.slice(0, MAX_REPORTED_ISSUES)) {
      console.error(`  ${formatIssue(issue)}`);
    }
    if (comparison.added.length > MAX_REPORTED_ISSUES) {
      console.error(`  ... e mais ${comparison.added.length - MAX_REPORTED_ISSUES} ocorrencias.`);
    }
    console.error(
      "Corrija os novos erros. Atualize o baseline somente quando a nova divida tiver aprovacao explicita.",
    );
    return 1;
  } catch (error) {
    console.error(`ERRO no typecheck ratchet: ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
