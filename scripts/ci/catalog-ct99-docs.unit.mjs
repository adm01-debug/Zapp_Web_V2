// OTH-011 / CT-99 (cartão SL-153): o cabeçalho SUPERSEDIDO do plano histórico do
// Catálogo justificava as 396 caixas abertas dizendo que o validador
// `scripts/catalog/validate-plan.mjs` exigia um mínimo de caixas abertas por bloco E
// e que marcar a segunda caixa derrubaria o validador. Esse motivo CADUCOU no
// próprio código: o parser passou a contar `[ ]`, `[x]` e `[X]` (commit
// `fe6760cf1`, 05/10/2026) e a aceitar o tombstone da E54 (commit `d044ef986`,
// 06/10/2026), então o gate está verde e marcar não quebra nada.
//
// Por que isto virou teste: um documento que afirma um fato falso sobre um script
// é defeito — quem lê o cabeçalho hoje conclui que a marcação é impossível. A
// decisão de manter as caixas abertas continua certa, mas por outro fundamento: a
// reconciliação canônica classifica este plano como `HISTORICAL_SUPERSEDED` e o
// OTH-011 (`docs/reconciliation/FINDINGS.md`) registra que marcar caixa por caixa
// seria "alteração documental artificial" sem considerar a sucessão do plano.
//
// O invariante é CONDICIONAL, para não congelar o provisório:
//   * a frase que afirma que marcar os checkboxes quebra o validador só conta como
//     violação ENQUANTO o validador de fato aceitar o plano com as caixas marcadas
//     (a prova é dinâmica: o teste monta a cópia marcada e roda o validador real);
//   * se o plano disser que as caixas foram deixadas abertas por decisão, o texto
//     tem de citar o registro canônico da reconciliação
//     (`docs/reconciliation/tasks/P015.json`), não o validador;
//   * se um dia as caixas forem marcadas de verdade, a segunda asserção não se aplica.
// Os dois lados ficam provados por fixtures em string, além das asserções sobre o
// documento real.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const PLANO = path.join(RAIZ, 'docs/catalogo/PLANO_IMPLEMENTACAO_CATALOGO_100.md');
const VALIDADOR = path.join(RAIZ, 'scripts/catalog/validate-plan.mjs');
const RECONCILIACAO = path.join(RAIZ, 'docs/reconciliation/tasks/P015.json');

function rodarValidador(arquivo) {
  const args = arquivo === undefined ? [VALIDADOR] : [VALIDADOR, arquivo];
  return spawnSync(process.execPath, args, { cwd: RAIZ, encoding: 'utf8' });
}

