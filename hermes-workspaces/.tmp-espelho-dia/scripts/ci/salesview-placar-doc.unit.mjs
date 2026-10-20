import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// SV-004 (docs/reconciliation/FINDINGS.json; item 477 do BACKLOG_VERIFICADO) — DOCUMENTATION_STALE.
//
// `docs/design/PLANO_SALESVIEW_JOURNEY_50_ETAPAS_2026-10-02.md` apresentava como estado VIGENTE um
// retrato que já tinha sido superado pelos seus próprios sucessores:
//   (a) o cabeçalho abria com "**Estado:** proposto — nenhuma etapa executada", apesar das cinco PRs
//       de fase (#1608, #1613, #1619, #1626, #1628) mergeadas em 02/10;
//   (b) o placar agrupava CINCO linhas de fase, quando o aceite do próprio S47 pede as 50 etapas
//       marcadas, uma por linha, com evidência;
//   (c) os apêndices de 02/10 seguiam listando como abertos/atuais defeitos já corrigidos depois:
//       chunk da Journey em 404 (lido fora da sequência correta), aba que não restaurava (#1797/#1807)
//       e alto-contraste sem controle montado (#1829/#1847).
//
// A reconciliação (`required_fix`: "reconciliação por tarefa com sucessores explícitos e limites de
// cada medição; preservar histórico sem apresentá-lo como estado vigente") NÃO reescreve o retrato
// datado: ele fica onde está, e o documento passa a abrir com uma atualização posterior ROTULADA que
// delimita o snapshot, registra as fases integradas e os sucessores, e o placar passa a listar
// S01..S50. O 404 histórico deixa de ser apresentado como defeito atual exclusivo da Journey.
//
// O teste lê o DOCUMENTO REAL e era RED antes da correção (sem a seção de atualização, com 5 linhas de
// fase e com o 404 sem rótulo), ficando GREEN com ela. Fixtures em string provam os dois lados da regra
// sem depender do estado do documento.

const DOC = new URL(
  '../../docs/design/PLANO_SALESVIEW_JOURNEY_50_ETAPAS_2026-10-02.md',
  import.meta.url,
);

const SNAPSHOT = '02/10/2026';
const FASES = ['#1608', '#1613', '#1619', '#1626', '#1628'];
const SUCESSORES = ['#1640', '#1797', '#1807', '#1829', '#1847'];
const ETAPAS = Array.from({ length: 50 }, (_, i) => `S${String(i + 1).padStart(2, '0')}`);

// Mesmo normalizador de revisao-fontes-doc.unit.mjs / catalog-perf-meta-docs.unit.mjs: sem acento,
// sem caixa, sem marcação Markdown e com a prosa reflowada numa linha só. O `#` fica (as referências
// a PR o usam).
const planoDeLeitura = (t) =>
  String(t)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

