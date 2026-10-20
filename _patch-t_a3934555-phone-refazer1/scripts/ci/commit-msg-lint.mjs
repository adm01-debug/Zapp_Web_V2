#!/usr/bin/env node

// Gate de mensagem de commit: a funcao do commitlint sem dependencia nova (os pacotes
// lint-staged/commitlint sao proibidos pelas regras da 2a leva). O hook .husky/commit-msg
// chama este arquivo com o caminho do arquivo de mensagem que o git passa em $1.
//
// Padrao cobrado (CONTRIBUTING.md > Padrao de Commits + etapa 001 do plano de paridade V1/V3):
//   <tipo>(<escopo>): <descricao>   (escopo opcional)
//   tipos: feat fix docs style refactor perf test build ci chore security revert
//   assunto com pelo menos 10 caracteres e sem ponto final.
// Mensagens que o proprio git cria (Merge, Revert, fixup!, squash!, amend!) passam direto.

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const TIPOS = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "security",
  "revert",
];

export const SUBJECT_MIN_LENGTH = 10;

// <tipo>: <assunto>, <tipo>(<escopo>): <assunto> ou <tipo>!: <assunto>
const CABECALHO = /^([a-z]+)(?:\(([^)\s]+)\))?(!)?: (.+)$/u;

// Mensagens montadas pelo proprio git: nao ha o que validar.
const IGNORADAS = /^(?:Merge |Revert |fixup! |squash! |amend! )/u;

export function cabecalhoDaMensagem(mensagem) {
  for (const linha of String(mensagem ?? "").split("\n")) {
    const texto = linha.trim();
    // o git escreve as linhas de comentario (prefixo "#") no fim do arquivo
    if (texto === "" || texto.startsWith("#")) continue;
    return texto;
  }
  return "";
}

export function validarMensagem(mensagem) {
  const cabecalho = cabecalhoDaMensagem(mensagem);
  const problemas = [];
  // Sem cabecalho (arquivo so com comentarios) quem aborta o commit e o git, nao este gate.
  if (cabecalho === "" || IGNORADAS.test(cabecalho)) return { ok: true, cabecalho, problemas };

  const partes = CABECALHO.exec(cabecalho);
  if (!partes) {
    return {
      ok: false,
      cabecalho,
      problemas: ['cabecalho fora do padrao "<tipo>(<escopo>): <descricao>"'],
    };
  }

  const [, tipo, escopo, , assunto] = partes;
  const descricao = assunto.trim();
  if (!TIPOS.includes(tipo)) {
    problemas.push(`tipo "${tipo}" nao aceito (use: ${TIPOS.join(", ")})`);
  }
  if (escopo !== undefined && escopo !== escopo.toLowerCase()) {
    problemas.push(`escopo "${escopo}" deve ser minusculo`);
  }
  if (descricao.length < SUBJECT_MIN_LENGTH) {
    problemas.push(
      `assunto com ${descricao.length} caractere(s): o minimo e ${SUBJECT_MIN_LENGTH}`,
    );
  }
  if (descricao.endsWith(".")) problemas.push("assunto nao termina com ponto final");
  return { ok: problemas.length === 0, cabecalho, problemas };
}

export function main(argv = process.argv.slice(2)) {
  const caminho = argv[0];
  if (!caminho) {
    console.error("uso: node scripts/ci/commit-msg-lint.mjs <arquivo-de-mensagem-do-git>");
    return 2;
  }
  let mensagem;
  try {
    mensagem = readFileSync(caminho, "utf8");
  } catch (error) {
    console.error(`commit-msg: nao consegui ler "${caminho}": ${error.message}`);
    return 2;
  }
  const { cabecalho, problemas } = validarMensagem(mensagem);
  if (problemas.length === 0) return 0;
  console.error("commit-msg: mensagem fora do padrao do repositorio (Conventional Commits).");
  for (const problema of problemas) console.error(`  - ${problema}`);
  console.error(`  cabecalho lido: ${JSON.stringify(cabecalho)}`);
  console.error("  padrao: <tipo>(<escopo>): <descricao> (escopo opcional)");
  console.error(`  tipos: ${TIPOS.join(", ")} (veja CONTRIBUTING.md > Padrao de Commits)`);
  return 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
