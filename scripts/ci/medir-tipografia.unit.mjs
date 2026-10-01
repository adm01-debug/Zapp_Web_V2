import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  scanCss,
  scanTsxInline,
  parseLoadedWeights,
  scanOrphanWeights,
  isNamedAbove16,
  MODULAR_SCALE,
} from "../qa/medir-tipografia.cjs";

// F8 do PLANO_AUDITORIA_FONTES_100_ETAPAS_2026-09-24 — as 4 checagens que
// fecham a zona cega do guard original (que so lia text-* em src/**/*.tsx).
// Cada teste usa um diretorio temporario isolado, nao o repo real, para nao
// quebrar quando o estado real do repo mudar.

function withTmpDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "medir-tipografia-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("scanCss: acusa meia-medida em font-size cru", () => {
  withTmpDir((dir) => {
    writeFileSync(path.join(dir, "components.css"), `.x { font-size: 12.5px; }\n.y { font-size: 12px; }\n`);
    const { halfStep } = scanCss(dir);
    assert.equal(halfStep.length, 1);
    assert.equal(halfStep[0].px, 12.5);
  });
});

test("scanCss: acusa font-family literal, ignora tokens.css (declara as variaveis)", () => {
  withTmpDir((dir) => {
    writeFileSync(path.join(dir, "components.css"), `.x { font-family: 'Arial', sans-serif; }\n.y { font-family: var(--font-sans); }\n`);
    writeFileSync(path.join(dir, "tokens.css"), `:root { --font-sans: 'Plus Jakarta Sans', sans-serif; }\n`);
    const { literalFamily } = scanCss(dir);
    assert.equal(literalFamily.length, 1);
    assert.equal(literalFamily[0].value, "Arial");
  });
});

test("scanTsxInline: acusa fontSize numerico mas nao identificador de tema", () => {
  withTmpDir((dir) => {
    writeFileSync(
      path.join(dir, "Chart.tsx"),
      `export const A = () => <XAxis tick={{ fontSize: 10 }} />;\n` +
        `export const B = () => <XAxis tick={{ fontSize: CHART_TICK_FONT_SIZE }} />;\n`,
    );
    const { fontSizeInline } = scanTsxInline(dir);
    assert.equal(fontSizeInline.length, 1);
    assert.equal(fontSizeInline[0].px, 10);
  });
});

test("scanTsxInline: acusa fontFamily literal", () => {
  withTmpDir((dir) => {
    writeFileSync(path.join(dir, "Weird.tsx"), `const s = { fontFamily: 'Comic Sans MS' };\n`);
    const { literalFamily } = scanTsxInline(dir);
    assert.equal(literalFamily.length, 1);
    assert.equal(literalFamily[0].value, "Comic Sans MS");
  });
});

test("parseLoadedWeights: le faixa variavel (wght@min..max) da URL do Google Fonts", () => {
  withTmpDir((dir) => {
    const html = `<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200..800&family=Outfit:wght@100..900&display=swap" rel="stylesheet" />`;
    writeFileSync(path.join(dir, "index.html"), html);
    const loaded = parseLoadedWeights(path.join(dir, "index.html"));
    assert.deepEqual(loaded["Plus Jakarta Sans"], [200, 800]);
    assert.deepEqual(loaded["Outfit"], [100, 900]);
  });
});

test("parseLoadedWeights: le lista estatica (wght@a;b;c) da URL do Google Fonts", () => {
  withTmpDir((dir) => {
    const html = `<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />`;
    writeFileSync(path.join(dir, "index.html"), html);
    const loaded = parseLoadedWeights(path.join(dir, "index.html"));
    assert.deepEqual(loaded["Plus Jakarta Sans"], [300, 700]);
  });
});

test("scanOrphanWeights: acusa peso fora da faixa carregada (reproduz o achado A1)", () => {
  withTmpDir((dir) => {
    mkdirSync(path.join(dir, "styles"));
    writeFileSync(path.join(dir, "index.html"), `<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />`);
    writeFileSync(path.join(dir, "styles", "base.css"), `html.dark body { font-weight: 450; }\nhtml.dark .font-black { font-weight: 900; }\n`);
    const orphan = scanOrphanWeights(path.join(dir, "styles"), path.join(dir, "index.html"));
    // 450 nao existe como valor exato na lista estatica 300-700, mas cai
    // DENTRO do intervalo [300,700] — a heuristica (min/max) nao pega esse
    // caso; so o que fica fora do intervalo. 900 fica fora: e o caso real
    // que o guard existe para capturar.
    assert.equal(orphan.length, 1);
    assert.equal(orphan[0].weight, 900);
  });
});

test("scanOrphanWeights: faixa variavel cobrindo o peso pedido nao acusa nada", () => {
  withTmpDir((dir) => {
    mkdirSync(path.join(dir, "styles"));
    writeFileSync(path.join(dir, "index.html"), `<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200..800&display=swap" rel="stylesheet" />`);
    writeFileSync(path.join(dir, "styles", "base.css"), `html.dark body { font-weight: 450; }\nhtml.dark .font-bold { font-weight: 800; }\n`);
    const orphan = scanOrphanWeights(path.join(dir, "styles"), path.join(dir, "index.html"));
    assert.equal(orphan.length, 0);
  });
});

// Etapa 21 (PLANO_CONTATOS_100_ETAPAS_2026-09-29; achado P1 da auditoria 29/09):
// fecha a brecha em que o guard so via `text-[Npx]` arbitrario e um token
// nomeado custom (`text-kpi-value`, 34px) escapava por definicao.
test("isNamedAbove16: token custom >16px sem excecao e violacao (prova o DoD da etapa 21)", () => {
  const allow = new Set(["kpi-value", "page-title"]);
  // `text-huge` de 40px sem excecao: reprova.
  assert.equal(isNamedAbove16("huge", 40, allow), true);
  // as excecoes nomeadas do budget passam.
  assert.equal(isNamedAbove16("page-title", 38, allow), false);
  assert.equal(isNamedAbove16("kpi-value", 34, allow), false);
  // sem a excecao, o mesmo token reprova.
  assert.equal(isNamedAbove16("kpi-value", 34, new Set()), true);
});

test("isNamedAbove16: rampa modular e tokens <=16px nao contam", () => {
  const allow = new Set(["kpi-value", "page-title"]);
  assert.ok(MODULAR_SCALE.has("lg"));
  assert.equal(isNamedAbove16("lg", 18, allow), false); // rampa sancionada
  assert.equal(isNamedAbove16("9xl", 128, allow), false); // rampa sancionada
  assert.equal(isNamedAbove16("base", 16, allow), false); // nao passa de 16px
  assert.equal(isNamedAbove16("3xs", 10, allow), false);
  assert.equal(isNamedAbove16("fluid-3xl", null, allow), false); // px indeterminado (var)
});
