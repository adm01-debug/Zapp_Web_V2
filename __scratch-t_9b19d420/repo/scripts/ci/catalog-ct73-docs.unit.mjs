// OTH-009 / CT-73: o plano de finalizacao do catalogo marcava o CT-73 como
// concluido (`[x]` / "✅ FEITO") porque a MEDICAO tinha sido feita — mesmo com a
// propria evidencia registrando 81,5 KB por pagina de 24 contra o teto vigente de
// < 30 KB. Medicao concluida e meta atingida sao estados diferentes: o texto
// fundia os dois e fechava o item sem que o alvo de desempenho existisse.
//
// Por que isto virou teste: "medir 81,5 KB" ficou registrado como se fosse
// "cumprir < 30 KB", e a mesma confusao reaparecia em dois pontos (o checkbox do
// plano e a secao do PERF.md).
//
// O invariante e CONDICIONAL — nao trava o item pendente para sempre:
//   * o CT-73 so pode ficar `[x]`, FEITO/✅ ou com aceite cumprido quando o bloco
//     do plano OU a secao do PERF.md registrar uma NOVA medicao real, isto e, com
//     data POSTERIOR ao baseline de 02/10/2026 (81,5 KB) e valor medido < 30 KB;
//   * sem essa medicao, o item continua obrigatoriamente pendente (`- [ ]`, sem
//     FEITO/✅/aceite cumprido);
//   * o teto vigente (< 30 KB) e o baseline historico (81,5 KB) nunca podem ser
//     apagados — essa parte e incondicional.
// Os dois lados ficam provados por fixtures em string (fechar sem medicao falha;
// fechar com medicao real < 30 KB passa), alem das assercoes sobre os docs reais.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const PLANO = new URL('../../docs/catalogo/PLANO_FINALIZACAO_CATALOGO_100.md', import.meta.url);
const PERF = new URL('../../docs/catalogo/PERF.md', import.meta.url);

// Medicao historica que serve de baseline: 81,5 KB em 02/10/2026.
const BASELINE_MS = Date.UTC(2026, 9, 2);
const TETO_KB = 30;

