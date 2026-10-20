/**
 * BLOCO E (F46+F47) — testes de `audience.select`.
 *
 * Cobre as regras que o plano exige, SEM rede: a ponte Singu e injetada
 * (`AudienceSource`) e o escopo e injetado (`deps.scope`), entao nenhum duble
 * toca o Singu nem o banco canonico.
 *
 *   F46 — (manual ∪ publicos aplicados) ∩ filtros − exclusoes, resolvido no
 *         servidor; EXCLUSAO VENCE INCLUSAO (reaplicar o publico nao revive o
 *         excluido); modo "contato principal por empresa" = 1 por empresa
 *         quando ha dado e SINALIZA quando nao ha.
 *   F47 — "selecionar todos os N" materializa via count + resolve paginado; o
 *         unico teto e o de politica (F17), SEMPRE nomeado. 5.001 volta integro
 *         ou vira `over_policy_limit` explicito com {count, limit} — nunca 500
 *         generico.
 */

import {
  AUDIENCE_SIGNAL_PRIMARY_NOT_DETERMINABLE,
  type AudienceSelectDeps,
  type AudienceSource,
  handleAudienceSelect,
  materializeFilteredCompanyIds,
  MULTIPLIX_OVER_POLICY_LIMIT,
  RESOLVE_POLICY_MAX_IDS,
  type ActionContext,
} from '../audience.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const uuidFalso = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => uuidFalso(from + i));

type Row = Record<string, unknown>;

function makeCtx(payload: Record<string, unknown>): ActionContext {
  const req = new Request('https://zapp-web-v2.vercel.app/functions/v1/multiplix-dispatch', {
    method: 'POST',
    headers: { origin: 'https://zapp-web-v2.vercel.app', 'content-type': 'application/json' },
  });
  return {
    action: 'audience.select',
    payload,
    userId: 'user-1',
    correlationId: 'corr-1',
    req,
    // Nunca usado: os testes injetam `scope` e `source`; o handler nao toca o
    // banco canonico nem o Singu nesta suite.
    supabase: {} as unknown as ActionContext['supabase'],
  };
}

function scopeDeps(source: AudienceSource, extra?: Partial<AudienceSelectDeps>): AudienceSelectDeps {
  return { scope: { permissions: ['admin'], vendedorEmail: null }, source, ...extra };
}

// ---------------------------------------------------------------------------
// F46 — conjunto final, exclusao vence inclusao.
// ---------------------------------------------------------------------------

Deno.test('F46: exclusão manual vence a inclusão e reaplicar o público não a revive', async () => {
  const X = uuidFalso(1);
  const Y = uuidFalso(2);
  const chamadas: Array<{ company_ids: string[]; contact_ids: string[] }> = [];

  const source: AudienceSource = {
    listFilteredCompanyIds: () => Promise.resolve({ companyIds: [], count: 0 }),
    // Adversario de proposito: devolve X mesmo com X excluido, para provar que a
    // exclusao tambem e aplicada DEPOIS do resolve (defesa em profundidade).
    resolveRecipients: (companyIds, contactIds) => {
      chamadas.push({ company_ids: companyIds, contact_ids: contactIds });
      const rows: Row[] = [X, Y].map((id) => ({ company_id: id, contact_id: null, company_name: `Empresa ${id}`, elegibilidade: 'apto' }));
      return Promise.resolve(rows);
    },
  };

  const payload = {
    manual: { company_ids: [X] },
    publics: [{ company_ids: [X, Y] }],
    exclude: { company_ids: [X] },
  };

  const res = await handleAudienceSelect(makeCtx(payload), scopeDeps(source));
  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const body = await res.json();
  const finais: string[] = body.data.recipients.map((r: Row) => r.company_id);

  assert(!finais.includes(X), `o excluído ${X} não pode aparecer no conjunto final: ${finais.join(',')}`);
  assert(finais.includes(Y), `o incluído ${Y} deveria permanecer: ${finais.join(',')}`);
  // Exclusao aplicada ANTES do resolve: X nem chegou a ser pedido.
  assert(
    chamadas.length === 1 && !chamadas[0].company_ids.includes(X),
    `X não deveria ser resolvido (exclusão antes da ponte): ${JSON.stringify(chamadas)}`,
  );

  // "Reaplicar o público": mesmo payload, mesmo publico aplicado, N vezes.
  const res2 = await handleAudienceSelect(makeCtx(payload), scopeDeps(source));
  const body2 = await res2.json();
  const finais2: string[] = body2.data.recipients.map((r: Row) => r.company_id);
  assert(!finais2.includes(X), `reaplicar o público reviveu o excluído ${X}: ${finais2.join(',')}`);
});

