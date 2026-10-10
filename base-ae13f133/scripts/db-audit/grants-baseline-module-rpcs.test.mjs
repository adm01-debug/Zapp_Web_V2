import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// E77 - contrato de grants das RPCs do modulo de busca/mapa.
//
// Regra: nenhuma destas RPCs pode ter EXECUTE para `anon`. Como `anon` herda
// PUBLIC implicitamente, `has_function_privilege('anon', ...)` (a consulta que
// gera o baseline) ja devolve true para grant via PUBLIC — ou seja, "ausente de
// anon_execute" == "sem anon E sem PUBLIC". Este teste e a versao offline e
// executavel do assert que o E77 pede contra o grants-baseline.json existente;
// `anon_execute` e a fonte autoritativa (snapshot do banco), regenerada pelo
// workflow types-sync e diffada por check-grants-fresh.mjs.
//
// `count_searchbox_cost_guard_this_month` entrou na lista do plano (E77), mas NAO existe e foi
// dispensada pela decisao do E47 (marca do mes em localStorage, sem DDL nova).
// NAO existe: a decisao registrada em E47 (2026-10-01) escolheu a alternativa
// (2) — marca do mes em `localStorage`, sem DDL nova. A funcao fica na lista
// como guarda preventiva: se um dia nascer, nasce sem anon/PUBLIC.
const RPCS_MODULO = [
  'search_contacts',
  'count_searchbox_sessions_this_month',
];

// RPCs da lista acima que existem de fato nas migrations (a RPC de sessao do
// E47 e a busca de contatos). A terceira nao existe por decisao registrada.
const RPCS_EXISTENTES = [
  'count_searchbox_sessions_this_month',
  'search_contacts',
];

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINE = path.join(RAIZ, 'scripts/db-audit/grants-baseline.json');
const GERADOR = path.join(RAIZ, 'scripts/db-audit/grants-baseline.sql');
const MIGRATIONS = path.join(RAIZ, 'supabase/migrations');

const lerJson = (arquivo) => JSON.parse(fs.readFileSync(arquivo, 'utf8'));

// Mesma normalizacao do gerador: `nome(args)`. Casa `search_contacts(...)` sem
// casar `search_contacts_advanced(...)` (o `(` precisa vir logo apos o nome).
const entradaEhDaRpc = (entrada, nomeRpc) => entrada.startsWith(`${nomeRpc}(`);

const grantAnonDe = (anonExecute, nomeRpc) =>
  (anonExecute ?? []).find((entrada) => entradaEhDaRpc(entrada, nomeRpc));

test('baseline de grants tem o formato minimo esperado (anon_execute e array de strings)', () => {
  const baseline = lerJson(BASELINE);
  assert.ok(Array.isArray(baseline.anon_execute), 'anon_execute ausente ou nao e array');
  assert.ok(
    baseline.anon_execute.every((entrada) => typeof entrada === 'string'),
    'anon_execute tem entrada nao-string',
  );
});

test('matcher casa a RPC exata e ignora prefixo parecido (nao e vacuo)', () => {
  assert.ok(entradaEhDaRpc('count_searchbox_sessions_this_month()', 'count_searchbox_sessions_this_month'));
  assert.ok(entradaEhDaRpc('search_contacts(text, integer)', 'search_contacts'));
  assert.ok(!entradaEhDaRpc('search_contacts_advanced(text)', 'search_contacts'));
  assert.ok(!entradaEhDaRpc('count_searchbox_sessions_this_month_extra()', 'count_searchbox_sessions_this_month'));
});

for (const nomeRpc of RPCS_MODULO) {
  test(`nenhuma RPC do modulo concede EXECUTE a anon: ${nomeRpc}`, () => {
    const baseline = lerJson(BASELINE);
    const achado = grantAnonDe(baseline.anon_execute, nomeRpc);
    assert.equal(
      achado,
      undefined,
      `${nomeRpc} aparece em anon_execute (${achado}) — nao pode ter EXECUTE para anon nem PUBLIC`,
    );
  });
}

test('o gerador consulta has_function_privilege(anon), entao anon_execute cobre grant via PUBLIC', () => {
  const sql = fs.readFileSync(GERADOR, 'utf8');
  assert.match(sql, /has_function_privilege\('anon'/);
});

test('as RPCs existentes do modulo tem REVOKE ... anon nas migrations (guarda de fonte)', () => {
  const arquivos = fs
    .readdirSync(MIGRATIONS)
    .filter((nome) => nome.endsWith('.sql'))
    .map((nome) => fs.readFileSync(path.join(MIGRATIONS, nome), 'utf8').split('\n'));
  for (const nomeRpc of RPCS_EXISTENTES) {
    const alvo = `public.${nomeRpc}(`;
    const revoke = arquivos.find((linhas) => linhas.some((linha) => linha.includes(alvo)
      && /REVOKE/i.test(linha)
      && /\banon\b/i.test(linha)));
    assert.ok(revoke, `nenhuma migration faz REVOKE ... anon em ${alvo}...)`);
  }
});
