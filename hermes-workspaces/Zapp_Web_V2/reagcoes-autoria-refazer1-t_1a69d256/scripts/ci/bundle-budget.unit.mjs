import assert from "node:assert/strict";
import test, { after } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { evaluate, extractInitialAssets, main, measure } from "./bundle-budget.mjs";

// `node --test` roda este .mjs direto, sem transpilar TypeScript, entao nao da
// para importar `src/lib/secureRandom.ts` (S2245 fora do src cai como
// javascript:S2245). O `crypto` global (Web Crypto, Node 18+) entrega o mesmo
// byte uniforme 0-255 que o sorteio pseudoaleatorio anterior produzia, so que sem
// o gerador previsivel. Uma chamada por byte, mesma quantidade de sorteios.
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
  // Conteudo aleatorio nao comprime: gzip ~= tamanho bruto.
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
  assert.deepEqual(evaluate(result, {
    "initial-js": { maxKB: 10 },
    "initial-css": { maxKB: 1 },
    "largest-chunk": { maxKB: 10 },
    "total-assets": { maxKB: 22 },
  }), []);
  const failures = evaluate(result, {
    "initial-js": { maxKB: 5 },
    "largest-chunk": { maxKB: 5 },
    "total-assets": { maxKB: 20 },
  });
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

// ── Guarda da regra de chunking (SL-103B) ─────────────────────────────────────
// O entry alcanca o grupo vendor-ui estaticamente (Radix), entao todo modulo que
// cai nesse grupo vira peso de first paint mesmo sem uso inicial — foi assim que
// o runtime de animacao (framer-motion) entrou no pacote inicial. Ele tem grupo
// proprio (vendor-motion) e passa a seguir a alcancabilidade dos importadores.
// A guarda le as regras REAIS de vite.config.ts e as aplica a ids de modulo, em
// vez de procurar texto: com a regra antiga (framer-motion dentro do vendor-ui)
// os casos abaixo ficam vermelhos.

const VITE_CONFIG = new URL("../../vite.config.ts", import.meta.url);

/** Le o bloco `codeSplitting.groups` de vite.config.ts como { name, priority, test }. */
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
  assert.ok(
    gruposDeChunking.every((grupo) => grupo.name === "vendor-core" || grupo.priority <= core.priority),
    "vendor-core precisa manter a maior prioridade (React nao pode ser arrastado por outro grupo)",
  );
});

test("framer-motion fica em grupo proprio, fora do vendor-ui do Radix", () => {
  const framerMotion = idModulo("framer-motion/dist/es/index.mjs");
  const capturas = gruposQueCapturam(framerMotion);
  assert.equal(
    capturas.length,
    1,
    `framer-motion deveria ser reivindicado por exatamente 1 grupo; veio: ${capturas.map((grupo) => grupo.name).join(", ") || "nenhum"}`,
  );
  const nome = capturas[0].name;
  assert.notEqual(nome, "vendor-ui", "framer-motion voltou para o mesmo chunk do Radix (peso de first paint)");

  // O vendor-ui continua dono do Radix e nao pode reivindicar o runtime de animacao.
  const vendorUi = gruposDeChunking.find((grupo) => grupo.name === "vendor-ui");
  assert.equal(vendorUi.test.test(framerMotion), false);
  assert.equal(vendorUi.test.test(idModulo("@radix-ui/react-dialog/dist/index.mjs")), true);

  // As dependencias do runtime acompanham o mesmo grupo.
  for (const dependencia of ["motion-dom/dist/index.mjs", "motion-utils/dist/index.mjs"]) {
    const capturadas = gruposQueCapturam(idModulo(dependencia));
    assert.equal(capturadas.length, 1, `${dependencia}: ${capturadas.length} grupo(s)`);
    assert.equal(capturadas[0].name, nome);
  }
});

test("o grupo do runtime de animacao nao captura pacotes vizinhos por nome parecido", () => {
  const nome = gruposQueCapturam(idModulo("framer-motion/dist/es/index.mjs"))[0].name;
  const falsos = ["framer-motion-extra/index.mjs", "meu-framer-motion/index.mjs", "@framer-motion/x/index.mjs"];
  for (const falso of falsos) {
    const capturados = gruposQueCapturam(idModulo(falso)).map((grupo) => grupo.name);
    assert.equal(
      capturados.includes(nome),
      false,
      `${falso} nao pode ser capturado por ${nome} (veio: ${capturados.join(", ") || "nenhum"})`,
    );
  }
});
