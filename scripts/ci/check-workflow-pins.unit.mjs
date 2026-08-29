import assert from "node:assert/strict";
import test from "node:test";

import { findMutableActionRefs } from "./check-workflow-pins.mjs";

test("aceita action remota fixada por SHA completo", () => {
  const source = `steps:\n  - uses: actions/checkout@${"a".repeat(40)} # v7.0.1\n`;
  assert.deepEqual(findMutableActionRefs(source), []);
});

test("aceita actions locais e imagens docker", () => {
  const source = "steps:\n  - uses: ./path/action\n  - uses: docker://alpine:3.22\n";
  assert.deepEqual(findMutableActionRefs(source), []);
});

test("rejeita tag, branch e SHA abreviado", () => {
  const source = [
    "steps:",
    "  - uses: actions/checkout@v7",
    "  - uses: owner/action@main",
    "  - uses: owner/action@abc1234",
  ].join("\n");
  assert.deepEqual(
    findMutableActionRefs(source).map(({ line, reference }) => ({ line, reference })),
    [
      { line: 2, reference: "actions/checkout@v7" },
      { line: 3, reference: "owner/action@main" },
      { line: 4, reference: "owner/action@abc1234" },
    ],
  );
});

test("aceita action em subdiretorio com aspas", () => {
  const source = `jobs:\n  reusable:\n    uses: "owner/repo/path@${"f".repeat(40)}" # release\n`;
  assert.deepEqual(findMutableActionRefs(source), []);
});

test("rejeita uses vazio seguido por valor multilinha", () => {
  const source = "steps:\n  - uses:\n      owner/action@main\n";
  assert.deepEqual(
    findMutableActionRefs(source).map(({ line, reference }) => ({ line, reference })),
    [{ line: 2, reference: "<missing-or-multiline-value>" }],
  );
});

test("rejeita escalares YAML folded e literal em uses", () => {
  const source = [
    "steps:",
    "  - uses: >-",
    "      owner/action@main",
    "  - uses: |",
    `      owner/action@${"a".repeat(40)}`,
  ].join("\n");
  assert.deepEqual(
    findMutableActionRefs(source).map(({ line, reference }) => ({ line, reference })),
    [
      { line: 2, reference: "<unsupported-or-multiline-value>" },
      { line: 4, reference: "<unsupported-or-multiline-value>" },
    ],
  );
});

test("rejeita valor quoted quebrado e aceita chave uses entre aspas", () => {
  const source = [
    "steps:",
    '  - uses: "owner/action@',
    '      main"',
    `  - "uses": owner/action@${"b".repeat(40)}`,
  ].join("\n");
  assert.deepEqual(
    findMutableActionRefs(source).map(({ line, reference }) => ({ line, reference })),
    [{ line: 2, reference: "<unsupported-or-multiline-value>" }],
  );
});
