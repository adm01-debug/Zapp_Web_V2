import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// LT-TYPE-01 (docs/reconciliation/FINDINGS.json:14033-14180) — DOCUMENTATION_STALE.
// `docs/tipografia/REVISAO_PLANO_AUDITORIA_FONTES_2026-09-24.md` abria como estado ATUAL
// um retrato de 24/09/2026: placar de 47%, fila de PRs abertas e 17 arquivos de gráficos
// pendentes. A reconciliação registra que #590, #593, #595, #596, #611, #801 e #1428 já
// foram INTEGRADAS — `proof_type: STATIC`, `production_verified: false`, `scope_limit`
// "não é bug de runtime nem nova medição visual".
//
// Invariante travado aqui: enquanto o snapshot datado permanecer no documento, ele tem de
// abrir com uma atualização posterior ROTULADA que (a) diga que o placar, a fila e os
// gráficos pendentes abaixo valem só para 24/09/2026, (b) registre as sete referências
// integradas apontando LT-TYPE-01 como base e (c) negue nova medição visual. O histórico
// NÃO pode ser reescrito nem apagado: placar, fila e as 17 pendências continuam onde estão.
//
// Os dois lados da regra são provados por fixtures em string; o teste lê o documento real
// e era RED antes da correção (faltava a atualização), ficando GREEN com ela.

const DOC = new URL(
  '../../docs/tipografia/REVISAO_PLANO_AUDITORIA_FONTES_2026-09-24.md',
  import.meta.url,
);

// Mesmo normalizador de catalog-perf-meta-docs.unit.mjs e email-en088-medicao-docs.unit.mjs:
// sem acento, sem caixa, sem marcação Markdown e com a prosa reflowada numa linha só.
// O marcador de blockquote (`>`) sai junto; `#` fica, porque as referências (#590…) o usam.
const planoDeLeitura = (t) =>
  String(t)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const REFERENCIAS_INTEGRADAS = ['#590', '#593', '#595', '#596', '#611', '#801', '#1428'];