/** Roda o validador real sobre um plano escrito em diretorio temporario. */
function validarPlano(conteudo) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ct99-plano-'));
  const arquivo = path.join(dir, 'PLANO.md');
  try {
    writeFileSync(arquivo, conteudo, 'utf8');
    return rodarValidador(arquivo);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Cria a copia do plano com as 396 caixas marcadas (`- [ ]` -> `- [x]`). */
function marcarCaixas(markdown) {
  return markdown.replace(/^- \[ \] /gm, '- [x] ');
}

/** Cabecalho do plano: tudo antes do primeiro bloco `### E..`. */
function cabecalho(markdown) {
  const corte = markdown.search(/^### E\d{2,3} · /m);
  return corte === -1 ? markdown : markdown.slice(0, corte);
}

/** Paragrafo do cabecalho que registra a decisao sobre os checkboxes. */
function paragrafoDaDecisao(markdown) {
  const linhas = cabecalho(markdown).split('\n');
  const inicio = linhas.findIndex((l) => /checkboxes/i.test(l));
  if (inicio === -1) return '';
  let fim = linhas.length;
  for (let i = inicio + 1; i < linhas.length; i++) {
    // O paragrafo da decisao vive no blockquote do cabecalho: termina na linha
    // vazia do blockquote (`>`) ou no fim do blockquote.
    if (!/^>/.test(linhas[i]) || /^>\s*$/.test(linhas[i])) {
      fim = i;
      break;
    }
  }
  return linhas.slice(inicio, fim).join('\n');
}

// Frases que afirmam ser impossivel/perigoso marcar as caixas por causa do
// validador. So valem como violacao enquanto a prova dinamica mostrar o contrario.
const AFIRMA_QUE_MARCAR_QUEBRA = [
  /exige\s+\*{0,2}≥\s*3\*{0,2}[^.\n]*`?- \[ \]`?/i,
  /quebraria o validador/i,
  /derrubaria o validador/i,
  /parser conta apenas caixas/i,
];

const CITA_RECONCILIACAO = /reconciliation\/tasks\/P015\.json|HISTORICAL_SUPERSEDED/;
const DIZ_QUE_NAO_MARCOU = /N[ÃA]O (foram|foi) marcado/i;

/**
 * Regra condicional do CT-99 sobre o paragrafo da decisao:
 *   * afirma que marcar quebra o validador enquanto ele aceita a copia marcada -> violacao;
 *   * diz que as caixas foram deixadas abertas sem citar a reconciliacao canonica -> violacao.
 */
function violacoesDaDecisao(paragrafo, { aceitaMarcadas }) {
  if (!paragrafo) return [];
  const violacoes = [];
  if (aceitaMarcadas) {
    for (const re of AFIRMA_QUE_MARCAR_QUEBRA) {
      if (re.test(paragrafo)) {
        violacoes.push(
          'a decisao afirma que marcar os checkboxes quebra o validador, ' +
            'mas o validador aceita o plano com todas as caixas marcadas',
        );
      }
    }
  }
  if (DIZ_QUE_NAO_MARCOU.test(paragrafo) && !CITA_RECONCILIACAO.test(paragrafo)) {
    violacoes.push(
      'a decisao diz que os checkboxes foram deixados abertos sem citar o registro ' +
        'canonico da reconciliacao (docs/reconciliation/tasks/P015.json)',
    );
  }
  return violacoes;
}

// ---------------------------------------------------------------------------
// Fixtures em string: provam os dois lados sem depender do estado dos docs.
// ---------------------------------------------------------------------------

// Texto que existia no cabecalho do plano (commit anterior a 08/10/2026).
const FIXTURE_MOTIVO_CADUCO = [
  '> **Os 396 checkboxes abaixo NÃO foram marcados** (decisão do CT-99): o validador',
  '> `scripts/catalog/validate-plan.mjs` exige **≥ 3 itens `- [ ]` por bloco E** e cada bloco',
  '> tem **exatamente 4** — marcar mais de um por bloco **quebraria o validador**, que é',
  '> justamente o que o aceite do CT-99 manda preservar.',
].join('\n');

const FIXTURE_MOTIVO_ATUAL = [
  '> **Os 396 checkboxes abaixo seguem NÃO marcados** (decisão do CT-99, revista em 08/10/2026):',
  '> este plano é registro histórico — a reconciliação canônica o classificou `HISTORICAL_SUPERSEDED`',
  '> (`docs/reconciliation/tasks/P015.json`, 100/100 etapas, `original_claim: UNMARKED`).',
].join('\n');

test('CT-99 (fixture): motivo caduco e violacao enquanto o validador aceita caixas marcadas', () => {
  const violacoes = violacoesDaDecisao(FIXTURE_MOTIVO_CADUCO, { aceitaMarcadas: true });
  assert.ok(
    violacoes.length > 0,
    'afirmar que marcar quebra o validador tinha de ser rejeitado enquanto ele aceita a copia marcada',
  );
});

test('CT-99 (fixture): a mesma frase deixa de ser violacao se o validador voltar a recusar caixas marcadas', () => {
  const violacoes = violacoesDaDecisao(FIXTURE_MOTIVO_CADUCO, { aceitaMarcadas: false });
  assert.ok(
    !violacoes.some((v) => /quebra o validador/.test(v)),
    'com o validador recusando caixas marcadas a afirmacao seria verdadeira e nao pode ser acusada',
  );
});

test('CT-99 (fixture): motivo pela reconciliacao canonica passa', () => {
  assert.deepEqual(violacoesDaDecisao(FIXTURE_MOTIVO_ATUAL, { aceitaMarcadas: true }), []);
});

test('CT-99 (fixture): dizer que deixou as caixas abertas sem citar a reconciliacao e violacao', () => {
  const semFonte = '> **Os 396 checkboxes abaixo NÃO foram marcados** por decisão do CT-99.';
  const violacoes = violacoesDaDecisao(semFonte, { aceitaMarcadas: true });
  assert.ok(violacoes.length > 0, 'a decisao sem fonte canonica tinha de ser rejeitada');
  assert.match(violacoes.join(' '), /P015\.json/);
});

test('CT-99 (fixture): paragrafo sem decisao registrada nao gera acusacao', () => {
  assert.deepEqual(violacoesDaDecisao('', { aceitaMarcadas: true }), []);
});

test('CT-99 (mutacao): reintroduzir o motivo caduco no cabecalho REAL e acusado', () => {
  // Prova por mutacao sobre o artefato real: o paragrafo da decisao do proprio
  // plano recebe de volta a frase caduca e a regra tem de acusar.
  const plano = readFileSync(PLANO, 'utf8');
  const paragrafo = paragrafoDaDecisao(plano);
  const mutado = `${paragrafo}\n> O validador exige **≥ 3 itens \`- [ ]\` por bloco E** — marcar mais de um por bloco quebraria o validador.`;
  const aceitaMarcadas = validarPlano(marcarCaixas(plano)).status === 0;

  const violacoes = violacoesDaDecisao(mutado, { aceitaMarcadas });
  assert.ok(
    violacoes.some((v) => /quebra o validador/.test(v)),
    'a mutacao do cabecalho real com o motivo caduco tinha de ser acusada',
  );
});

// ---------------------------------------------------------------------------
// Assercoes sobre o documento real.
// ---------------------------------------------------------------------------

test('CT-99: o validador passa no plano historico e aceita a copia com as caixas marcadas', () => {
  const plano = readFileSync(PLANO, 'utf8');

  const real = rodarValidador();
  assert.equal(real.status, 0, `validador vermelho no plano canonico: ${real.stderr}`);
  assert.match(real.stdout, /OK: 100 etapas/);

  const comCaixasMarcadas = marcarCaixas(plano);
  assert.notEqual(comCaixasMarcadas, plano, 'o plano perdeu as caixas abertas que a prova precisa marcar');
  const marcado = validarPlano(comCaixasMarcadas);
  assert.equal(
    marcado.status,
    0,
    `marcar as caixas passou a quebrar o validador (isso tornaria o cabeçalho atual verdadeiro): ${marcado.stderr}`,
  );
  assert.match(marcado.stdout, /OK: 100 etapas/);
});

test('CT-99: a decisao no cabecalho do plano historico nao afirma motivo caduco', () => {
  const plano = readFileSync(PLANO, 'utf8');
  const paragrafo = paragrafoDaDecisao(plano);
  assert.ok(paragrafo, 'o plano historico perdeu o paragrafo da decisao sobre os checkboxes');

  const aceitaMarcadas = validarPlano(marcarCaixas(plano)).status === 0;
  assert.deepEqual(
    violacoesDaDecisao(paragrafo, { aceitaMarcadas }),
    [],
    'o cabecalho do plano historico continua afirmando um motivo que o validador atual nao sustenta',
  );
});

test('CT-99: o plano historico continua com as 396 caixas abertas e nenhuma marcada', () => {
  const plano = readFileSync(PLANO, 'utf8');
  assert.equal((plano.match(/^- \[ \] /gm) || []).length, 396, 'a contagem de caixas abertas mudou sem prova');
  assert.equal((plano.match(/^- \[[xX]\] /gm) || []).length, 0, 'apareceu caixa marcada no plano historico');
});

test('CT-99: a reconciliacao canonica do plano existe e o cabeçalho a cita', () => {
  const registro = JSON.parse(readFileSync(RECONCILIACAO, 'utf8'));
  assert.equal(registro.plan.authority, 'HISTORICAL_SUPERSEDED');
  assert.equal(registro.plan.observed_tasks, 100);
  assert.equal(registro.tasks.length, 100);

  const paragrafo = paragrafoDaDecisao(readFileSync(PLANO, 'utf8'));
  assert.match(
    paragrafo,
    CITA_RECONCILIACAO,
    'a decisao precisa apontar para o registro canonico da reconciliacao',
  );
});
