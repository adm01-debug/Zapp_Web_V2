import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { evaluate, extractInitialAssets, main, measure } from "./bundle-budget.mjs";

const html = [
  '<!doctype html><html><head>',
  '<link rel="modulepreload" crossorigin href="/assets/vendor-core-abc.js">',
  '<link rel="stylesheet" crossorigin href="/assets/index-abc.css">',
  '<link rel="preload" href="/fonts/x.woff2" as="font">',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit">',
  '</head><body><script type="module" crossorigin src="/assets/index-abc.js"></script>',
  '<script src="/legacy.js"></script></body></html>',
].join("\n");

test("extrai somente script module, modulepreload e stylesheet", () => {
  assert.deepEqual(extractInitialAssets(html), {
    js: ["/assets/index-abc.js", "/assets/vendor-core-abc.js"],
    css: ["/assets/index-abc.css"],
  });
});

function fixture(sizeKB) {
  const dir = mkdtempSync(path.join(tmpdir(), "bundle-budget-"));
  mkdirSync(path.join(dir, "assets"));
  // Conteudo aleatorio nao comprime: gzip ~= tamanho bruto.
  const noise = Buffer.from(Array.from({ length: sizeKB * 1024 }, () => Math.floor(Math.random() * 256)));
  writeFileSync(path.join(dir, "assets", "index-abc.js"), noise);
  writeFileSync(path.join(dir, "assets", "vendor-core-abc.js"), noise);
  writeFileSync(path.join(dir, "assets", "index-abc.css"), "body{margin:0}");
  writeFileSync(path.join(dir, "index.html"), html);
  return dir;
}

test("soma gzip dos chunks iniciais e compara com o budget", () => {
  const dir = fixture(4);
  const result = measure(dir, html);
  assert.equal(result.js.length, 2);
  assert.ok(result.jsKB > 7.5 && result.jsKB < 9, `jsKB inesperado: ${result.jsKB}`);
  assert.deepEqual(evaluate(result, { "initial-js": { maxKB: 10 }, "initial-css": { maxKB: 1 } }), []);
  const failures = evaluate(result, { "initial-js": { maxKB: 5 } });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /initial-js: .* > budget 5 KB/u);
});

test("main falha com exit 1 acima do budget e 0 dentro dele", () => {
  const dir = fixture(4);
  writeFileSync(path.join(dir, "budget-ok.json"), JSON.stringify({ budgets: { "initial-js": { maxKB: 50 } } }));
  writeFileSync(path.join(dir, "budget-low.json"), JSON.stringify({ budgets: { "initial-js": { maxKB: 1 } } }));
  assert.equal(main(["--dist", dir, "--budget", path.join(dir, "budget-ok.json")], dir), 0);
  assert.equal(main(["--dist", dir, "--budget", path.join(dir, "budget-low.json")], dir), 1);
});

test("main retorna 2 sem dist", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "bundle-budget-empty-"));
  assert.equal(main(["--dist", dir], dir), 2);
});
