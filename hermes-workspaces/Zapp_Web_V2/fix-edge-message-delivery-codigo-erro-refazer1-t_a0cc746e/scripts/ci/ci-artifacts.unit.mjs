/**
 * E72 (auditoria de GitHub Actions de 2026-10-01, achado G-32) — politica dos
 * artifacts publicados pelo `ci.yml`.
 *
 * O que o plano pede (docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md,
 * item E72; docs/plans/PLANO_SEGUNDA_LEVA_CARTOES_2026-10-08.md, SL-100):
 *   - `dist`              -> so em `workflow_dispatch` (a Vercel builda sozinha);
 *   - `coverage-report`   -> so na main (push), com 7 dias de retencao;
 *   - `playwright-report` -> so `if: failure()`.
 * E a verificacao que o plano escreve: "PR verde cria 0 artifacts".
 * Motivo medido: 2.333 artifacts acumulados em 01/10/2026 porque TODO PR
 * publicava os tres uploads (nenhum deles e consumido num PR).
 *
 * Por que isto e' teste: a exigencia vive num `if:` de YAML e o `actionlint`
 * (verificacao oficial) valida sintaxe, nao o invariante — ele ficaria verde com
 * o guard trocado de volta por `if: always()`. Este teste le a expressao do
 * bloco REAL do `ci.yml` e a AVALIA em contextos de evento/resultado (PR, push
 * na main, dispatch, falha), de modo que a assercao e' sobre comportamento ("o
 * step roda neste evento?") e nao sobre a forma do texto.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CI = '.github/workflows/ci.yml';
const ci = readFileSync(join(RAIZ, CI), 'utf8');

const STEP = ' {6}- name:';
const PROP = ' {8}';

/**
 * Contexto de um run. `resultado` e' o veredito dos passos anteriores do job
 * ('success' = PR verde), do qual dependem `success()`/`failure()`.
 */
function contexto({ evento, ref = 'refs/heads/main', resultado = 'success' }) {
  return {
    'github.event_name': evento,
    'github.ref': ref,
    'github.ref_name': ref.replace(/^refs\/heads\//u, ''),
    always: true,
    success: resultado === 'success',
    failure: resultado === 'failure',
    cancelled: resultado === 'cancelled',
  };
}

const CENARIOS = {
  prVerde: contexto({ evento: 'pull_request', ref: 'refs/pull/12/merge' }),
  prVermelho: contexto({ evento: 'pull_request', ref: 'refs/pull/12/merge', resultado: 'failure' }),
  filaDeMerge: contexto({ evento: 'merge_group', ref: 'refs/heads/gh-readonly-queue/main/pr-12-abc' }),
  pushMain: contexto({ evento: 'push', ref: 'refs/heads/main' }),
  pushMainVermelho: contexto({ evento: 'push', ref: 'refs/heads/main', resultado: 'failure' }),
  pushOutraBranch: contexto({ evento: 'push', ref: 'refs/heads/feat/algo' }),
  dispatch: contexto({ evento: 'workflow_dispatch', ref: 'refs/heads/main' }),
  cancelado: contexto({ evento: 'pull_request', ref: 'refs/pull/12/merge', resultado: 'cancelled' }),
};

const TOKEN = /==|!=|&&|\|\||[!()]|'[^']*'|[A-Za-z_][\w.]*\(\s*\)|[A-Za-z_][\w.]*/gu;

/**
 * Avalia a expressao de `if:` do Actions. Suporta `!`, `&&`, `||`, parenteses,
 * comparacoes `==`/`!=` com literal entre aspas e as funcoes de status
 * (`always()`, `success()`, `failure()`, `cancelled()`). Qualquer coisa fora
 * dessa gramatica LANCA: guard novo no workflow tem de ser revisto aqui em vez
 * de passar em silencio com o teste sem entender a condicao.
 */
function avaliar(expr, ctx) {
  const tokens = expr.match(TOKEN);
  assert.ok(tokens && tokens.length > 0, `expressao de \`if:\` vazia: "${expr}"`);
  let i = 0;
  const espiar = () => tokens[i];
  const consumir = () => {
    const t = tokens[i];
    i += 1;
    return t;
  };
  const operando = () => {
    const t = consumir();
    if (t === undefined) throw new Error(`expressao incompleta em "${expr}"`);
    if (/^'.*'$/u.test(t)) return t.slice(1, -1);
    if (/\(\s*\)$/u.test(t)) {
      const nome = t.replace(/\(\s*\)$/u, '');
      if (!(nome in ctx)) throw new Error(`funcao desconhecida em "${expr}": ${t}`);
      return ctx[nome];
    }
    if (!(t in ctx)) throw new Error(`contexto sem "${t}" (expressao "${expr}")`);
    return ctx[t];
  };
  function primario() {
    if (espiar() === '(') {
      consumir();
      const v = disjuncao();
      if (consumir() !== ')') throw new Error(`falta ")" em "${expr}"`);
      return v;
    }
    const esquerda = operando();
    const op = espiar();
    if (op === '==' || op === '!=') {
      consumir();
      const direita = operando();
      return op === '==' ? esquerda === direita : esquerda !== direita;
    }
    if (typeof esquerda !== 'boolean') throw new Error(`operando nao booleano em "${expr}"`);
    return esquerda;
  }
  function negacao() {
    if (espiar() === '!') {
      consumir();
      return !negacao();
    }
    return primario();
  }
  function conjuncao() {
    let v = negacao();
    while (espiar() === '&&') {
      consumir();
      const direita = negacao();
      v = v && direita;
    }
    return v;
  }
  function disjuncao() {
    let v = conjuncao();
    while (espiar() === '||') {
      consumir();
      const direita = conjuncao();
      v = v || direita;
    }
    return v;
  }
  const resultado = disjuncao();
  if (i !== tokens.length) {
    throw new Error(`sobrou token em "${expr}": ${tokens.slice(i).join(' ')}`);
  }
  return resultado;
}

