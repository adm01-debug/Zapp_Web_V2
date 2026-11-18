// `.rpc()` guardado numa variavel era invisivel para o guard.
//
// `src/hooks/integrations/useTalkXTemplateStats.ts` faz
// `const rpc = supabase.rpc.bind(supabase) as unknown as PendingDatabaseRpc` e chama
// `rpc('talkx_template_library_stats', {...})`. Sem `.rpc(` literal, a varredura do
// guard nao via alvo nenhum: as duas RPCs chegaram a producao sem existir no banco
// (404 no `POST /rest/v1/rpc/...`, faixa de KPIs da tela 04 e card "Desempenho deste
// template" da tela 05 em erro) e o guard seguia dizendo "novas: 0".
//
// O que este teste trava:
// 1. alias de `.rpc` detectado e o alvo da chamada registrado;
// 2. `.rpc('x')` literal continua detectado, e sem contar duas vezes quando o alias
//    tambem se chama `rpc`;
// 3. alias vindo de cliente que NAO e o principal nao vira alvo do catalogo public;
// 4. `.from('t')` segue detectado, com o schema de `.schema(...)` quando houver.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectarAlvos, aliasesDeRpc } from './supabase-usage-guard.mjs';

test('alias de .rpc e detectado e o alvo da chamada entra', () => {
  const src = [
    'const rpc = supabase.rpc.bind(supabase) as unknown as PendingDatabaseRpc;',
    "const { data } = await rpc('talkx_template_library_stats', { p_days: 30, p_top: 3 });",
  ].join('\n');

  assert.deepEqual([...aliasesDeRpc(src)], ['rpc']);
  const alvos = detectarAlvos(src, 'hook.ts');
  assert.deepEqual(alvos, [
    { kind: 'rpc', schema: 'public', name: 'talkx_template_library_stats', file: 'hook.ts', line: 2 },
  ]);
});

test('atribuicao direta (sem bind) tambem conta como alias', () => {
  const src = ["const chamar = supabase.rpc;", "await chamar('minha_fn', {});"].join('\n');
  assert.deepEqual([...aliasesDeRpc(src)], ['chamar']);
  assert.equal(detectarAlvos(src, 'a.ts')[0].name, 'minha_fn');
});

test('.rpc() literal continua detectado, uma vez so', () => {
  const src = [
    'const rpc = supabase.rpc.bind(supabase);',
    "await supabase.rpc('fn_literal', {});",
  ].join('\n');
  const alvos = detectarAlvos(src, 'b.ts');
  assert.equal(alvos.length, 1, 'o detector literal e o do alias nao podem contar o mesmo alvo duas vezes');
  assert.equal(alvos[0].name, 'fn_literal');
});

test('alias de cliente que nao e o principal nao vira alvo do catalogo public', () => {
  for (const cliente of ['externalSupabase', 'clientesSupabase', 'extClient', 'externalClient']) {
    const src = [`const rpc = ${cliente}.rpc;`, "await rpc('fn_de_fora', {});"].join('\n');
    assert.deepEqual([...aliasesDeRpc(src)], [], `${cliente} nao deveria virar alias do cliente principal`);
    assert.deepEqual(detectarAlvos(src, 'c.ts'), [], `${cliente} nao deveria produzir alvo`);
  }
});

test('.from() segue detectado, com o schema explicito quando houver', () => {
  const src = "await supabase.from('contacts').select('id');\nawait supabase.schema('ops').from('jobs').select('id');";
  const alvos = detectarAlvos(src, 'd.ts');
  assert.deepEqual(
    alvos.map((a) => `${a.kind}:${a.schema}.${a.name}`),
    ['from:public.contacts', 'from:ops.jobs'],
  );
});

test('chamada de funcao homonima sem alias declarado nao inventa alvo', () => {
  // `rpc(...)` sem a declaracao do alias no mesmo arquivo nao pode ser lido como RPC:
  // o padrao exige a atribuicao a partir de `.rpc`.
  const src = "await rpc('nao_eh_alvo', {});";
  assert.deepEqual([...aliasesDeRpc(src)], []);
  assert.deepEqual(detectarAlvos(src, 'e.ts'), []);
});
