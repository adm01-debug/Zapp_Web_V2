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

test("reconhece atributos com aspas simples (HTML valido, minificador diferente)", () => {
  const htmlSingleQuotes = [
    "<!doctype html><html><head>",
    "<link rel='modulepreload' crossorigin href='/assets/vendor-core-abc.js'>",
    "<link rel='stylesheet' crossorigin href='/assets/index-abc.css'>",
    "</head><body><script type='module' crossorigin src='/assets/index-abc.js'></script>",
    "</body></html>",
  ].join("\n");
  assert.deepEqual(extractInitialAssets(htmlSingleQuotes), {
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
  for (const nome of ["vendor-core", "vendor-data", "vendor-ui", "vendor-radix", "vendor-motion", "vendor-utils"]) {
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

  // O vendor-ui (utilitarios de classe do shell) nao pode reivindicar o runtime de animacao.
  const vendorUi = gruposDeChunking.find((grupo) => grupo.name === "vendor-ui");
  assert.equal(vendorUi.test.test(framerMotion), false);
  // Nem o grupo do Radix lazy.
  const vendorRadix = gruposDeChunking.find((grupo) => grupo.name === "vendor-radix");
  assert.equal(vendorRadix.test.test(framerMotion), false);
  assert.equal(vendorRadix.test.test(idModulo("@radix-ui/react-dialog/dist/index.mjs")), true);

  // As dependencias do runtime acompanham o mesmo grupo.
  for (const dependencia of ["motion-dom/dist/index.mjs", "motion-utils/dist/index.mjs"]) {
    const capturadas = gruposQueCapturam(idModulo(dependencia));
    assert.equal(capturadas.length, 1, `${dependencia}: ${capturadas.length} grupo(s)`);
    assert.equal(capturadas[0].name, nome);
  }
});

// Radix em dois grupos (13/11/2026): com o Radix inteiro no vendor-ui (alcancado
// pelo entry) o bundle inicial media 323,8 KB gzip (teto 325), porque Select,
// Menu, Dialog, Slider... iam para o first paint. Sem grupo nenhum o inicial cai,
// mas o Radix e o date-fns se fragmentam em dezenas de chunks e o total-assets
// passa do teto de 4100 KB (+34 KB, PR #3034). Por isso: so os primitivos do
// shell no vendor-ui; o resto no vendor-radix (lazy); date-fns segue no vendor-utils.
const grupoVencedor = (modulo) => {
  const capturas = gruposQueCapturam(idModulo(modulo));
  return capturas.reduce((melhor, grupo) => (!melhor || grupo.priority > melhor.priority ? grupo : melhor), null)?.name;
};

test("so os primitivos Radix do shell ficam no vendor-ui; o resto vai para o vendor-radix", () => {
  for (const modulo of [
    "@radix-ui/react-tooltip/dist/index.mjs",
    "@radix-ui/react-toast/dist/index.mjs",
    "@radix-ui/react-popper/dist/index.mjs",
    "@radix-ui/react-primitive/dist/index.mjs",
    "@radix-ui/primitive/dist/index.mjs",
    "@floating-ui/dom/dist/floating-ui.dom.mjs",
  ]) {
    assert.equal(grupoVencedor(modulo), "vendor-ui", modulo);
  }
  for (const modulo of [
    "@radix-ui/react-dialog/dist/index.mjs",
    "@radix-ui/react-select/dist/index.mjs",
    "@radix-ui/react-slider/dist/index.mjs",
    "@radix-ui/react-dropdown-menu/dist/index.mjs",
    "react-remove-scroll/dist/es2015/index.js",
    "aria-hidden/dist/es2015/index.js",
  ]) {
    assert.equal(grupoVencedor(modulo), "vendor-radix", modulo);
  }
  // Os primitivos do shell sao deps de select/menu: o dono deles precisa vencer
  // a recursao do vendor-radix, senao o entry passa a importar o vendor-radix.
  const ui = gruposDeChunking.find((grupo) => grupo.name === "vendor-ui");
  const radix = gruposDeChunking.find((grupo) => grupo.name === "vendor-radix");
  assert.ok(ui.priority > radix.priority, "vendor-ui precisa vencer a recursao do vendor-radix");
});

test("date-fns fica inteiro no vendor-utils (sem fragmentar em um chunk por funcao)", () => {
  for (const modulo of ["date-fns/format.mjs", "date-fns/locale/pt-BR.mjs", "date-fns/addDays.mjs"]) {
    assert.equal(grupoVencedor(modulo), "vendor-utils", modulo);
  }
});

// Deps do recharts que o shell tambem usa precisam de dono com prioridade maior
// que o vendor-charts; senao a recursao do grupo de graficos as reivindica e o
// entry passa a importar o vendor-charts inteiro.
test("deps compartilhadas com o recharts ficam no vendor-ui, nao no vendor-charts", () => {
  for (const modulo of ["clsx/dist/clsx.mjs", "use-sync-external-store/shim/index.js", "tailwind-merge/dist/bundle-mjs.mjs"]) {
    const capturas = gruposQueCapturam(idModulo(modulo));
    assert.deepEqual(capturas.map((grupo) => grupo.name), ["vendor-ui"], modulo);
  }
  const ui = gruposDeChunking.find((grupo) => grupo.name === "vendor-ui");
  const charts = gruposDeChunking.find((grupo) => grupo.name === "vendor-charts");
  assert.ok(ui.priority > charts.priority, "vendor-ui precisa vencer a recursao do vendor-charts");
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

// ── Ratchet do teto do bundle inicial (SL-103 / SL-103D) ─────────────────────
// O teto de `initial-js` mora em performance-budget.json e o gate le o teto DO
// PROPRIO JSON (bundle-budget.mjs -> evaluate compara o medido com o numero que
// estiver la). Consequencia: subir de volta o teto antigo (341 KB) e um commit que
// passa no CI, porque um teto 341 aceita um bundle de 341. Esta checagem trava o
// teto no valor combinado em 2026-10-26 (340 -> 341 -> 300 -> 325), FORA do arquivo
// que ele vigia — com o teto em 326 KB (ou qualquer valor acima de 325) ela fica
// vermelha com a mensagem "teto frouxo/antigo".
const TETO_INITIAL_JS_KB = 325;
const ORCAMENTO_VERSIONADO = JSON.parse(
  readFileSync(new URL("../../performance-budget.json", import.meta.url), "utf8"),
);

test("o gate versionado corta o bundle inicial nos 325 KB (LazyMotion 26/10, nao no teto antigo de 341)", () => {
  // Chama o gate de verdade (evaluate) com o orcamento de verdade (o JSON que main
  // le). Tabela de limites: exato, exato+0,1 e o teto antigo. Se alguem devolver o
  // teto para 341 KB, os dois ultimos casos deixam de reprovar e o teste fica
  // vermelho com "teto frouxo/antigo".
  const budgets = ORCAMENTO_VERSIONADO.budgets ?? {};
  const reprovaInitialJs = (jsKB) =>
    evaluate({ jsKB, cssKB: 0, largestChunkKB: 0, totalAssetsKB: 0 }, budgets)
      .some((falha) => falha.startsWith("initial-js:"));
  assert.equal(reprovaInitialJs(325), false, "limite exato: 325 KB gzip deveria passar");
  assert.equal(reprovaInitialJs(325.1), true, "limite+0,1 KB gzip deveria reprovar");
  assert.equal(reprovaInitialJs(341), true, "teto frouxo/antigo: 341 KB gzip (o valor de antes) caberia");

  // A tabela acima sozinha cobre qualquer afrouxamento > 0,1 KB; este assert prende
  // o valor versionado no combinado para o relato e para o diff do teto.
  const teto = budgets["initial-js"]?.maxKB;
  assert.equal(typeof teto, "number", 'performance-budget.json precisa de budgets["initial-js"].maxKB numerico');
  assert.ok(
    teto <= TETO_INITIAL_JS_KB,
    `teto frouxo/antigo: initial-js.maxKB = ${teto} KB supera os ${TETO_INITIAL_JS_KB} KB combinados`
      + " — o gate le este numero, entao subir o teto faz o CI passar sem o bundle caber; baixe o teto (ou prove nova medicao)",
  );
});
