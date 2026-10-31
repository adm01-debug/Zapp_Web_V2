#!/usr/bin/env node
// Ratchet: fails CI if noImplicitAny error count grows above baseline.
// To tighten: fix errors, update baseline.json to the new lower count.
//
// R2-INF-008: falha OPERACIONAL do compilador nao pode virar "zero erros
// implicitos". Antes, qualquer erro do subprocesso era capturado e contado
// apenas por "error TS7": um compilador ausente (MODULE_NOT_FOUND), uma config
// quebrada (TS5058/TS5023) ou um diagnostico GLOBAL sem coordenadas (TS5083)
// produziam zero ocorrencias, o script anunciava "implicit-any errors: 0
// (baseline: 0)" e saia 0 - o falso zero. Como os baselines estao em zero, nao
// havia queda de contagem que alertasse.
//
// Agora o resultado do compilador passa por assertUsableCompilerResult: exit
// fora de {0,1,2}, compilador ausente, diagnostico global (linha comecando com
// "error TS####:"/"warning TS####:", sem arquivo(linha,coluna)) ou exit nao-zero
// sem NENHUM diagnostico reconhecivel sao falha explicita (exit 2). Um run
// valido - inclusive com erros de tipo que nao sejam TS7 - segue normal.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASELINE = join(__dirname, "implicit-any-baseline.json");
const DEFAULT_ROOT = join(__dirname, "..", "..");
const COMMAND = "tsc -p tsconfig.app.json --noEmit --noImplicitAny";
const COUNT_PATTERN = /error TS7/g;
const MAX_COMPILER_SNIPPET = 500;

function normalizeEol(value) {
  return String(value ?? "").replace(/\r\n?/gu, "\n");
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function snippet(value) {
  return normalizeWhitespace(value).slice(0, MAX_COMPILER_SNIPPET) || "(vazia)";
}

// Diagnostico GLOBAL do tsc: a linha COMECA com "error TS####:"/"warning
// TS####:" - sem o prefixo arquivo(linha,coluna) que os diagnosticos por
// arquivo tem. Ex.: TS5083 (arquivo/config ilegivel), TS5058 (caminho
// inexistente), TS5023 (opcao desconhecida), TS18003 (nenhuma entrada). Sao
// falhas operacionais: a CLI/config quebrou e o programa NAO foi validado.
// Um diagnostico por arquivo sempre comeca com o caminho, entao nao casa com
// este padrao ancorado no inicio da linha.
const GLOBAL_DIAGNOSTIC = /^(?:error|warning) TS\d+:/mu;
// Qualquer diagnostico reconhecivel do tsc (global ou por arquivo).
const TSC_DIAGNOSTIC = /(?:error|warning) TS\d+:/u;

// Decide se a saida do compilador pode alimentar o ratchet. Exit 0 e typecheck
// limpo (saida vazia inclusa), logo e sempre valido. Exit 1/2 afirmam que o tsc
// rodou e ENCONTROU erro(s), entao so seguem com diagnostico reconhecivel; um
// diagnostico global ou uma saida sem nenhum diagnostico TS sao falha
// operacional que nao pode ser contada como "zero erros implicitos".
export function assertUsableCompilerResult(status, output) {
  if (status !== 0 && status !== 1 && status !== 2) {
    throw new Error(`tsc saiu com exit ${status} (falha de CLI, nao lista de diagnosticos): ${snippet(output)}`);
  }

  const text = normalizeEol(output);
  if (status === 0) return text;

  if (GLOBAL_DIAGNOSTIC.test(text)) {
    throw new Error(
      `tsc saiu com exit ${status} com diagnostico GLOBAL (config/CLI quebrada), que nao e uma ` +
        `lista valida de erros de tipo. O ratchet se recusa a tratar isso como zero erros. Saida: ${snippet(text)}`,
    );
  }

  if (!TSC_DIAGNOSTIC.test(text)) {
    throw new Error(
      `tsc saiu com exit ${status} sem nenhum diagnostico TypeScript reconhecivel ` +
        `(esperado "error TS####" ou "arquivo(linha,coluna): error TS####"). ` +
        `O ratchet se recusa a tratar isso como zero erros. Saida: ${snippet(text)}`,
    );
  }

  return text;
}

// tsc local por caminho absoluto (node + node_modules/typescript/bin/tsc): nao
// passa por npx nem deixa o processo filho resolver o comando pelo PATH (S4036).
// A ausencia do compilador e falha explicita, nunca zero erros.
export function runTsc(root) {
  const tscEntry = join(root, "node_modules", "typescript", "bin", "tsc");
  if (!existsSync(tscEntry)) {
    throw new Error(
      `TypeScript local nao encontrado em ${tscEntry}. ` +
        `A ausencia do compilador e falha operacional, nao "zero erros implicitos". ` +
        `Rode a instalacao das dependencias (${COMMAND}).`,
    );
  }

  const result = spawnSync(process.execPath, [tscEntry, "-p", "tsconfig.app.json", "--noEmit", "--noImplicitAny"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) throw result.error;

  return assertUsableCompilerResult(result.status, `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
}

export function runRatchet({ root = DEFAULT_ROOT, baselinePath = DEFAULT_BASELINE } = {}) {
  try {
    const { baseline } = JSON.parse(readFileSync(baselinePath, "utf8"));
    const output = runTsc(root);
    const count = (output.match(COUNT_PATTERN) ?? []).length;
    console.log(`implicit-any errors: ${count} (baseline: ${baseline})`);

    if (count > baseline) {
      console.error(`\nERROR: ${count - baseline} new implicit-any error(s) introduced.`);
      console.error("Fix them or update scripts/ci/implicit-any-baseline.json.");
      return 1;
    }

    if (count < baseline) {
      console.log(`\nGreat: ${baseline - count} error(s) eliminated.`);
      console.log(`Update scripts/ci/implicit-any-baseline.json to ${count} to tighten the ratchet.`);
    }

    return 0;
  } catch (error) {
    console.error(`ERRO no implicit-any ratchet: ${error.message}`);
    return 2;
  }
}

export function main() {
  return runRatchet();
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
