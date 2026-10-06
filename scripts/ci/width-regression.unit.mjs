// LT-LAYOUT-03 (item 138 / n-03 / P017:28) — Teste de regressão de largura.
//
// Defeito provado na auditoria: o script `scripts/ui-audit/width-regression.mjs`
// só comparava `document.documentElement.scrollWidth` com `window.innerWidth`
// (overflow) a 1280x800. Ele NÃO comparava `main.clientWidth - content.clientWidth`
// a 1920x1080. Conteúdo estreito o suficiente para deixar uma faixa morta no
// `main` passava sem preencher, porque não havia overflow.
//
// O teste importa o CÓDIGO REAL: o predicado `avaliarLargura` (a decisão que o
// script usa no navegador) e as constantes/protótipo exportados pelo script.
// O aceite do plano (etapa 28): falha se `main.clientWidth - content.clientWidth > 1`.

import test from 'node:test';
import assert from 'node:assert/strict';

import { avaliarLargura, TOLERANCIA_PX } from '../ui-audit/width-check.mjs';
import {
  VIEWPORTS,
  VIEWS_TO_CHECK,
  medirLargura,
} from '../ui-audit/width-regression.mjs';

test('o caso que o script antigo aprovava (sem overflow) agora reprova por faixa morta', () => {
  // Sem overflow — era tudo o que o script antigo media, e por isso aprovava.
  const medicao = { innerWidth: 1920, docScrollWidth: 1920, mainWidth: 1600, contentWidth: 900 };
  const r = avaliarLargura(medicao);
  assert.equal(r.overflow, false); // nada transborda
  assert.equal(r.faixaMorta, true); // mas o conteúdo não ocupa o main
  assert.equal(r.ok, false);
});

test('detecta faixa morta: main.clientWidth - content.clientWidth > 1', () => {
  const r = avaliarLargura({
    innerWidth: 1920,
    docScrollWidth: 1920,
    mainWidth: 1600,
    contentWidth: 900,
  });
  assert.equal(r.ok, false);
  assert.equal(r.faixaMorta, true);
  assert.equal(r.overflow, false);
  assert.equal(r.diferenca, 700);
});

test('main ocupado (conteúdo preenche) passa', () => {
  const r = avaliarLargura({
    innerWidth: 1920,
    docScrollWidth: 1920,
    mainWidth: 1600,
    contentWidth: 1600,
  });
  assert.equal(r.ok, true);
  assert.equal(r.faixaMorta, false);
});

test('tolerância é exatamente 1px: diferença 1 passa, 2 reprova', () => {
  const base = { innerWidth: 1920, docScrollWidth: 1920, mainWidth: 1600 };
  assert.equal(TOLERANCIA_PX, 1);
  assert.equal(avaliarLargura({ ...base, contentWidth: 1599 }).ok, true);
  assert.equal(avaliarLargura({ ...base, contentWidth: 1598 }).ok, false);
  assert.equal(avaliarLargura({ ...base, contentWidth: 1598 }).diferenca, 2);
});

test('overflow continua sendo detectado (regressão preservada)', () => {
  const r = avaliarLargura({
    innerWidth: 1280,
    docScrollWidth: 1300,
    mainWidth: 1280,
    contentWidth: 1280,
  });
  assert.equal(r.ok, false);
  assert.equal(r.overflow, true);
});

test('main ausente não inventa faixa morta nem quebra', () => {
  const r = avaliarLargura({
    innerWidth: 1920,
    docScrollWidth: 1920,
    mainWidth: null,
    contentWidth: null,
  });
  assert.equal(r.faixaMorta, false);
  assert.equal(r.ok, true);
});

test('o script real mede 1920x1080 e expõe a medição do main', () => {
  // VIEWPORTS vem do módulo real: o aceite pede a comparação a 1920x1080.
  const alvo = VIEWPORTS.find((v) => v.width === 1920);
  assert.ok(alvo, 'VIEWPORTS deve incluir 1920x1080');
  assert.equal(alvo.height, 1080);
  // cobre ao menos as 6 views principais do plano
  assert.ok(VIEWS_TO_CHECK.length >= 6, 'deve medir ao menos 6 views');
  // a medição é a função real que coleta main/content no navegador
  assert.equal(typeof medirLargura, 'function');
});
