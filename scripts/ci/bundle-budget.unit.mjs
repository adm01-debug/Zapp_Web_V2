import assert from "node:assert/strict";
import test, { after } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { evaluate, extractInitialAssets, main, measure } from "./bundle-budget.mjs";

const randomByte = () => crypto.getRandomValues(new Uint8Array(1))[0];

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

const fixtureDirs = [];
after(() => { for (const dir of fixtureDirs) rmSync(dir, { recursive: true, force: true }); });

function fixture(sizeKB) {
  const dir = mkdtempSync(path.join(tmpdir(), "bundle-budget-"));
  fixtureDirs.push(dir);
  mkdirSync(path.join(dir, "assets"));
  const noise = Buffer.from(Array.from({ length: sizeKB * 1024 }, () => randomByte()));
  const secondNoise = Buffer.from(Array.from({ length: sizeKB * 1024 }, () => randomByte()));
  writeFileSync(path.join(dir, "assets", "index-abc.js"), noise);
  writeFileSync(path.join(dir, "assets", "vendor-core-abc.js"), noise);
  writeFileSync(path.join(dir, "assets", "index-abc.css"), "body{margin:0}");
  writeFileSync(path.join(dir, "assets", "lazy-module.js"), Buffer.concat([noise, secondNoise]));
  writeFileSync(path.join(dir, "assets", "lazy-image.png"), noise);
  writeFileSync(path.join(dir, "assets", "ignored.js.map"), noise);
  writeFileSync(path.join(dir, "index.html"), html);
  return dir;
}

test("soma gzip dos chunks iniciais e compara com o budget", () => {
  const dir = fixture(4);
  const result = measure(dir, html);
  assert.equal(result.js.length, 2);
  assert.ok(result.jsKB > 7.5 && result.jsKB < 9, `jsKB inesperado: ${result.jsKB}`);
  assert.ok(result.largestChunkKB > 7.5 && result.largestChunkKB < 9);
  assert.ok(result.totalAssetsKB > 20 && result.totalAssetsKB < 21);
  assert.deepEqual(evaluate(result, { "initial-js": { maxKB: 10 }, "initial-css": { maxKB: 1 }, "largest-chunk": { maxKB: 10 }, "total-assets": { maxKB: 22 } }), []);
  const failures = evaluate(result, { "initial-js": { maxKB: 5 }, "largest-chunk": { maxKB: 5 }, "total-assets": { maxKB: 20 } });
  assert.equal(failures.length, 3);
  assert.match(failures[0], /initial-js: .* > budget 5 KB/u);
  assert.match(failures[1], /largest-chunk: .* > budget 5 KB/u);
  assert.match(failures[2], /total-assets: .* > budget 20 KB/u);
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
  fixtureDirs.push(dir);
  assert.equal(main(["--dist", dir], dir), 2);
});

const VITE_CONFIG = new URL("../../vite.config.ts", import.meta.url);

export function lerGruposDeChunking(fonte) {
  const abertura = fonte.indexOf("groups: [");
  if (abertura < 0) throw new Error("vite.config.ts: bloco codeSplitting.groups nao encontrado");
  const resto = fonte.slice(abertura + "groups: [".length);
  const fecho = resto.match(/\n\s*\],/u);
  if (!fecho) throw new Error("vite.config.ts: fecho do bloco groups nao encontrado");
  const grupos = [];
  const entrada = /\{\s*name:\s*"([^"]+)"\s*,\s*priority:\s*(\d+)\s*,\s*test:\s*\/(.+?)\/([a-z]*)\s*\}/gsu;
  for (const achado of resto.slice(0, fecho.index).matchAll(entrada)) {
    grupos.push({ name: achado[1], priority: Number(achado[2]), test: new RegExp(achado[3], achado[4]) });
  }
  if (grupos.length === 0) throw new Error("vite.config.ts: nenhum grupo com name/priority/test foi lido");
  return grupos;
}

