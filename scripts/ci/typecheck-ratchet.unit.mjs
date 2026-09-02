import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { compareBaseline, createBaseline, main } from "./typecheck-ratchet.mjs";

const ROOT = "/repo";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "typecheck-ratchet-"));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

const SAMPLE_OUTPUT = [
  "src/lib/audit.ts(31,7): error TS2322: Type 'string | null' is not assignable to type 'string | undefined'.",
  "  Type 'null' is not assignable to type 'string | undefined'.",
  "src/services/role.service.ts(26,9): error TS2339: Property 'catch' does not exist on type 'PromiseLike<AppRole[]>'.",
].join("\n");

test("createBaseline extrai issues com arquivo/linha/codigo/mensagem normalizada", () => {
  const baseline = createBaseline(SAMPLE_OUTPUT, ROOT);
  assert.equal(baseline.schemaVersion, 2);
  assert.equal(baseline.issues.length, 2);
  assert.equal(baseline.issues[0].code, "TS2322");
  assert.match(
    baseline.issues[0].message,
    /Type 'string \| null' is not assignable.*Type 'null' is not assignable/,
  );
});

test("compareBaseline nao acusa nada novo quando a saida bate com o baseline", () => {
  const baseline = createBaseline(SAMPLE_OUTPUT, ROOT);
  const comparison = compareBaseline(baseline, SAMPLE_OUTPUT, ROOT);
  assert.equal(comparison.added.length, 0);
  assert.equal(comparison.removed.length, 0);
  assert.equal(comparison.currentCount, 2);
});

test("compareBaseline acusa erro novo introduzido", () => {
  const baseline = createBaseline(SAMPLE_OUTPUT, ROOT);
  const withNewError =
    SAMPLE_OUTPUT + "\nsrc/new-file.ts(1,1): error TS9999: erro novo que nao existia antes.";
  const comparison = compareBaseline(baseline, withNewError, ROOT);
  assert.equal(comparison.added.length, 1);
  assert.equal(comparison.added[0].code, "TS9999");
  assert.equal(comparison.removed.length, 0);
});

test("compareBaseline reconhece erro corrigido (removido) sem falhar", () => {
  const baseline = createBaseline(SAMPLE_OUTPUT, ROOT);
  const onlyOneLeft = SAMPLE_OUTPUT.split("\n").slice(0, 2).join("\n");
  const comparison = compareBaseline(baseline, onlyOneLeft, ROOT);
  assert.equal(comparison.added.length, 0);
  assert.equal(comparison.removed.length, 1);
  assert.equal(comparison.removed[0].code, "TS2339");
});

test("compareBaseline trata mudanca de linha no mesmo erro como nao-novo (multiset por file+code+message)", () => {
  const baseline = createBaseline(SAMPLE_OUTPUT, ROOT);
  const shiftedLine = SAMPLE_OUTPUT.replace(
    "src/lib/audit.ts(31,7)",
    "src/lib/audit.ts(45,7)",
  );
  const comparison = compareBaseline(baseline, shiftedLine, ROOT);
  assert.equal(comparison.added.length, 0);
  assert.equal(comparison.removed.length, 0);
});

test("compareBaseline distingue duas ocorrencias iguais de uma so (multiset real)", () => {
  const baseline = createBaseline(SAMPLE_OUTPUT, ROOT);
  const duplicated = SAMPLE_OUTPUT + "\nsrc/services/role.service.ts(99,1): error TS2339: Property 'catch' does not exist on type 'PromiseLike<AppRole[]>'.";
  const comparison = compareBaseline(baseline, duplicated, ROOT);
  assert.equal(comparison.added.length, 1, "a segunda ocorrencia identica deve contar como nova (multiset)");
});