Deno.test('F46: exclusão de contato também vence a inclusão do contato', async () => {
  const C = uuidFalso(5);
  const D = uuidFalso(6);
  const source: AudienceSource = {
    listFilteredCompanyIds: () => Promise.resolve({ companyIds: [], count: 0 }),
    resolveRecipients: () =>
      Promise.resolve([
        { company_id: uuidFalso(50), contact_id: C, elegibilidade: 'apto' },
        { company_id: uuidFalso(51), contact_id: D, elegibilidade: 'apto' },
      ]),
  };
  const res = await handleAudienceSelect(
    makeCtx({ manual: { contact_ids: [C, D] }, exclude: { contact_ids: [C] } }),
    scopeDeps(source),
  );
  const body = await res.json();
  const contatos: Array<string | null> = body.data.recipients.map((r: Row) => r.contact_id);
  assert(!contatos.includes(C), `contato excluído ${C} não pode aparecer: ${contatos.join(',')}`);
  assert(contatos.includes(D), `contato incluído ${D} deveria permanecer: ${contatos.join(',')}`);
});

// ---------------------------------------------------------------------------
// F46 — modo "contato principal por empresa".
// ---------------------------------------------------------------------------

Deno.test('F46: modo "principal por empresa" = 1 por empresa com dado e sinaliza sem dado', async () => {
  const A = uuidFalso(10);
  const B = uuidFalso(11);
  const aPrimario = uuidFalso(100);
  const aOutro = uuidFalso(101);
  const b1 = uuidFalso(102);
  const b2 = uuidFalso(103);

  const source: AudienceSource = {
    listFilteredCompanyIds: () => Promise.resolve({ companyIds: [], count: 0 }),
    resolveRecipients: () =>
      Promise.resolve([
        { company_id: A, contact_id: aPrimario, elegibilidade: 'apto', contact_phone_is_primary: true, contact_role: 'gerente' },
        { company_id: A, contact_id: aOutro, elegibilidade: 'apto', contact_phone_is_primary: false, contact_role: null },
        { company_id: B, contact_id: b1, elegibilidade: 'apto', contact_phone_is_primary: false, contact_role: null },
        { company_id: B, contact_id: b2, elegibilidade: 'apto', contact_phone_is_primary: false, contact_role: null },
      ]),
  };

  const ligado = await handleAudienceSelect(
    makeCtx({ manual: { company_ids: [A, B] }, primary_per_company: true }),
    scopeDeps(source),
  );
  const ligadoBody = await ligado.json();
  const recip: Row[] = ligadoBody.data.recipients;
  assert(recip.length === 2, `modo ligado exige no máximo 1 por empresa; veio ${recip.length}`);

  const porEmpresa = new Map(recip.map((r) => [String(r.company_id), r]));
  assert(
    porEmpresa.get(A)?.contact_id === aPrimario,
    `A deveria escolher o contato com telefone primário; veio ${String(porEmpresa.get(A)?.contact_id)}`,
  );
  assert(porEmpresa.get(B) !== undefined, 'B deveria manter exatamente 1 destinatário');

  const sinais: Array<{ company_id: string; code: string }> = ligadoBody.data.signals;
  assert(
    sinais.some((s) => s.company_id === B && s.code === AUDIENCE_SIGNAL_PRIMARY_NOT_DETERMINABLE),
    `B não tinha dado para eleger o principal e deveria sinalizar: ${JSON.stringify(sinais)}`,
  );
  assert(!sinais.some((s) => s.company_id === A), 'A tem dado; não pode sinalizar');

  // Desligado: nada é descartado (o comportamento é o que a ponte devolveu).
  const desligado = await handleAudienceSelect(
    makeCtx({ manual: { company_ids: [A, B] }, primary_per_company: false }),
    scopeDeps(source),
  );
  const desligadoBody = await desligado.json();
  assert(
    desligadoBody.data.recipients.length === 4,
    `modo desligado deveria manter as 4 linhas, veio ${desligadoBody.data.recipients.length}`,
  );
});

// ---------------------------------------------------------------------------
// F47 — "selecionar todos os N": materializa íntegro ou erra pelo teto NOMEADO.
// ---------------------------------------------------------------------------

Deno.test('F47: 5.001 selecionados voltam íntegros (count + resolve paginado)', async () => {
  const N = 5_001;
  const todos = ids(N, 1_000);
  let paginasResolvidas = 0;
  const source: AudienceSource = {
    listFilteredCompanyIds: () => Promise.resolve({ companyIds: todos, count: N }),
    resolveRecipients: (companyIds) => {
      paginasResolvidas++;
      return Promise.resolve(companyIds.map((id) => ({ company_id: id, elegibilidade: 'apto' })));
    },
  };

  const res = await handleAudienceSelect(
    makeCtx({ select_all: true, filters: { uf: 'SP' } }),
    scopeDeps(source),
  );
  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const body = await res.json();
  assert(body.data.recipients.length === N, `esperava ${N} destinatários íntegros, veio ${body.data.recipients.length}`);
  assert(body.data.count === N, `o N do servidor deveria ser ${N}, veio ${body.data.count}`);
  assert(paginasResolvidas === 1, `a ponte deveria ser consultada 1x neste duble, veio ${paginasResolvidas}`);
});

