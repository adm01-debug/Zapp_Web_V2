import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { TIPOS, validarMensagem } from "./commit-msg-lint.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = path.join(RAIZ, ".husky", "commit-msg");

test("aceita as mensagens do padrao do repositorio", () => {
  const aceitas = [
    "feat(contatos): adiciona a coluna origem no cartao",
    "fix(hooks): mantem o carregando limpo na resposta obsoleta",
    "docs: plano de Contatos por jornada do vendedor",
    "chore(edge-deploy): regenera o manifesto de deploy",
    "feat(api)!: remove o campo legado do retorno",
    "ci: liga o gate de mensagem de commit",
    "fix(inbox/contato): rotulo de e-mail sem subtitulo",
  ];
  for (const mensagem of aceitas) {
    const { ok, problemas } = validarMensagem(`${mensagem}\n`);
    assert.equal(ok, true, `${mensagem} deveria passar: ${problemas.join("; ")}`);
  }
});

test("aceita os 12 tipos do padrao e recusa qualquer outro", () => {
  assert.deepEqual(TIPOS, [
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
  ]);
  for (const tipo of TIPOS) {
    const { ok, problemas } = validarMensagem(`${tipo}(escopo): assunto com tamanho suficiente`);
    assert.equal(ok, true, `${tipo} deveria passar: ${problemas.join("; ")}`);
  }
  for (const tipo of ["feature", "Fix", "FIX", "wip", "hotfix"]) {
    assert.equal(
      validarMensagem(`${tipo}: assunto com tamanho suficiente`).ok,
      false,
      `${tipo} deveria ser recusado`,
    );
  }
});

test("recusa cabecalho fora do formato", () => {
  const recusadas = [
    "adiciona a coluna origem no cartao",
    "feat adiciona a coluna origem no cartao",
    "feat(contatos) adiciona a coluna origem",
    "feat(contatos):assunto colado nos dois-pontos",
  ];
  for (const mensagem of recusadas) {
    const { ok, problemas } = validarMensagem(mensagem);
    assert.equal(ok, false, `${mensagem} deveria ser recusada`);
    assert.ok(problemas.length > 0);
  }
});

test("recusa assunto curto e assunto terminado em ponto final", () => {
  assert.equal(validarMensagem("fix(contatos): curto\n").ok, false);
  assert.equal(
    validarMensagem("fix(contatos): assunto com ponto no final.\n").ok,
    false,
    "config-conventional recusa ponto final no assunto",
  );
});

test("recusa escopo em maiuscula", () => {
  const { ok, problemas } = validarMensagem("fix(Contatos): assunto com tamanho suficiente\n");
  assert.equal(ok, false);
  assert.match(problemas.join("; "), /escopo/u);
});

test("ignora as mensagens que o proprio git cria", () => {
  const geradas = [
    'Merge branch "main" into dia/2026-10-08',
    'Revert "fix(contatos): assunto com tamanho suficiente"',
    "fixup! fix(contatos): assunto com tamanho suficiente",
    "squash! fix(contatos): assunto com tamanho suficiente",
    "amend! fix(contatos): assunto com tamanho suficiente",
  ];
  for (const mensagem of geradas) {
    assert.equal(validarMensagem(mensagem).ok, true, `${mensagem} deveria passar`);
  }
});

test("usa a primeira linha util e ignora os comentarios do git", () => {
  const mensagem = [
    "",
    "# Por favor, digite a mensagem de commit para as suas alteracoes.",
    "feat(contatos): adiciona a coluna origem no cartao",
    "",
    "# Insira o corpo aqui",
  ].join("\n");
  assert.equal(validarMensagem(mensagem).ok, true);
});

test("arquivo so com comentarios nao bloqueia (quem aborta o commit vazio e o git)", () => {
  assert.equal(validarMensagem("\n# nada aqui\n").ok, true);
});

// Prova do canal real: o hook .husky/commit-msg no mesmo caminho de execucao do git
// (shebang, $1 = arquivo de mensagem, codigo de saida) e no diretorio do repositorio.
test("o hook real recusa a mensagem fora do padrao e aceita a mensagem do padrao", () => {
  assert.ok(existsSync(HOOK), `o hook precisa existir: ${HOOK}`);
  const raiz = mkdtempSync(path.join(tmpdir(), "zapp-commit-msg-"));
  try {
    const rodar = (mensagem) => {
      const arquivo = path.join(raiz, "COMMIT_EDITMSG");
      writeFileSync(arquivo, mensagem);
      return spawnSync("sh", [HOOK, arquivo], { cwd: RAIZ, encoding: "utf8" });
    };

    const ruim = rodar("mensagem fora do padrao\n");
    assert.equal(ruim.status, 1, `o hook deveria sair com 1: ${ruim.stdout}${ruim.stderr}`);
    assert.match(ruim.stderr, /fora do padrao/u);

    const bom = rodar("feat(contatos): adiciona a coluna origem no cartao\n");
    assert.equal(bom.status, 0, bom.stderr);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