function secao(markdown, tituloRe) {
  const linhas = String(markdown).split('\n');
  const inicio = linhas.findIndex((l) => tituloRe.test(l));
  if (inicio === -1) return null;
  const resto = linhas.slice(inicio + 1);
  const fim = resto.findIndex((l) => /^##\s/.test(l));
  return {
    inicio,
    texto: linhas.slice(inicio, fim === -1 ? linhas.length : inicio + 1 + fim).join('\n'),
  };
}

const secaoAtualizacao = (md) => secao(md, /^##\s+Atualiza[çc][ãa]o\b/);
const secaoPlacar = (md) => secao(md, /^##\s+7\.\s*Placar\b/);
const secaoApendice = (md) => secao(md, /^##\s+Verifica[çc][ãa]o p[oó]s-fechamento\b/);

// Uma negação que não atravessa a fronteira da frase: o negador e o termo negado têm de estar na
// MESMA oração, ou o retrato precisa ser explicitamente chamado de snapshot/retrato datado.
const NEGA_ESTADO_VIGENTE = [
  /(?:nao|sem|nem|deixou de)\b[^.\n]{0,140}\b(?:estado vigente|estado atual)\b/,
  /\b(?:apenas|so|somente)\b[^.\n]{0,140}\b02\/10\/2026\b/,
  /\b(?:snapshot|retrato datado|retrato de 02\/10\/2026)\b/,
];

// O 404 do chunk só pode aparecer acompanhado do rótulo que o desloca para o passado (ou da leitura
// correta: a Journey passou a servir o chunk com 200).
const QUALIFICA_404 =
  /(historic|superad|obsolet|antig|resolvid|corrigid|falso negativo|chunk 200|sequencia correta)/i;

/**
 * Violações do documento. Lista vazia = o retrato datado está devidamente separado do estado
 * reconciliado. Exportada para as fixtures rodarem a MESMA regra do documento real.
 */
export function violacoesDoDocumento(markdown) {
  const doc = String(markdown);
  const violacoes = [];

  const atualizacao = secaoAtualizacao(doc);
  const placar = secaoPlacar(doc);

  // ── 1) a atualização posterior, rotulada, no início ──
  if (!atualizacao) {
    violacoes.push(
      'falta a seção rotulada de atualização posterior: o plano se apresenta como estado vigente',
    );
    return violacoes;
  }
  if (!placar) {
    violacoes.push('o cabeçalho "## 7. Placar" sumiu do plano');
    return violacoes;
  }
  if (atualizacao.inicio > placar.inicio) {
    violacoes.push('a atualização posterior tem de vir no início, antes do placar');
  }

  const u = planoDeLeitura(atualizacao.texto);
  if (!u.includes(SNAPSHOT)) {
    violacoes.push(`a atualização não data o retrato (${SNAPSHOT})`);
  }
  if (!/(historico|retrato|snapshot)/.test(u)) {
    violacoes.push('a atualização não rotula o cabeçalho/placar como retrato datado');
  }
  if (!u.includes('nenhuma etapa executada')) {
    violacoes.push('a atualização não delimita a afirmação "nenhuma etapa executada" desse retrato');
  }
  if (!NEGA_ESTADO_VIGENTE.some((r) => r.test(u))) {
    violacoes.push('a atualização não afirma que o retrato NÃO é o estado vigente');
  }
  if (!u.includes('sv-004')) {
    violacoes.push('a atualização não aponta SV-004 como base da reconciliação');
  }
  for (const pr of FASES) {
    if (!u.includes(pr)) violacoes.push(`a atualização não registra a fase ${pr} como integrada`);
  }
  for (const pr of SUCESSORES) {
    if (!u.includes(pr)) {
      violacoes.push(`a atualização não registra o sucessor ${pr} que muda a conclusão`);
    }
  }
  if (planoDeLeitura(doc).includes('unico aceite')) {
    violacoes.push('o documento afirma exclusividade falsa para um aberto posterior');
  }
  if (!u.includes('s41') || !(u.includes('item 7') || u.includes('0 erros de console') || u.includes('console'))) {
    violacoes.push('a atualização não lista o item 7 do S41 como aberto');
  }

  // ── 2) o placar lista as 50 etapas, uma por linha, com estado e evidência ──
  const linhasPlacar = placar.texto
    .split('\n')
    .filter((l) => /^\|\s*\*{0,2}S\d{2}\b/.test(l));
  const presentes = new Set(linhasPlacar.map((l) => l.match(/S\d{2}/)[0]));
  const faltam = ETAPAS.filter((e) => !presentes.has(e));
  if (faltam.length > 0) {
    violacoes.push(`o placar não lista as 50 etapas (faltam: ${faltam.join(', ')})`);
  }
  if (linhasPlacar.length !== ETAPAS.length) {
    violacoes.push(
      `o placar tem ${linhasPlacar.length} linhas de etapa; o aceite do S47 pede ${ETAPAS.length}`,
    );
  }
  for (const linha of linhasPlacar) {
    const id = linha.match(/S\d{2}/)[0];
    if (!/\[\s*[xX~✓ ]\s*\]/.test(linha)) {
      violacoes.push(`a linha ${id} não tem marcador de estado ([x]/[~]/[ ])`);
    }
    if (!/(#\d{3,4}|`[0-9a-f]{7,}`|02\/10\/2026)/.test(linha)) {
      violacoes.push(`a linha ${id} não traz evidência (PR, SHA ou data)`);
    }
  }

  // ── 3) o 404 histórico não pode constar como defeito atual ──
  for (const linha of doc.split('\n')) {
    if (!/404/.test(linha)) continue;
    if (QUALIFICA_404.test(linha)) continue;
    violacoes.push(`o 404 aparece sem rótulo histórico/superado: "${linha.trim().slice(0, 90)}"`);
  }


  // ── 4) o apêndice S41 precisa bater com o placar: item 7 segue aberto ──
  const apendice = secaoApendice(doc);
  if (apendice) {
    const s41 = apendice.texto.match(/- \*\*S41\*\*[\s\S]*?(?=\n- \*\*S43\*\*|$)/);
    if (!s41) {
      violacoes.push('o apêndice não registra o bullet do S41');
    } else {
      const s41Texto = planoDeLeitura(s41[0]);
      if (!(s41Texto.includes('item 7') || s41Texto.includes('0 erros de console'))) {
        violacoes.push('o apêndice S41 não registra o item 7 como aberto');
      }
    }
  }

  return violacoes;
}

// ---------------------------------------------------------------------------
// Fixtures em string: provam os dois lados sem depender do estado do documento.
// ---------------------------------------------------------------------------

const CABECALHO = [
  '# Inbox — Plano SalesView + Journey: 50 etapas',
  '',
  '**Gerado em:** 2026-10-02 · **Base do levantamento:** `main` `e6fd391`',
  '**Estado:** proposto — nenhuma etapa executada.',
].join('\n');

const PLACAR_5 = [
  '## 7. Placar',
  '',
  '| Etapa | Estado | Evidência |',
  '|---|---|---|',
  '| S01–S10 (Fase 1) | [x] | PR #1608 mergeada 02/10 (`7b6a69e3`) |',
  '| S11–S20 (Fase 2) | [x] | PR #1613 mergeada 02/10 (`30ef8e79`) |',
  '| S21–S31 (Fase 3) | [x] | PR #1619 mergeada 02/10 (`f4f3c26b`) |',
  '| S32–S40 (Fase 4) | [~] | PR #1626 mergeada 02/10 (`c97429f0`) |',
  '| S41–S50 (Fase 5) | [~] | S44–S48 executados |',
].join('\n');

const PLACAR_50 = [
  '## 7. Placar',
  '',
  '| Etapa | Estado | Evidência |',
  '|---|---|---|',
  ...ETAPAS.map(
    (e) => `| ${e} · etapa do plano | [x] | Fase 1 — #1608 · 02/10 · \`7b6a69e3\` |`,
  ),
].join('\n');

const BUGS_404_ABERTO = [
  '**Bugs de produção abertos por esta verificação:** (1) aba Journey servindo chunk inexistente (404);',
].join('\n');

const BUGS_404_ROTULADO = [
  '**Bugs de produção registrados por esta verificação (estado de 02/10):** (1) aba Journey servindo',
  'chunk inexistente (404) — **histórico, superado**: capturas posteriores mostram a Journey funcional',
  '(chunk 200).',
].join('\n');

const ATUALIZACAO_OK = [
  '## Atualização posterior — estado reconciliado (reconciliação SV-004)',
  '',
  '> **Retrato datado, não o estado vigente.** Tudo neste documento — o cabeçalho, o placar e os',
  '> apêndices de verificação — vale para **02/10/2026**. O cabeçalho dizia "nenhuma etapa executada";',
  '> isso é o snapshot daquela data, não o estado atual.',
  '',
  'A reconciliação **SV-004** (`docs/reconciliation/FINDINGS.json`) registra que as cinco PRs de fase',
  'já foram **integradas**: **#1608, #1613, #1619, #1626 e #1628**, e que os sucessores',
  '**#1640, #1797, #1807, #1829 e #1847** mudam a conclusão dos apêndices abaixo.',
  '',
  'O que permanece aberto: S38 print do acordeão; S41 item 7 (0 erros de console); S43 contraste',
  'por elemento no modo alto-contraste.',
].join('\n');

function comAtualizacao(secaoTexto, { placar = PLACAR_50, bugs = BUGS_404_ROTULADO, depois = false } = {}) {
  return depois
    ? `${CABECALHO}\n\n${placar}\n\n${secaoTexto}\n\n${bugs}\n`
    : `${CABECALHO}\n\n${secaoTexto}\n\n${placar}\n\n${bugs}\n`;
}

function assertAcusa(markdown, trecho, contexto) {
  const violacoes = violacoesDoDocumento(markdown);
  assert.ok(
    violacoes.some((v) => v.includes(trecho)),
    `${contexto}: esperava violação contendo "${trecho}", veio ${JSON.stringify(violacoes)}`,
  );
}

test('fixture: sem a atualização, o plano é acusado de se apresentar como estado vigente', () => {
  assertAcusa(
    comAtualizacao(''),
    'falta a seção rotulada de atualização posterior',
    'plano anterior à reconciliação',
  );
});

test('fixture: com a atualização rotulada no início o plano passa', () => {
  assert.deepEqual(
    violacoesDoDocumento(comAtualizacao(ATUALIZACAO_OK)),
    [],
    'a reconciliação bem formada tem de satisfazer a regra',
  );
});

test('fixture: atualização depois do placar não é "no início"', () => {
  assertAcusa(
    comAtualizacao(ATUALIZACAO_OK, { depois: true }),
    'antes do placar',
    'atualização posterior ao placar',
  );
});

test('fixture: o placar de cinco linhas de fase não fecha o aceite do S47', () => {
  assertAcusa(
    comAtualizacao(ATUALIZACAO_OK, { placar: PLACAR_5 }),
    'o placar não lista as 50 etapas',
    'placar agregado por fase',
  );
});

test('fixture: linha de etapa sem marcador de estado é recusada', () => {
  const semMarcador = PLACAR_50.replace(
    '| S01 · etapa do plano | [x] |',
    '| S01 · etapa do plano |  |',
  );
  assertAcusa(
    comAtualizacao(ATUALIZACAO_OK, { placar: semMarcador }),
    'não tem marcador de estado',
    'etapa sem estado',
  );
});

test('fixture: 404 sem rótulo histórico continua sendo defeito vigente', () => {
  assertAcusa(
    comAtualizacao(ATUALIZACAO_OK, { bugs: BUGS_404_ABERTO }),
    'o 404 aparece sem rótulo histórico',
    '404 apresentado como atual',
  );
});

test('fixture: sem a data do retrato a atualização não ancora o snapshot', () => {
  assertAcusa(
    comAtualizacao(ATUALIZACAO_OK.replace(/02\/10\/2026/g, 'aquele dia')),
    'não data o retrato',
    'retrato sem data',
  );
});

test('fixture: faltando uma fase integrada a atualização é incompleta', () => {
  assertAcusa(
    comAtualizacao(ATUALIZACAO_OK.replace('#1626 e #1628', '#1626')),
    'não registra a fase #1628',
    'fase ausente',
  );
});

// ---------------------------------------------------------------------------
// Asserções sobre o documento real.
// ---------------------------------------------------------------------------

test('plano SalesView + Journey: o retrato de 02/10 está separado do estado reconciliado', async () => {
  const doc = await readFile(DOC, 'utf8');
  assert.ok(doc.length > 0, 'o plano SalesView + Journey está vazio');
  assert.deepEqual(
    violacoesDoDocumento(doc),
    [],
    'o plano real ainda apresenta o retrato de 02/10 como estado vigente',
  );
});

// As violações acima provam o defeito no CONTEÚDO BASE; as mutações abaixo provam que a regra também
// recusa as formas do achado quando aplicada ao PRÓPRIO documento real (o negativo não depende de
// fixture escrita à mão).
const MUTACOES = {
  'sem a seção rotulada de atualização': (d) =>
    d.replace(/^## Atualiza[çc][ãa]o posterior[\s\S]*?(?=^## 1\. )/m, ''),
  'placar de novo agregado em cinco linhas de fase': (d) =>
    d
      .replace(/^\| S\d{2} · .*$/gm, '')
      .replace(
        '| Etapa | Estado | Evidência |\n|---|---|---|',
        '| Etapa | Estado | Evidência |\n|---|---|---|\n| S01–S10 (Fase 1) | [x] | PR #1608 mergeada 02/10 |',
      ),
  '404 sem o rótulo histórico': (d) =>
    d.split('**404** — **histórico, superado**').join('**404**'),
  'exclusividade falsa reintroduzida no S43': (d) =>
    d.replace(
      'Contraste por elemento no modo alto-contraste: **segue pendente**; as PRs posteriores corrigiram o controle/toggle e a preferência do sistema, mas não fecharam essa medição por elemento.',
      'Contraste por elemento no modo alto-contraste: **segue pendente** — é o único aceite que as PRs posteriores deixam em aberto.',
    ),
  'item 7 removido da atualização posterior': (d) =>
    d.replace(
      `o item **7** do S41 (0 erros de console em todo o fluxo), pois a verificação
ainda registrava 401 de outro fluxo e chunks obsoletos; `,
      '',
    ),
  'item 7 removido do apêndice S41': (d) =>
    d.replace(
      `; item **7** (0 erros de console em todo o fluxo)
  **segue aberto**: a medição ainda registrava 401 de outro fluxo e chunks obsoletos.`,
      '.',
    ),
};

test('plano real: cada forma do achado é recusada quando reintroduzida no próprio documento', async () => {
  const doc = await readFile(DOC, 'utf8');
  for (const [nome, mutar] of Object.entries(MUTACOES)) {
    const mutado = mutar(doc);
    assert.notEqual(mutado, doc, `${nome}: a mutação não alterou o documento real (regex desatualizada)`);
    assert.ok(
      violacoesDoDocumento(mutado).length > 0,
      `${nome}: a regra aceitou o documento real com o defeito reintroduzido`,
    );
  }
});
