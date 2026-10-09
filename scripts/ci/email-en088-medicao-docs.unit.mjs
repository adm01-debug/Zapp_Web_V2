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
// Esta guarda trava a PONTA ESTÁVEL: a existência dos dois artefatos (a página
// de medição e o medidor) e os números/declarações fixos da página. A verificação
// COMPORTAMENTAL (o orçamento que os números representam) mora no Vitest
// (`vitest run .../EmailVolumeMedicao.test.tsx`), não aqui: esta guarda não lê o
// fonte TypeScript para inferir comportamento — só confere que o artefato existe.

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

// Só a existência do medidor interessa aqui (a guarda comportamental é o Vitest).
let medidorExiste = false;
try {
  const medidor = await ler('../../src/components/email/__tests__/EmailVolumeMedicao.test.tsx');
  medidorExiste = medidor.length > 0;
} catch {
  medidorExiste = false;
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
  // Números atuais do medidor: corpus 20 e 1.000 rendem 1 página + 1 lote +
  // 1 contador = 3 consultas e 20 linhas carregadas (EMAIL_THREAD_PAGE_SIZE).
  // Compara já normalizado (o normalizador remove `_`), então o token vem na
  // forma achatada que existe no texto lido.
  for (const numero of [
    'consultas corpus=20 paginas=1 lotes=1 contadores=1 consultas=3 carregadas=20',
    'consultas corpus=1000 paginas=1 lotes=1 contadores=1 consultas=3 carregadas=20',
    'linhas=20',
    'picovivos=2',
    'pendentesapos40ciclos=0',
    '643451',
  ]) {
    assert.ok(docTxt.includes(numero), `a medição EN-088 não preserva o número medido "${numero}"`);
  }
});

test('a página mantém a fixture canônica coerente (100 anexos na thread extrema)', () => {
  // Fonte canônica: e2e/fixtures/email-navy.ts cria `extremeAttachments` com
  // length 100. Os 40 ciclos de prévia são OUTRA medição e continuam 40.
  assert.ok(docTxt.includes('100 anexos'), 'a medição EN-088 não declara os 100 anexos da fixture extrema');
});

test('a página aponta para o medidor executável e a mutação de validação', () => {
  assert.ok(
    docTxt.includes('src/components/email/tests/emailvolumemedicao.test.tsx'),
    'a medição EN-088 não aponta para o medidor executável',
  );
  assert.ok(docTxt.includes('mutacao'), 'a medição EN-088 não registra a prova de mutação do medidor');
  // A subseção de mutação declara os números dela como execução HISTÓRICA
  // (05/10), não como medição atual — nenhum número antigo pode passar por válido.
  assert.ok(
    docTxt.includes('execucao historica'),
    'a prova de mutação do EN-088 não declara os números como execução histórica',
  );
});

test('o medidor existe (a verificação comportamental é o Vitest, não esta guarda)', () => {
  assert.ok(medidorExiste, 'o medidor EmailVolumeMedicao.test.tsx não existe mais');
});
