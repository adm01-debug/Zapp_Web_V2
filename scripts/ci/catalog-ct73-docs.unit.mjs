// OTH-009 / CT-73: o plano de finalizacao do catalogo marcava o CT-73 como
// concluido (`[x]` / "✅ FEITO") porque a MEDICAO tinha sido feita — mesmo com a
// propria evidencia registrando 81,5 KB por pagina de 24 contra o teto vigente de
// < 30 KB. Medicao concluida e meta atingida sao estados diferentes: o texto
// fundia os dois e fechava o item sem que o alvo de desempenho existisse.
//
// Por que isto virou teste: "medir 81,5 KB" ficou registrado como se fosse
// "cumprir < 30 KB", e a mesma confusao reaparecia em dois pontos (o checkbox do
// plano e a secao do PERF.md). O invariante abaixo prende os dois: o teto e o
// baseline historico nao podem ser apagados, e o aceite so pode ser declarado
// cumprido depois de uma nova medicao real abaixo do teto.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const PLANO = new URL('../../docs/catalogo/PLANO_FINALIZACAO_CATALOGO_100.md', import.meta.url);
const PERF = new URL('../../docs/catalogo/PERF.md', import.meta.url);

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

test('CT-73: o checkbox do plano esta desmarcado e o aceite nao e declarado cumprido', async () => {
  const plano = await readFile(PLANO, 'utf8');
  const bloco = blocoDoItem(plano, '**CT-73**');

  assert.match(bloco, /^- \[ \] \*\*CT-73\*\*/m, 'CT-73 nao pode ficar marcado como concluido: a meta (< 30 KB) nao foi atingida');
  assert.doesNotMatch(bloco, /FEITO/i, 'CT-73 nao pode declarar "FEITO" enquanto a meta de < 30 KB nao for medida');
  assert.doesNotMatch(bloco, /✅/, 'CT-73 nao pode carregar selo de concluido enquanto o alvo nao for atingido');
});

test('CT-73: o bloco diferencia medicao concluida de meta nao atingida e exige nova medicao real', async () => {
  const plano = await readFile(PLANO, 'utf8');
  const bloco = blocoDoItem(plano, '**CT-73**');

  assert.match(bloco, /< 30 KB/, 'o teto vigente de < 30 KB por pagina de 24 tem de continuar explicito');
  assert.match(bloco, /81,5 KB/, 'o baseline historico de 81,5 KB tem de ser preservado');
  assert.match(bloco, /medi[çc][aã]o[^.\n]*conclu[íi]da/i, 'a medicao concluida precisa ficar declarada');
  assert.match(bloco, /meta[^.\n]*n[aã]o[^.\n]*atingid/i, 'a meta nao atingida precisa ficar declarada, separada da medicao');
  assert.match(bloco, /nova medi[çc][aã]o real/i, 'apos reduzir o payload, o bloco tem de exigir nova medicao real');
});

test('CT-73: nenhuma mencao no plano o declara fechado pela medicao', async () => {
  const plano = await readFile(PLANO, 'utf8');
  const mencoes = plano.split('\n').filter((l) => l.includes('CT-73'));

  assert.ok(mencoes.length >= 1, 'o plano perdeu as mencoes ao CT-73');
  for (const linha of mencoes) {
    assert.doesNotMatch(
      linha,
      /FEITO|fechado pelo aceite|✅/i,
      `mencao ao CT-73 declara fechamento que a evidencia nao sustenta: ${linha.trim()}`,
    );
  }
});

test('CT-73: o PERF.md separa medicao historica concluida de meta cumprida', async () => {
  const perf = await readFile(PERF, 'utf8');
  const bloco = secao(perf, 'CT-73');

  assert.match(bloco, /81,5 KB/, 'o antes historico (81,5 KB) tem de continuar registrado');
  assert.match(bloco, /< 30 KB/, 'a meta vigente de < 30 KB tem de continuar registrada');
  assert.match(bloco, /medi[çc][aã]o hist[óo]rica[^.\n]*conclu[íi]da/i, 'PERF.md tem de declarar a medicao historica concluida');
  assert.match(bloco, /meta[^.\n]*n[aã]o[^.\n]*(?:atingid|cumprid)/i, 'PERF.md tem de declarar a meta de desempenho nao cumprida');
  assert.match(bloco, /nova medi[çc][aã]o real/i, 'PERF.md tem de exigir nova medicao real apos a reducao');
  assert.doesNotMatch(
    bloco,
    /aceite[^\n]*(?:feito|feita|cumprid)/i,
    'o aceite do CT-73 nao pode ser dado por cumprido so porque houve medicao',
  );
});