test("compareBaseline detecta troca real (uma ocorrencia corrigida + outra identica nova) quando o contexto de codigo esta disponivel", () => {
  const { root, cleanup } = fixture();
  try {
    mkdirSync(path.join(root, "src"), { recursive: true });
    const filePath = path.join(root, "src", "widget.tsx");
    // "a" isolada no topo (sera removida). "b"/"c" protegidas por linhas
    // "escudo" nos dois lados, para que remover "a" e adicionar "d" no fim
    // NAO toquem no contexto (vizinho imediato) de b/c — o unico jeito de
    // provar que a fase ancorada distingue as ocorrencias sem depender de
    // deslocamento incidental de linha.
    const before = [
      "// fn a",
      "function a() { return contact.tags.join(','); }",
      "// shield-top",
      "function b() { return contact.tags.join(';'); }",
      "function c() { return contact.tags.join('-'); }",
      "// shield-bottom",
    ].join("\n") + "\n";
    writeFileSync(filePath, before, "utf8");
    const baselineOutput = [
      "src/widget.tsx(2,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
      "src/widget.tsx(4,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
      "src/widget.tsx(5,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
    ].join("\n");
    const baseline = createBaseline(baselineOutput, root);

    // Remove "a" (corrigida) do topo e acrescenta "d" (identica, nova) no
    // fim. Contagem total permanece 3 -> um multiset puro por chave nao
    // veria diferenca nenhuma nisso.
    const after = [
      "// shield-top",
      "function b() { return contact.tags.join(';'); }",
      "function c() { return contact.tags.join('-'); }",
      "// shield-bottom",
      "// fn d",
      "function d() { return contact.tags.join('|'); }",
    ].join("\n") + "\n";
    writeFileSync(filePath, after, "utf8");
    const currentOutput = [
      "src/widget.tsx(2,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
      "src/widget.tsx(3,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
      "src/widget.tsx(6,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
    ].join("\n");

    const comparison = compareBaseline(baseline, currentOutput, root);
    assert.equal(comparison.added.length, 1, "a ocorrencia nova na funcao d deveria ser detectada");
    assert.equal(comparison.added[0].line, 6);
    assert.equal(comparison.removed.length, 1, "a ocorrencia corrigida na funcao a deveria sumir do baseline");
  } finally {
    cleanup();
  }
});

test("compareBaseline nao acusa nada quando ocorrencias identicas permanecem intactas apesar de edicao nao relacionada no arquivo", () => {
  const { root, cleanup } = fixture();
  try {
    mkdirSync(path.join(root, "src"), { recursive: true });
    const filePath = path.join(root, "src", "widget.tsx");
    const before = [
      "// shield-top",
      "function a() { return contact.tags.join(','); }",
      "function b() { return contact.tags.join(';'); }",
      "// shield-bottom",
    ].join("\n") + "\n";
    writeFileSync(filePath, before, "utf8");
    const baselineOutput = [
      "src/widget.tsx(2,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
      "src/widget.tsx(3,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
    ].join("\n");
    const baseline = createBaseline(baselineOutput, root);

    // Insere uma linha nao relacionada acima do escudo: as duas ocorrencias
    // continuam existindo, so deslocadas — o vizinho imediato de cada uma
    // (o proprio escudo / a outra funcao) nao muda.
    const after = `// cabecalho novo\n${before}`;
    writeFileSync(filePath, after, "utf8");
    const currentOutput = [
      "src/widget.tsx(3,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
      "src/widget.tsx(4,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
    ].join("\n");

    const comparison = compareBaseline(baseline, currentOutput, root);
    assert.equal(comparison.added.length, 0);
    assert.equal(comparison.removed.length, 0);
  } finally {
    cleanup();
  }
});

test("main() com --help retorna 0 sem exigir baseline/relatorio", () => {
  const exitCode = main(["--help"]);
  assert.equal(exitCode, 0);
});

test("main() falha (2) quando o baseline informado nao existe", () => {
  const exitCode = main([
    "--output", "/nonexistent/tsc-output-that-does-not-exist.txt",
    "--baseline", "/nonexistent/baseline-that-does-not-exist.json",
  ]);
  assert.equal(exitCode, 2);
});
