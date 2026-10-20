import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// OTH-008 / CT-74 — a meta de desempenho do Catálogo (Lighthouse perf >= 90 na
// view autenticada em 4G; CLS < 0,05) continua SEM medição aprovada.
//
// A última alteração de rendimento foi a PR #1735 (o header deixa de trocar de
// altura), que declara a Lighthouse PENDENTE. A última medição disponível
// (perf 44 / CLS 0,2452) é ANTERIOR a ela. A auditoria
// (docs/reconciliation/FINDINGS.json, OTH-008) é explícita: "Não se deve fechar
// por inspeção de JSX ou screenshot estática" e a prova exigida é "evidência
// datada depois da última alteração, com critério literal e ambiente"
// (docs/reconciliation/OPEN_RISKS.md, linha "Prova de aceite").
//
// Esta guarda trava as duas pontas para que uma correção estrutural (que tem
// teste próprio, CT74_headerSemTroca.test.tsx) não feche o ACEITE sem a medição:
// o critério literal + baseline continuam registrados, e o estado permanece
// declarado como "sem medição aprovada".

const ler = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');
// Compara sem acento, sem caixa e sem marcação Markdown (* _ `), com o texto
// reflowado numa linha só — a prosa é hard-wrapped à mão e a guarda não deve
// quebrar quando alguém re-embrulhar um parágrafo.
const planoDeLeitura = (t) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const perf = await ler('../../docs/catalogo/PERF.md');
const perfTxt = planoDeLeitura(perf);
const plano = await ler('../../docs/catalogo/PLANO_FINALIZACAO_CATALOGO_100.md');
const planoTxt = planoDeLeitura(plano);

test('PERF.md preserva o critério literal da meta e o baseline medido', () => {
  assert.match(perf, /perf\s*≥\s*90/i, 'a meta literal "perf ≥ 90" sumiu de PERF.md');
  assert.match(perf, /CLS\s*<\s*0,05/i, 'a meta literal "CLS < 0,05" sumiu de PERF.md');
  assert.match(perf, /(perf|desempenho)[^\n]{0,16}44/i, 'a última medição (perf 44) sumiu de PERF.md');
  assert.match(perf, /0,2452/, 'a última medição (CLS 0,2452) sumiu de PERF.md');
});

test('PERF.md declara que a última alteração (#1735) não foi medida', () => {
  assert.match(perfTxt, /#1735/, 'PERF.md não menciona a correção final (#1735)');
  assert.match(
    perfTxt,
    /nenhuma medicao foi feita depois do #1735/,
    'PERF.md precisa dizer que nenhuma medição foi feita depois do #1735',
  );
  assert.match(perfTxt, /sem medicao aprovada/, 'PERF.md precisa declarar o aceite "sem medição aprovada"');
});

test('PERF.md recusa fechar o aceite por inspeção estática', () => {
  assert.match(
    perfTxt,
    /inspecao de jsx[^.]{0,140}nao provam/,
    'PERF.md precisa dizer que inspeção de JSX/geometria/screenshot NÃO prova a meta',
  );
});

test('PERF.md define a medição que vale como aprovada (critério e ambiente)', () => {
  for (const token of ['sha', 'deploy', 'perfil de rede', 'cache', 'artefato lighthouse']) {
    assert.match(perfTxt, new RegExp(token), `PERF.md não registra "${token}" como parte da medição aprovada`);
  }
});

test('o plano não marca CT-74 como concluído', () => {
  const linhas = plano.split('\n').filter((l) => /CT-74/.test(l));
  assert.ok(linhas.length > 0, 'o plano não menciona CT-74');
  const fechadas = linhas.filter((l) => /^\s*-\s*\[x\]/i.test(l));
  assert.deepEqual(
    fechadas,
    [],
    `CT-74 marcado como concluído sem medição aprovada:\n${fechadas.join('\n')}`,
  );
});

test('o plano registra a correção final e mantém o aceite como não cumprido', () => {
  assert.match(planoTxt, /#1735/, 'o plano não menciona a correção final (#1735) no bloco do CT-74');
  assert.match(planoTxt, /sem medicao aprovada/, 'o plano precisa declarar o aceite "sem medição aprovada"');
  assert.match(planoTxt, /nao cumprid/, 'o plano precisa dizer que o aceite NÃO está cumprido');
});