// Extrai a entrada de checklist de um item (do `- [ ]`/`- [x]` que casa o marcador
// ate a proxima entrada de topo ou o proximo titulo).
function blocoDoItem(markdown, marcador) {
  const linhas = markdown.split('\n');
  const inicio = linhas.findIndex((l) => /^- \[[ x]\] \*\*/.test(l) && l.includes(marcador));
  assert.ok(inicio >= 0, `o plano perdeu a entrada de checklist do ${marcador}`);
  const resto = linhas.slice(inicio + 1);
  const fim = resto.findIndex((l) => /^- \[[ x]\] \*\*/.test(l) || /^## /.test(l));
  return linhas.slice(inicio, fim === -1 ? linhas.length : inicio + 1 + fim).join('\n');
}

// Extrai a secao `## <titulo>` ate o proximo titulo de nivel 2.
function secao(markdown, titulo) {
  const linhas = markdown.split('\n');
  const inicio = linhas.findIndex((l) => l.startsWith(`## ${titulo}`));
  assert.ok(inicio >= 0, `PERF.md perdeu a secao ${titulo}`);
  const resto = linhas.slice(inicio + 1);
  const fim = resto.findIndex((l) => /^## /.test(l));
  return linhas.slice(inicio, fim === -1 ? linhas.length : inicio + 1 + fim).join('\n');
}

// Procura uma NOVA medicao real em `texto`. Uma medicao so conta quando a MESMA
// oracao registra (a) uma data posterior ao baseline e (b) um valor medido < 30 KB.
// O proprio teto aparece como `< 30 KB` (com sinal) e por isso nao conta como
// medicao — so numeros + KB sem sinal valem.
function acharNovaMedicao(texto) {
  for (const oracao of texto.split(/\n|\.\s/)) {
    const datas = [...oracao.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
    const posteriorAoBaseline = datas.some(
      (d) => Date.UTC(+d[3], +d[2] - 1, +d[1]) > BASELINE_MS,
    );
    if (!posteriorAoBaseline) continue;
    for (const m of oracao.matchAll(/([<≤]=?)?\s*(\d{1,3}(?:[.,]\d+)?)\s*KB/gi)) {
      if (m[1]) continue; // `< 30 KB` / `≤ 30 KB` e o teto, nao uma medicao
      const kb = parseFloat(m[2].replace(',', '.'));
      if (kb < TETO_KB) return { data: datas[0][0], kb };
    }
  }
  return null;
}

// O bloco do plano declara o item como fechado?
function estaFechado(bloco) {
  return (
    /^- \[x\] \*\*CT-73\*\*/m.test(bloco) ||
    /FEITO/i.test(bloco) ||
    /✅/.test(bloco) ||
    /aceite[^\n]*?(?<!n[aã]o )(?:feito|feita|cumprid)/i.test(bloco)
  );
}

// Regra condicional do CT-73: declarar o item fechado SEM nova medicao real (no
// bloco do plano OU na secao do PERF.md) e violacao. Com a medicao, fechar passa.
function violacoesDeFechamento(blocoPlano, textoPerf) {
  const permiteFechar = Boolean(acharNovaMedicao(blocoPlano) || acharNovaMedicao(textoPerf));
  if (!permiteFechar && estaFechado(blocoPlano)) {
    return [
      'CT-73 declarado fechado sem nova medicao real < 30 KB posterior ao baseline (02/10/2026)',
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Fixtures em string: provam os dois lados sem depender do estado dos docs.
// ---------------------------------------------------------------------------

const FIXTURE_FECHADO_SEM_MEDICAO = [
  '- [x] **CT-73** — Payload de `list_products compact` medido (< 30 KB por página de 24) — se passar, cortar campos. **✅ FEITO (02/10/2026)** — medido em produção na view autenticada: **81,5 KB** por página de 24 (e 186,1 KB no `bootstrap`), pareando requisição→resposta. O aceite ("medição em `PERF.md`") está cumprido com o número real; o alvo de < 30 KB **não** é atingido hoje.',
  '  **Aceite:** medição em `PERF.md`.',
].join('\n');

const FIXTURE_FECHADO_COM_MEDICAO = [
  '- [x] **CT-73** — Payload de `list_products compact` cortado. **✅ FEITO (05/10/2026)** — nova medição real na view autenticada: **22,4 KB** por página de 24, abaixo do teto vigente de < 30 KB (baseline histórico 81,5 KB em 02/10/2026).',
  '  **Aceite:** medição em `PERF.md` abaixo de < 30 KB — cumprido.',
].join('\n');

test('CT-73 (fixture): fechar sem nova medicao real e violacao', () => {
  const violacoes = violacoesDeFechamento(FIXTURE_FECHADO_SEM_MEDICAO, '');
  assert.ok(
    violacoes.length > 0,
    'fechar o CT-73 sem nova medicao real tinha de ser rejeitado',
  );
});

test('CT-73 (fixture): fechar com nova medicao real < 30 KB posterior ao baseline passa', () => {
  const violacoes = violacoesDeFechamento(FIXTURE_FECHADO_COM_MEDICAO, '');
  assert.deepEqual(
    violacoes,
    [],
    'com nova medicao real < 30 KB o fechamento tem de ser permitido',
  );
});

test('CT-73 (fixture): a medicao nova precisa ser < 30 KB, posterior ao baseline, e pode vir do PERF', () => {
  const valorNoTeto = FIXTURE_FECHADO_COM_MEDICAO.replace('22,4 KB', '30 KB');
  assert.ok(
    violacoesDeFechamento(valorNoTeto, '').length > 0,
    'valor igual ao teto (30 KB) nao e "< 30 KB": nao pode fechar',
  );

  const dataDoBaseline = FIXTURE_FECHADO_COM_MEDICAO.replace('05/10/2026', '02/10/2026');
  assert.ok(
    violacoesDeFechamento(dataDoBaseline, '').length > 0,
    'medicao com a data do baseline (02/10/2026) nao e posterior a ele: nao pode fechar',
  );

  const medicaoSoNoPerf = violacoesDeFechamento(FIXTURE_FECHADO_SEM_MEDICAO, FIXTURE_FECHADO_COM_MEDICAO);
  assert.deepEqual(
    medicaoSoNoPerf,
    [],
    'a nova medicao registrada no PERF.md tambem autoriza o fechamento',
  );
});

// ---------------------------------------------------------------------------
// Assercoes sobre os docs reais.
// ---------------------------------------------------------------------------

test('CT-73: o plano real nao declara fechado sem nova medicao real', async () => {
  const plano = await readFile(PLANO, 'utf8');
  const perf = await readFile(PERF, 'utf8');
  const bloco = blocoDoItem(plano, '**CT-73**');
  const perfSec = secao(perf, 'CT-73');

  assert.deepEqual(
    violacoesDeFechamento(bloco, perfSec),
    [],
    'o CT-73 real esta declarado fechado sem nova medicao < 30 KB nos docs',
  );

  const temMedicaoNova = Boolean(acharNovaMedicao(bloco) || acharNovaMedicao(perfSec));
  if (!temMedicaoNova) {
    assert.match(
      bloco,
      /^- \[ \] \*\*CT-73\*\*/m,
      'sem nova medicao real, o CT-73 tem de permanecer pendente (`- [ ]`)',
    );
    assert.doesNotMatch(bloco, /FEITO/i, 'sem nova medicao real, o CT-73 nao pode dizer FEITO');
    assert.doesNotMatch(bloco, /✅/, 'sem nova medicao real, o CT-73 nao pode carregar ✅');
  }
});

test('CT-73: o bloco preserva teto e baseline e, pendente, separa medicao de meta', async () => {
  const plano = await readFile(PLANO, 'utf8');
  const perf = await readFile(PERF, 'utf8');
  const bloco = blocoDoItem(plano, '**CT-73**');

  assert.match(bloco, /< 30 KB/, 'o teto vigente de < 30 KB por pagina de 24 tem de continuar explicito');
  assert.match(bloco, /81,5 KB/, 'o baseline historico de 81,5 KB tem de ser preservado');

  const perfSec = secao(perf, 'CT-73');
  if (!acharNovaMedicao(bloco) && !acharNovaMedicao(perfSec)) {
    assert.match(bloco, /medi[çc][aã]o[^.\n]*conclu[íi]da/i, 'a medicao concluida precisa ficar declarada');
    assert.match(bloco, /meta[^.\n]*n[aã]o[^.\n]*atingid/i, 'a meta nao atingida precisa ficar declarada, separada da medicao');
    assert.match(bloco, /nova medi[çc][aã]o real/i, 'apos reduzir o payload, o bloco tem de exigir nova medicao real');
  }
});

test('CT-73: nenhuma mencao no plano declara fechamento indevido', async () => {
  const plano = await readFile(PLANO, 'utf8');
  const perf = await readFile(PERF, 'utf8');
  const bloco = blocoDoItem(plano, '**CT-73**');
  const perfSec = secao(perf, 'CT-73');
  const mencoes = plano.split('\n').filter((l) => l.includes('CT-73'));

  assert.ok(mencoes.length >= 1, 'o plano perdeu as mencoes ao CT-73');

  if (acharNovaMedicao(bloco) || acharNovaMedicao(perfSec)) return; // ha medicao: fechar e legitimo

  for (const linha of mencoes) {
    assert.doesNotMatch(
      linha,
      /FEITO|fechado pelo aceite|✅/i,
      `mencao ao CT-73 declara fechamento que a evidencia nao sustenta: ${linha.trim()}`,
    );
  }
});

test('CT-73: o PERF.md separa medicao historica concluida de meta cumprida', async () => {
  const plano = await readFile(PLANO, 'utf8');
  const perf = await readFile(PERF, 'utf8');
  const bloco = blocoDoItem(plano, '**CT-73**');
  const perfSec = secao(perf, 'CT-73');

  assert.match(perfSec, /81,5 KB/, 'o antes historico (81,5 KB) tem de continuar registrado');
  assert.match(perfSec, /< 30 KB/, 'a meta vigente de < 30 KB tem de continuar registrada');

  if (acharNovaMedicao(bloco) || acharNovaMedicao(perfSec)) return; // medicao nova registrada: o texto de pendencia pode sair

  assert.match(perfSec, /medi[çc][aã]o hist[óo]rica[^.\n]*conclu[íi]da/i, 'PERF.md tem de declarar a medicao historica concluida');
  assert.match(perfSec, /meta[^.\n]*n[aã]o[^.\n]*(?:atingid|cumprid)/i, 'PERF.md tem de declarar a meta de desempenho nao cumprida');
  assert.match(perfSec, /nova medi[çc][aã]o real/i, 'PERF.md tem de exigir nova medicao real apos a reducao');
  assert.doesNotMatch(
    perfSec,
    /aceite[^\n]*?(?<!n[aã]o )(?:feito|feita|cumprid)/i,
    'o aceite do CT-73 nao pode ser dado por cumprido so porque houve medicao',
  );
});
