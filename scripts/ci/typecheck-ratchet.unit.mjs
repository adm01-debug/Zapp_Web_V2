import assert from "node:assert/strict";
import test from "node:test";
import { compareBaseline, createBaseline, main } from "./typecheck-ratchet.mjs";

const ROOT = "/repo";

const SAMPLE_OUTPUT = [
  "src/lib/audit.ts(31,7): error TS2322: Type 'string | null' is not assignable to type 'string | undefined'.",
  "  Type 'null' is not assignable to type 'string | undefined'.",
  "src/services/role.service.ts(26,9): error TS2339: Property 'catch' does not exist on type 'PromiseLike<AppRole[]>'.",
].join("\n");

test("createBaseline extrai issues com arquivo/linha/codigo/mensagem normalizada", () => {
  const baseline = createBaseline(SAMPLE_OUTPUT, ROOT);
  assert.equal(baseline.schemaVersion, 1);
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