// A atualização posterior é a seção `##` rotulada, colocada ANTES de `## Placar`.
function secaoAtualizacao(markdown) {
  const linhas = String(markdown).split('\n');
  const inicio = linhas.findIndex((l) => /^##\s+Atualiza[çc][ãa]o\b/.test(l));
  if (inicio === -1) return null;
  const resto = linhas.slice(inicio + 1);
  const fim = resto.findIndex((l) => /^##\s/.test(l));
  return {
    inicio,
    texto: linhas.slice(inicio, fim === -1 ? linhas.length : inicio + 1 + fim).join('\n'),
  };
}

// Uma negação que não atravessa a fronteira da frase: o negador e o termo negado
// precisam estar na MESMA oração.
const NEGA_ESTADO_ATUAL = [
  /(?:nao|sem|nem|deixou de)\b[^.\n]{0,90}\bestado atual\b/,
  /\bapenas\b[^.\n]{0,90}\b24\/09\/2026\b/,
];

const NEGA_MEDICAO_VISUAL =
  /(?:sem|nao|nem|nenhum[ao]?)\b[^.\n]{0,140}\b(?:medicao|validacao|verificacao|medida|medido)\b[^.\n]{0,60}\bvisual\b/;

const DIZ_INTEGRADA = /(?:integr|mergead|mesclad|\bmerge\b)/;

/**
 * Violações do documento. Lista vazia = o snapshot está devidamente separado do estado
 * reconciliado. Exportada para os testes de fixture rodarem a MESMA regra do documento real.
 */
export function violacoesDoDocumento(markdown) {
  const doc = String(markdown);
  const inteiro = planoDeLeitura(doc);
  const violacoes = [];

  // ── O snapshot datado não pode ser reescrito nem apagado (parte incondicional) ──
  if (
    !/^\|\s*\*\*Total\*\*\s*\|\s*\*\*47\*\*\s*\|\s*\*\*7\*\*\s*\|\s*\*\*43\*\*\s*\|\s*\*\*3\*\*\s*\|\s*\*\*100\*\*\s*\|/m.test(
      doc,
    )
  ) {
    violacoes.push('o placar histórico (Total 47/7/43/3) foi apagado ou reescrito');
  }
  if (!/^\|\s*#590\s*\|[^\n]*aguardando merge/m.test(doc)) {
    violacoes.push('a fila de PRs de 24/09 (#590 "aguardando merge") sumiu do histórico');
  }
  if (!inteiro.includes('17 arquivos')) {
    violacoes.push('a lista histórica de 17 arquivos de gráficos pendentes foi apagada');
  }

  // ── A atualização posterior, rotulada, no início ──
  const secao = secaoAtualizacao(doc);
  if (!secao) {
    violacoes.push(
      'falta a seção rotulada de atualização posterior: o documento se apresenta como estado atual',
    );
    return violacoes;
  }

  const linhas = doc.split('\n');
  const iPlacar = linhas.findIndex((l) => /^##\s+Placar\b/.test(l));
  if (iPlacar === -1) {
    violacoes.push('o cabeçalho "## Placar" do snapshot histórico sumiu');
  } else if (secao.inicio > iPlacar) {
    violacoes.push('a atualização posterior tem de vir no início, antes do placar histórico');
  }

  const t = planoDeLeitura(secao.texto);

  if (!/(?:historico|historica|snapshot|retrato)/.test(t)) {
    violacoes.push('a atualização não rotula o placar/fila/gráficos como histórico');
  }
  if (!t.includes('24/09/2026')) {
    violacoes.push('a atualização não data o snapshot (24/09/2026)');
  }
  for (const [rotulo, alvo] of [
    ['o placar de 47%', '47%'],
    ['a fila de PRs', 'fila'],
    ['os gráficos pendentes', 'grafic'],
  ]) {
    if (!t.includes(alvo)) {
      violacoes.push(`a atualização não cita ${rotulo} como parte do snapshot histórico`);
    }
  }
  if (!NEGA_ESTADO_ATUAL.some((r) => r.test(t))) {
    violacoes.push('a atualização não afirma que o snapshot NÃO é o estado atual');
  }

  const faltam = REFERENCIAS_INTEGRADAS.filter((r) => !t.includes(r));
  if (faltam.length > 0) {
    violacoes.push(`referências integradas ausentes na atualização: ${faltam.join(', ')}`);
  }
  if (!DIZ_INTEGRADA.test(t)) {
    violacoes.push('a atualização não diz que as referências foram integradas');
  }
  if (!t.includes('lt-type-01')) {
    violacoes.push('a atualização não aponta LT-TYPE-01 como base da reconciliação');
  }
  if (!NEGA_MEDICAO_VISUAL.test(t)) {
    violacoes.push(
      'a atualização não nega nova medição visual (reconciliação documental ≠ validação visual)',
    );
  }

  return violacoes;
}

// ---------------------------------------------------------------------------
// Fixtures em string: provam os dois lados sem depender do estado do documento.
// ---------------------------------------------------------------------------

const HISTORICO_ANTES = [
  '# Revisão de execução — plano de auditoria de fontes (100 etapas)',
  '',
  'Plano revisado: `PLANO_AUDITORIA_FONTES_100_ETAPAS_2026-09-24.md` (PR #588).',
  'Estado medido em `main@d355b95` + as 4 PRs de implementação abertas em 24/09/2026.',
  '',
  'Legenda: ✅ feito · 🟡 parcial · ❌ não feito.',
].join('\n');

const HISTORICO_DEPOIS = [
  '## Placar',
  '',
  '| Fase | ✅ | 🟡 | ❌ | ⛔ | Total |',
  '|---|---|---|---|---|---|',
  '| **Total** | **47** | **7** | **43** | **3** | **100** |',
  '',
  '## Onde cada coisa está',
  '',
  '| PR | Fase | Estado em 24/09 17:05 UTC |',
  '|---|---|---|',
  '| #590 | F1+F2 | CI verde, atualizada com main, aguardando merge (1º da fila) |',
  '',
  '## Etapa a etapa',
  '',
  '| 62 | 🟡 | varredura feita; **17 arquivos ainda com `fontSize` solto** |',
].join('\n');

const ATUALIZACAO_OK = [
  '## Atualização posterior — estado reconciliado (reconciliação LT-TYPE-01)',
  '',
  '> **Snapshot histórico, não o estado atual.** Tudo neste documento — o cabeçalho, o placar',
  '> de **47%**, a fila de PRs e a lista de **17 arquivos com gráficos pendentes** — é o retrato',
  '> de **24/09/2026** e vale apenas para aquele dia. As tabelas datadas foram preservadas como',
  '> histórico; não foram reescritas.',
  '',
  'A reconciliação documental **LT-TYPE-01** (`docs/reconciliation/FINDINGS.json`, categoria',
  '`DOCUMENTATION_STALE`) registra que as sete referências abertas em 24/09 já foram',
  '**integradas**: **#590, #593, #595, #596, #611, #801 e #1428**. A fila descrita em "Onde cada',
  'coisa está" e as pendências de F5 (etapa 62) foram resolvidas depois daquele retrato.',
  '',
  'Isto é reconciliação **documental**: `LT-TYPE-01` tem `proof_type: STATIC`,',
  '`production_verified: false` e o `scope_limit` explícito — "reconciliação documental; não é',
  'bug de runtime nem nova medição visual". Nenhuma tela foi remedida aqui: a correção é de',
  'texto, não uma nova medição nem uma validação visual.',
].join('\n');

function comAtualizacao(secao, { depoisDoPlacar = false } = {}) {
  return depoisDoPlacar
    ? `${HISTORICO_ANTES}\n\n${HISTORICO_DEPOIS}\n\n${secao}\n`
    : `${HISTORICO_ANTES}\n\n${secao}\n\n${HISTORICO_DEPOIS}\n`;
}

function assertAcusa(markdown, trecho, contexto) {
  const violacoes = violacoesDoDocumento(markdown);
  assert.ok(
    violacoes.some((v) => v.includes(trecho)),
    `${contexto}: esperava violação contendo "${trecho}", veio ${JSON.stringify(violacoes)}`,
  );
}

test('fixture: sem a atualização, o documento é acusado de se apresentar como estado atual', () => {
  const violacoes = violacoesDoDocumento(comAtualizacao(''));
  assert.ok(
    violacoes.some((v) => v.includes('falta a seção rotulada de atualização posterior')),
    `o conteúdo anterior tinha de ser recusado, veio ${JSON.stringify(violacoes)}`,
  );
});

test('fixture: com a atualização rotulada no início, nenhuma violação', () => {
  assert.deepEqual(
    violacoesDoDocumento(comAtualizacao(ATUALIZACAO_OK)),
    [],
    'a atualização posterior bem formada tem de satisfazer a regra',
  );
});

test('fixture: atualização depois do placar não é "no início"', () => {
  assertAcusa(
    comAtualizacao(ATUALIZACAO_OK, { depoisDoPlacar: true }),
    'antes do placar histórico',
    'atualização posterior ao snapshot',
  );
});

test('fixture: sem a data, a atualização não ancora o snapshot', () => {
  assertAcusa(
    comAtualizacao(ATUALIZACAO_OK.replace(/24\/09\/2026/g, 'aquele dia')),
    'não data o snapshot',
    'snapshot sem data',
  );
});

test('fixture: faltando uma das sete referências, a regra recusa', () => {
  assertAcusa(
    comAtualizacao(ATUALIZACAO_OK.replace('#611, ', '')),
    'referências integradas ausentes',
    'referência ausente',
  );
});

test('fixture: listar as referências sem dizer que foram integradas não basta', () => {
  assertAcusa(
    comAtualizacao(ATUALIZACAO_OK.replace('**integradas**', '**listadas**')),
    'não diz que as referências foram integradas',
    'referências não integradas',
  );
});

test('fixture: sem LT-TYPE-01 não há base de reconciliação', () => {
  assertAcusa(
    comAtualizacao(ATUALIZACAO_OK.replace(/LT-TYPE-01/g, 'ALGUM-ACHADO')),
    'não aponta LT-TYPE-01',
    'base ausente',
  );
});

test('fixture: trocar a negativa por uma afirmação de medição visual recusa', () => {
  const semNegativa = ATUALIZACAO_OK.replace(
    /Isto é reconciliação[\s\S]*$/,
    'O placar foi conferido: 52% feito, com nova validação visual em 05/10.',
  );
  assertAcusa(
    comAtualizacao(semNegativa),
    'não nega nova medição visual',
    'alegação de validação visual',
  );
});

test('fixture: apagar o histórico datado é violação incondicional', () => {
  const doc = comAtualizacao(ATUALIZACAO_OK);
  assertAcusa(
    doc.replace(/\| \*\*Total\*\* \| \*\*47\*\*[^\n]*\n/, ''),
    'o placar histórico',
    'placar apagado',
  );
  assertAcusa(
    doc.replace(/aguardando merge/g, 'mergeada'),
    'a fila de PRs de 24/09',
    'fila reescrita',
  );
  assertAcusa(
    doc.replace(/17 arquivos/g, 'nenhum arquivo'),
    '17 arquivos de gráficos pendentes',
    'pendências apagadas',
  );
});

// ---------------------------------------------------------------------------
// Asserções sobre o documento real.
// ---------------------------------------------------------------------------

test('revisão de fontes: o documento real separa o snapshot do estado reconciliado', async () => {
  const doc = await readFile(DOC, 'utf8');
  assert.ok(doc.length > 0, 'o documento da revisão de fontes está vazio');
  assert.deepEqual(
    violacoesDoDocumento(doc),
    [],
    'o documento real ainda apresenta o retrato de 24/09 como estado atual',
  );
});