const gruposDeChunking = lerGruposDeChunking(readFileSync(VITE_CONFIG, "utf8"));
const idModulo = (caminho) => `node_modules/${caminho}`;
const gruposQueCapturam = (id) => gruposDeChunking.filter((grupo) => grupo.test.test(id));

test("le as regras reais de chunking do vite.config.ts", () => {
  assert.ok(gruposDeChunking.length >= 8, `grupos lidos: ${gruposDeChunking.length}`);
  for (const nome of ["vendor-core", "vendor-data", "vendor-ui", "vendor-motion", "vendor-utils"]) {
    assert.ok(gruposDeChunking.some((grupo) => grupo.name === nome), `grupo ausente: ${nome}`);
  }
  const core = gruposDeChunking.find((grupo) => grupo.name === "vendor-core");
  assert.ok(gruposDeChunking.every((grupo) => grupo.name === "vendor-core" || grupo.priority <= core.priority), "vendor-core precisa manter a maior prioridade");
});

test("framer-motion fica em grupo proprio, fora do vendor-ui do Radix", () => {
  const framerMotion = idModulo("framer-motion/dist/es/index.mjs");
  const capturas = gruposQueCapturam(framerMotion);
  assert.equal(capturas.length, 1, `framer-motion deveria ser reivindicado por exatamente 1 grupo; veio: ${capturas.map((g) => g.name).join(", ") || "nenhum"}`);
  const nome = capturas[0].name;
  assert.notEqual(nome, "vendor-ui", "framer-motion voltou para o mesmo chunk do Radix");
  const vendorUi = gruposDeChunking.find((g) => g.name === "vendor-ui");
  assert.equal(vendorUi.test.test(framerMotion), false);
  assert.equal(vendorUi.test.test(idModulo("@radix-ui/react-dialog/dist/index.mjs")), true);
  for (const dep of ["motion-dom/dist/index.mjs", "motion-utils/dist/index.mjs"]) {
    const caps = gruposQueCapturam(idModulo(dep));
    assert.equal(caps.length, 1, `${dep}: ${caps.length} grupo(s)`);
    assert.equal(caps[0].name, nome);
  }
});

test("o grupo do runtime de animacao nao captura pacotes vizinhos por nome parecido", () => {
  const nome = gruposQueCapturam(idModulo("framer-motion/dist/es/index.mjs"))[0].name;
  for (const falso of ["framer-motion-extra/index.mjs", "meu-framer-motion/index.mjs", "@framer-motion/x/index.mjs"]) {
    const caps = gruposQueCapturam(idModulo(falso)).map((g) => g.name);
    assert.equal(caps.includes(nome), false, `${falso} nao pode ser capturado por ${nome}`);
  }
});

const TETO_INITIAL_JS_KB = 325;
const ORCAMENTO_VERSIONADO = JSON.parse(readFileSync(new URL("../../performance-budget.json", import.meta.url), "utf8"));

test("o gate versionado corta o bundle inicial nos 325 KB (LazyMotion 26/10, nao no teto antigo de 341)", () => {
  const budgets = ORCAMENTO_VERSIONADO.budgets ?? {};
  const reprovaInitialJs = (jsKB) => evaluate({ jsKB, cssKB: 0, largestChunkKB: 0, totalAssetsKB: 0 }, budgets).some((f) => f.startsWith("initial-js:"));
  assert.equal(reprovaInitialJs(325), false, "limite exato: 325 KB gzip deveria passar");
  assert.equal(reprovaInitialJs(325.1), true, "limite+0,1 KB gzip deveria reprovar");
  assert.equal(reprovaInitialJs(341), true, "teto frouxo/antigo: 341 KB gzip (o valor de antes) caberia");
  const teto = budgets["initial-js"]?.maxKB;
  assert.equal(typeof teto, "number", 'performance-budget.json precisa de budgets["initial-js"].maxKB numerico');
  assert.ok(teto <= TETO_INITIAL_JS_KB, `teto frouxo/antigo: initial-js.maxKB = ${teto} KB supera os ${TETO_INITIAL_JS_KB} KB combinados`);
});