/** Bloco do step cujo `name:` contem o marcador (o item da lista vai ate' o proximo). */
function blocoStep(marcador) {
  const inicio = ci.indexOf(marcador);
  assert.ok(inicio >= 0, `step "${marcador}" nao encontrado em ${CI}`);
  const resto = ci.slice(inicio);
  const fim = resto.search(new RegExp(`\\n${STEP}`, 'u'));
  return fim >= 0 ? resto.slice(0, fim) : resto;
}

/** Expressao do `if:` no nivel do step (8 espacos), ou `null` quando nao ha. */
function ifDoBloco(bloco) {
  const m = new RegExp(`^${PROP}if:\\s*(.+?)\\s*$`, 'mu').exec(bloco);
  return m ? m[1] : null;
}

/** Dias de retencao declarados pelo upload do bloco. */
function retencao(bloco) {
  const m = /^\s*retention-days:\s*(\d+)\s*$/mu.exec(bloco);
  assert.ok(m, `o upload precisa declarar retention-days (bloco: ${bloco.split('\n')[0]})`);
  return Number(m[1]);
}

/** O upload do marcador, com o bloco e a condicao avaliada. */
function upload(marcador) {
  const bloco = blocoStep(marcador);
  assert.match(bloco, /uses:\s*actions\/upload-artifact@/u, `"${marcador}" tem de ser um upload-artifact`);
  const expr = ifDoBloco(bloco);
  assert.ok(expr, `"${marcador}" precisa declarar \`if:\` no nivel do step (sem guard ele roda em PR)`);
  return { bloco, expr, rodaEm: (ctx) => avaliar(expr, ctx) };
}

/** Todo upload-artifact do `ci.yml`; sem `if:` o guard implicito e' `success()`. */
function todosOsUploads() {
  return ci
    .split(new RegExp(`\\n(?=${STEP})`, 'u'))
    .filter((bloco) => /uses:\s*actions\/upload-artifact@/u.test(bloco))
    .map((bloco) => ({
      nome: new RegExp(`- name:\\s*(.+?)\\s*$`, 'mu').exec(bloco)[1],
      expr: ifDoBloco(bloco) ?? 'success()',
    }));
}

const esperados = [
  ['PR verde', CENARIOS.prVerde, false],
  ['PR vermelho', CENARIOS.prVermelho, false],
  ['fila de merge', CENARIOS.filaDeMerge, false],
  ['push na main (deploy e da Vercel)', CENARIOS.pushMain, false],
];

test('E72: `dist` so sai em workflow_dispatch', () => {
  const { expr, rodaEm, bloco } = upload('Upload build artifacts');
  for (const [nome, ctx, esperado] of esperados) {
    assert.equal(rodaEm(ctx), esperado, `${nome} nao pode publicar dist (if: ${expr})`);
  }
  assert.equal(rodaEm(CENARIOS.dispatch), true, `dispatch manual publica o dist (if: ${expr})`);
  assert.equal(retencao(bloco), 3);
});

test('E72: `coverage-report` so na main (push), com 7 dias', () => {
  const { expr, rodaEm, bloco } = upload('Upload coverage report');
  assert.equal(rodaEm(CENARIOS.prVerde), false, `PR nao consome cobertura (if: ${expr})`);
  assert.equal(rodaEm(CENARIOS.prVermelho), false, `PR vermelho tambem nao publica cobertura (if: ${expr})`);
  assert.equal(rodaEm(CENARIOS.pushOutraBranch), false, `so a main publica cobertura (if: ${expr})`);
  assert.equal(rodaEm(CENARIOS.dispatch), false, `dispatch tem de continuar sem artifact (if: ${expr})`);
  assert.equal(rodaEm(CENARIOS.pushMain), true, `a main publica a cobertura (if: ${expr})`);
  // `always()` combinado com os filtros mantem o upload quando a suite falha na
  // main — que e' justamente quando a cobertura serve para diagnosticar.
  assert.equal(rodaEm(CENARIOS.pushMainVermelho), true, `suite vermelha na main ainda publica (if: ${expr})`);
  assert.equal(retencao(bloco), 7);
});

test('E72: `playwright-report` so quando o E2E falha', () => {
  const { expr, rodaEm, bloco } = upload('Upload Playwright report');
  for (const [nome, ctx] of [['PR verde', CENARIOS.prVerde], ['push na main verde', CENARIOS.pushMain]]) {
    assert.equal(rodaEm(ctx), false, `${nome} nao pode publicar o report (if: ${expr})`);
  }
  assert.equal(rodaEm(CENARIOS.prVermelho), true, `falha publica o report (if: ${expr})`);
  assert.equal(rodaEm(CENARIOS.pushMainVermelho), true, `falha na main publica o report (if: ${expr})`);
  assert.equal(rodaEm(CENARIOS.cancelado), false, `run cancelado nao publica report (if: ${expr})`);
  assert.equal(retencao(bloco), 3);
});

test('E72: PR verde cria 0 artifacts (a verificacao escrita no plano)', () => {
  const uploads = todosOsUploads();
  assert.ok(uploads.length >= 3, `esperava os 3 uploads do ci.yml, achei ${uploads.length}`);
  const ligados = uploads.filter(({ expr }) => avaliar(expr, CENARIOS.prVerde));
  assert.deepEqual(
    ligados.map(({ nome }) => nome),
    [],
    'nenhum upload-artifact pode rodar num PR verde',
  );
});
