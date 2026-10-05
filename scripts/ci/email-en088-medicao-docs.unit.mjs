import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// OTH-014 / EN-088 (#154) — a medição de memória e consultas do Email precisava
// existir e não ser apagada em silêncio. A auditoria
// (docs/reconciliation/FINDINGS.json, OTH-014) registrava as fixtures de 1.000
// threads e a thread extrema, mas NÃO localizava as medições de consultas,
// memória, iframes, listeners e blobs com orçamento antes/depois exigidas por
// EN-088 (docs/design/PLANO_EMAIL_NAVY_100_ETAPAS_2026-10-02.md:621-624).
//
// Esta guarda trava as duas pontas: o registro da medição
// (docs/design/EMAIL_NAVY_EN088_MEDICAO_2026-10-05.md) e o medidor
// (src/components/email/__tests__/EmailVolumeMedicao.test.tsx). Se alguém apagar
// a página ou o teste — ou zerar um orçamento — o CI acusa.

const ler = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');
// Compara sem acento, sem caixa e sem marcação Markdown, com a prosa reflowada
// numa linha só (mesmo normalizador de catalog-perf-meta-docs.unit.mjs).
const planoDeLeitura = (t) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const doc = await ler('../../docs/design/EMAIL_NAVY_EN088_MEDICAO_2026-10-05.md');
const docTxt = planoDeLeitura(doc);
let medidor = '';
try {
  medidor = await ler('../../src/components/email/__tests__/EmailVolumeMedicao.test.tsx');
} catch {
  medidor = '';
}

test('o registro da medição EN-088 existe e cobre as cinco dimensões', () => {
  assert.ok(doc.length > 0, 'a página de medição EN-088 está vazia');
  for (const dimensao of ['consultas', 'memoria', 'iframes', 'listeners', 'blobs']) {
    assert.match(docTxt, new RegExp(dimensao), `a medição EN-088 não registra a dimensão "${dimensao}"`);
  }
});

test('a página preserva o critério literal do aceite (sem N+1, antes/depois, orçamento)', () => {
  assert.match(docTxt, /sem n\+1/, 'o critério "sem N+1" sumiu da medição EN-088');
  assert.match(docTxt, /antes\/depois/, 'o critério "antes/depois" sumiu da medição EN-088');
  assert.match(docTxt, /orcamento/, 'o "orçamento justificado" sumiu da medição EN-088');
});

test('a página registra os números medidos, não só a intenção', () => {
  // Compara já normalizado (o normalizador remove `_`), então o token vem na
  // forma achatada que existe no texto lido.
  for (const numero of ['consultas=6', 'linhas=20', 'picovivos=2', 'pendentesapos40ciclos=0', '643451']) {
    assert.ok(docTxt.includes(numero), `a medição EN-088 não preserva o número medido "${numero}"`);
  }
});

test('a página aponta para o medidor executável e a mutação de validação', () => {
  assert.ok(
    docTxt.includes('src/components/email/tests/emailvolumemedicao.test.tsx'),
    'a medição EN-088 não aponta para o medidor executável',
  );
  assert.ok(docTxt.includes('mutacao'), 'a medição EN-088 não registra a prova de mutação do medidor');
});

test('o medidor existe e trava o orçamento (página de 20 linhas + object URLs)', () => {
  assert.ok(medidor.length > 0, 'o medidor EmailVolumeMedicao.test.tsx não existe mais');
  assert.match(medidor, /expect\(linhasGrande\)\.toBe\(20\)/, 'o medidor não trava a página de 20 linhas no DOM');
  assert.match(medidor, /createObjectURL/, 'o medidor não instrumenta o ciclo de object URLs (blobs)');
  assert.match(medidor, /collectEmailPages/, 'o medidor não mede as consultas pelo caminho real do hook');
});