Deno.test('F47: 10.001 → over_policy_limit NOMEADO com {count, limit}, nunca 500', async () => {
  const count = RESOLVE_POLICY_MAX_IDS + 1;
  let resolveChamado = 0;
  const source: AudienceSource = {
    // Acima do teto a ponte devolve a contagem e nenhum id (nao pagina o que vai recusar).
    listFilteredCompanyIds: () => Promise.resolve({ companyIds: [], count }),
    resolveRecipients: () => {
      resolveChamado++;
      return Promise.resolve([]);
    },
  };

  const res = await handleAudienceSelect(
    makeCtx({ select_all: true, filters: { uf: 'SP' } }),
    scopeDeps(source),
  );
  assert(res.status === 400, `esperava 400 nomeado (nunca 500), veio ${res.status}`);
  const body = await res.json();
  assert(
    body.error === MULTIPLIX_OVER_POLICY_LIMIT,
    `erro deveria ser ${MULTIPLIX_OVER_POLICY_LIMIT}, veio ${JSON.stringify(body)}`,
  );
  assert(body.count === count, `count do erro deveria ser ${count}, veio ${body.count}`);
  assert(body.limit === RESOLVE_POLICY_MAX_IDS, `limit do erro deveria ser ${RESOLVE_POLICY_MAX_IDS}, veio ${body.limit}`);
  assert(resolveChamado === 0, `não deveria resolver acima do teto, houve ${resolveChamado} chamada(s)`);
});

Deno.test('F47: no teto exato (10.000) ainda materializa — o teto é de política, não um corte', async () => {
  const N = RESOLVE_POLICY_MAX_IDS;
  const todos = ids(N, 0);
  const source: AudienceSource = {
    listFilteredCompanyIds: () => Promise.resolve({ companyIds: todos, count: N }),
    resolveRecipients: (companyIds) => Promise.resolve(companyIds.map((id) => ({ company_id: id, elegibilidade: 'apto' }))),
  };
  const res = await handleAudienceSelect(
    makeCtx({ select_all: true, filters: { uf: 'MG' } }),
    scopeDeps(source),
  );
  assert(res.status === 200, `no teto exato ainda deve responder 200, veio ${res.status}`);
  const body = await res.json();
  assert(body.data.recipients.length === N, `no teto exato deveria vir integro (${N}), veio ${body.data.recipients.length}`);
});

Deno.test('F47: payload inválido responde 400 nomeado, não 500', async () => {
  const source: AudienceSource = {
    listFilteredCompanyIds: () => Promise.resolve({ companyIds: [], count: 0 }),
    resolveRecipients: () => Promise.resolve([]),
  };
  const res = await handleAudienceSelect(
    makeCtx({ manual: { company_ids: ['nao-e-uuid'] } }),
    scopeDeps(source),
  );
  const status: number = res.status;
  assert(status === 400, `esperava 400 de payload, veio ${status}`);
  assert(status < 500, 'payload inválido nunca vira 500');
});

// ---------------------------------------------------------------------------
// F47 — a paginação da materialização (extraída do cliente real, sem rede).
// ---------------------------------------------------------------------------

Deno.test('F47: materializar 5.001 pagina de 200 em 200 e não perde ninguém', async () => {
  const N = 5_001;
  const todos = ids(N, 1_000);
  const paginas: number[] = [];
  const resultado = await materializeFilteredCompanyIds(
    () => Promise.resolve(N),
    (page, pageSize) => {
      paginas.push(pageSize);
      return Promise.resolve(todos.slice(page * pageSize, page * pageSize + pageSize).map((id) => ({ company_id: id })));
    },
  );
  assert(resultado.count === N, `count deveria ser ${N}, veio ${resultado.count}`);
  assert(resultado.companyIds.length === N, `deveria materializar ${N} ids, veio ${resultado.companyIds.length}`);
  // 5001 = 25 páginas cheias (5000) + 1 página de 1.
  assert(paginas.length === 26, `esperava 26 páginas, veio ${paginas.length}`);
  assert(
    paginas.every((size) => size === 200),
    `page_size deveria ser 200 em todas as páginas: ${paginas.join(',')}`,
  );
  assert(resultado.companyIds[N - 1] === todos[N - 1], 'o último id não chegou');
});

Deno.test('F47: acima do teto a materialização nem pagina (devolve só o count)', async () => {
  const N = RESOLVE_POLICY_MAX_IDS + 1;
  let paginasChamadas = 0;
  const resultado = await materializeFilteredCompanyIds(
    () => Promise.resolve(N),
    () => {
      paginasChamadas++;
      return Promise.resolve([]);
    },
  );
  assert(resultado.count === N, `count deveria ser ${N}, veio ${resultado.count}`);
  assert(resultado.companyIds.length === 0, `acima do teto não deveria materializar ids, veio ${resultado.companyIds.length}`);
  assert(paginasChamadas === 0, `não deveria paginar acima do teto, houve ${paginasChamadas} página(s)`);
});
