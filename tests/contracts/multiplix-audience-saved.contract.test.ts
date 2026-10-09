/**
 * NOME: nasceu como `tests/contracts/multiplix-dispatch.contract.test.ts`, mas no
 * rebase sobre a dia de 09/10 esse nome já estava ocupado por OUTRO cartão (F54/
 * TL-030, contrato integrado do despacho — prévia × motor de envio), arquivo
 * distinto com o mesmo nome por convenção. Renomeado para
 * `multiplix-audience-saved.contract.test.ts` para não colidir; os dois contratos
 * continuam existindo e rodando (o runner de `tests/contracts/*.contract.test.ts`
 * descobre por sufixo, não por nome fixo).
 *
 * F75 (parte de edge do TL-041) — CONTRATO dos publicos SALVOS do Multiplix.
 *
 * A carteira: o navegador manda INTENCAO de publico, nunca a lista pronta. Este
 * contrato prova, contra o handler REAL (nao contra um literal montado aqui):
 *
 *   (a) `audience.save`/`audience.apply` estao LIGADOS no roteador (a fonte e a
 *       prova estrutural);
 *   (b) `audience.save` RECUSA payload invalido com 400 nomeado (kind/schema
 *       `.strict()`) e grava `rule` (so a regra) ou `static_list` (membros),
 *       passando o dono canonico (`profiles.id`) — nunca o `auth.uid` cru;
 *   (c) `audience.apply` aplica o publico SALVO reaproveitando o MESMO nucleo do
 *       `audience.select`, e a EXCLUSAO VENCE A INCLUSAO (inclusive a defesa
 *       pos-resolve: um publico reaplicado nao revive o excluido);
 *   (d) o retorno diferencia `eligible_count`, `dropped_out_of_filter` e
 *       `excluded_removed` sem expor dado sensivel na resposta;
 *   (e) publico inexistente e publico de outro dono respondem IGUAL (404 nomeado);
 *   (f) falha do store vira 502 NOMEADO, nunca 500 generico.
 *
 * Por que o `vi.mock`: o modulo importa o SDK por URL do esm.sh (runtime Deno) e o
 * vite-node (Node) nao resolve `https://`. O mock substitui o SDK ANTES do import
 * — mesma tecnica do `crm-sentiment-boundary.contract.test.ts`. `Deno` nao e
 * tocado na importacao, entao o modulo carrega sob Node sem rede.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('https://esm.sh/@supabase/supabase-js@2.87.1', () => ({
  createClient: () => ({ rpc: async () => ({ data: null, error: null }) }),
}));

const {
  handleAudienceApply,
  handleAudienceSave,
  handleAudienceSelect,
  MULTIPLIX_AUDIENCE_NOT_FOUND,
  MULTIPLIX_AUDIENCE_SAVE_FAILED,
} = await import('../../supabase/functions/multiplix-dispatch/actions/audience.ts');

const ROOT = resolve(__dirname, '../..');
const INDEX_SRC = readFileSync(resolve(ROOT, 'supabase/functions/multiplix-dispatch/index.ts'), 'utf8');

type Row = Record<string, unknown>;

const uuid = (i: number): string => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const PROFILE = uuid(900);
const AUDIENCE = uuid(901);
const AUDIENCE_RULE = uuid(902);
const X = uuid(1);
const Y = uuid(2);
const Z = uuid(3);
const OUT_OF_FILTER = uuid(4);

interface SavedAudienceFixture {
  id: string;
  name: string;
  kind: 'rule' | 'static_list';
  filters: Record<string, unknown> | null;
  company_ids: string[];
  contact_ids: string[];
}

/** Erro INTERNO lancado por `insertSavedMembers` — jamais pode vazar ao cliente. */
const INTERNAL_MEMBER_ERROR =
  'INTERNAL_DB_DETAIL: relation "multiplix_audience_members" does not exist';

function makeStore(
  audiences: Record<string, SavedAudienceFixture>,
  opts: { staff?: boolean; profileId?: string | null; insertFails?: boolean; membersFail?: boolean } = {},
) {
  const calls = {
    inserted: [] as Array<Record<string, unknown>>,
    members: [] as Array<{ audienceId: string; companyIds: string[]; contactIds: string[] }>,
    loads: [] as Array<{ id: string; viewer: string }>,
    deletes: [] as Array<{ id: string; ownerId: string }>,
  };
  const store = {
    resolveProfileId: async () => (opts.profileId === undefined ? PROFILE : opts.profileId),
    isStaff: async () => opts.staff !== false,
    loadSavedAudience: async (id: string, viewer: string) => {
      calls.loads.push({ id, viewer });
      return audiences[id] ?? null;
    },
    insertSavedAudience: async (input: Record<string, unknown>, ownerId: string) => {
      if (opts.insertFails) throw new Error('multiplix_audience_store_failed: insert failed');
      calls.inserted.push({ ...input, owner_id: ownerId });
      return { id: AUDIENCE };
    },
    insertSavedMembers: async (audienceId: string, companyIds: string[], contactIds: string[]) => {
      if (opts.membersFail) throw new Error(INTERNAL_MEMBER_ERROR);
      calls.members.push({ audienceId, companyIds, contactIds });
    },
    // Compensacao: registra a chamada para provar id + dono (escopo por owner).
    deleteSavedAudience: async (id: string, ownerId: string) => {
      calls.deletes.push({ id, ownerId });
    },
  };
  return { store, calls };
}

/** Fonte Singu falsa: materializa filtros e resolve ids em linhas. */
function makeSource(
  rows: Row[],
  filtered: { companyIds: string[]; count: number } = { companyIds: [], count: 0 },
  extra: Row[] = [],
) {
  const seen = { resolve: [] as Array<{ companies: string[]; contacts: string[] }> };
  const source = {
    listFilteredCompanyIds: async () => filtered,
    resolveRecipients: async (companyIds: string[], contactIds: string[]) => {
      seen.resolve.push({ companies: companyIds, contacts: contactIds });
      const wanted = new Set([...companyIds, ...contactIds]);
      const matched = rows.filter((row) => wanted.has(String(row.company_id)) || wanted.has(String(row.contact_id)));
      // `extra` vem SEMPRE: e o adversario que devolve linhas nao pedidas (para
      // provar a defesa POS-resolve contra filtros e exclusoes).
      return [...matched, ...extra];
    },
  };
  return { source, seen };
}

function makeCtx(payload: Record<string, unknown>) {
  const req = new Request('https://zapp-web-v2.vercel.app/functions/v1/multiplix-dispatch', {
    method: 'POST',
    headers: { origin: 'https://zapp-web-v2.vercel.app', 'content-type': 'application/json' },
  });
  return {
    action: 'audience.save',
    payload,
    userId: 'user-1',
    correlationId: 'corr-1',
    req,
    // Nunca tocado: os testes injetam `store`/`scope`; o handler nao chama o banco.
    supabase: {} as never,
  };
}

const SCOPE = { permissions: ['admin'], vendedorEmail: null };

// ---------------------------------------------------------------------------

describe('(a) roteador', () => {
  it('liga audience.save e audience.apply em HANDLERS', () => {
    expect(INDEX_SRC).toContain("'audience.save': handleAudienceSave");
    expect(INDEX_SRC).toContain("'audience.apply': handleAudienceApply");
  });
});

describe('(b) audience.save — validacao e gravacao', () => {
  it('recusa payload invalido com 400 nomeado (kind, schema strict)', async () => {
    const { store } = makeStore({});

    const semRegra = await handleAudienceSave(makeCtx({ name: 'N', kind: 'rule' }) as never, { store } as never);
    expect(semRegra.status).toBe(400);
    expect(String((await semRegra.json()).error)).toContain('audience.save');

    const semMembros = await handleAudienceSave(
      makeCtx({ name: 'N', kind: 'static_list', members: { company_ids: [] } }) as never,
      { store } as never,
    );
    expect(semMembros.status).toBe(400);

    const chaveDesconhecida = await handleAudienceSave(
      makeCtx({ name: 'N', kind: 'static_list', members: { company_ids: [X] }, owner_id: PROFILE }) as never,
      { store } as never,
    );
    expect(chaveDesconhecida.status).toBe(400);

    const kindForaDoCatalogo = await handleAudienceSave(makeCtx({ name: 'N', kind: 'dinamica' }) as never, { store } as never);
    expect(kindForaDoCatalogo.status).toBe(400);
  });

  it('grava rule (so a regra) e static_list (membros), com o dono canonico profiles.id', async () => {
    const { store, calls } = makeStore({});

    const rule = await handleAudienceSave(
      makeCtx({ name: 'Sudeste', kind: 'rule', definition: { uf: 'SP' } }) as never,
      { store } as never,
    );
    expect(rule.status).toBe(200);
    expect((await rule.json()).data).toMatchObject({ id: AUDIENCE, kind: 'rule', member_count: 0 });
    expect(calls.inserted).toHaveLength(1);
    expect(calls.inserted[0]).toMatchObject({ kind: 'rule', filters: { uf: 'SP' }, owner_id: PROFILE });
    expect(calls.members).toHaveLength(0);

    const lista = await handleAudienceSave(
      makeCtx({ name: 'Minha lista', kind: 'static_list', members: { company_ids: [X, Y], contact_ids: [Z] } }) as never,
      { store } as never,
    );
    expect(lista.status).toBe(200);
    expect((await lista.json()).data).toMatchObject({ id: AUDIENCE, kind: 'static_list', member_count: 3 });
    expect(calls.inserted[1]).toMatchObject({ kind: 'static_list', filters: null, owner_id: PROFILE });
    expect(calls.members).toEqual([{ audienceId: AUDIENCE, companyIds: [X, Y], contactIds: [Z] }]);
  });

  it('nega 403 sem staff e sem perfil do JWT', async () => {
    const { store } = makeStore({}, { staff: false });
    const semStaff = await handleAudienceSave(
      makeCtx({ name: 'N', kind: 'rule', definition: { uf: 'SP' } }) as never,
      { store } as never,
    );
    expect(semStaff.status).toBe(403);

    const { store: semPerfil } = makeStore({}, { profileId: null });
    const semDono = await handleAudienceSave(
      makeCtx({ name: 'N', kind: 'rule', definition: { uf: 'SP' } }) as never,
      { store: semPerfil } as never,
    );
    expect(semDono.status).toBe(403);
  });

  it('falha do store vira 502 NOMEADO, nunca 500', async () => {
    const { store } = makeStore({}, { insertFails: true });
    const res = await handleAudienceSave(
      makeCtx({ name: 'N', kind: 'rule', definition: { uf: 'SP' } }) as never,
      { store } as never,
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe(MULTIPLIX_AUDIENCE_SAVE_FAILED);
  });

  it('static_list: falha de insertSavedMembers compensa o publico e nao ecoa o erro interno', async () => {
    const { store, calls } = makeStore({}, { membersFail: true });

    const res = await handleAudienceSave(
      makeCtx({ name: 'Lista', kind: 'static_list', members: { company_ids: [X, Y], contact_ids: [Z] } }) as never,
      { store } as never,
    );

    // (2) resposta publica: 502 com o code NOMEADO.
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe(MULTIPLIX_AUDIENCE_SAVE_FAILED);

    // (4) o texto INTERNO lancado por insertSavedMembers NAO vaza ao cliente.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('INTERNAL_DB_DETAIL');
    expect(raw).not.toContain('multiplix_audience_members');

    // (3) compensacao chamada com o id recem-gravado e o dono canonico (profiles.id).
    // Sem a compensacao `calls.deletes` ficaria vazio — e este caso falha (vermelho).
    expect(calls.inserted).toHaveLength(1);
    expect(calls.deletes).toEqual([{ id: AUDIENCE, ownerId: PROFILE }]);
    // Nenhum membro foi comitado (o insert lancou): a lista esta compensada, nao orfa.
    expect(calls.members).toHaveLength(0);
  });
});

describe('(c/d) audience.apply — publico salvo, contagens e exclusao vencedora', () => {
  it('aplicar static_list aplica a lista salva e a exclusao vence a inclusao (ate pos-resolve)', async () => {
    const { store } = makeStore({
      [AUDIENCE]: { id: AUDIENCE, name: 'L', kind: 'static_list', filters: null, company_ids: [X, Y], contact_ids: [] },
    });
    // Adversario de proposito: a ponte devolve X mesmo com X excluido.
    const { source, seen } = makeSource(
      [{ company_id: X }, { company_id: Y }],
      { companyIds: [], count: 0 },
      [{ company_id: X }],
    );

    const res = await handleAudienceApply(
      makeCtx({ audience_id: AUDIENCE, exclude: { company_ids: [X] } }) as never,
      { store, source, scope: SCOPE } as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const finais: string[] = body.data.recipients.map((r: Row) => r.company_id);

    expect(finais).not.toContain(X);
    expect(finais).toContain(Y);
    expect(body.data.audience_id).toBe(AUDIENCE);
    expect(body.data.eligible_count).toBe(1);
    expect(body.data.excluded_removed).toBe(1);
    // Exclusao aplicada ANTES da ponte: X nem chegou a ser pedido.
    expect(seen.resolve[0].companies).toEqual([Y]);
  });

  it('diferencia eligible_count, dropped_out_of_filter e excluded_removed', async () => {
    const { store } = makeStore({
      [AUDIENCE]: { id: AUDIENCE, name: 'L', kind: 'static_list', filters: null, company_ids: [X, Y], contact_ids: [] },
    });
    // Top-level `filters` interseciona; a ponte devolve, de proposito, tambem W
    // (fora do filtro) e Y (excluido) para provar as defesas POS-resolve.
    const { source } = makeSource(
      [{ company_id: X }],
      { companyIds: [X, Y, Z], count: 3 },
      [{ company_id: Y }, { company_id: OUT_OF_FILTER }],
    );

    const res = await handleAudienceApply(
      makeCtx({
        audience_id: AUDIENCE,
        filters: { uf: 'SP' },
        exclude: { company_ids: [Y] },
      }) as never,
      { store, source, scope: SCOPE } as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    // Inclusao [X,Y] ∩ filtro {X,Y,Z} = [X,Y]; menos exclusao Y = [X].
    expect(body.data.eligible_count).toBe(1);
    expect(body.data.count).toBe(3);
    // W caiu no ∩ pos-resolve; Y caiu na exclusao pos-resolve.
    expect(body.data.dropped_out_of_filter).toBe(1);
    expect(body.data.excluded_removed).toBe(1);

    // Sem dado sensivel: a resposta so carrega contagens, ids e elegibilidade.
    const allowed = new Set([
      'audience_id', 'recipients', 'total', 'eligible_count', 'count', 'policy_limit',
      'primary_per_company', 'select_all', 'signals', 'dropped_out_of_filter', 'excluded_removed',
    ]);
    for (const key of Object.keys(body.data)) expect(allowed.has(key)).toBe(true);
    expect(JSON.stringify(body.data)).not.toMatch(/telefone|phone|cpf|cnpj|e164/i);
  });

  it('publico inexistente/nao acessivel responde 404 IGUAL e payload invalido responde 400', async () => {
    const { store } = makeStore({});
    const { source } = makeSource([]);

    const inexistente = await handleAudienceApply(
      makeCtx({ audience_id: AUDIENCE }) as never,
      { store, source, scope: SCOPE } as never,
    );
    expect(inexistente.status).toBe(404);
    expect((await inexistente.json()).error).toBe(MULTIPLIX_AUDIENCE_NOT_FOUND);

    const invalido = await handleAudienceApply(
      makeCtx({ audience_id: 'nao-e-uuid' }) as never,
      { store, source, scope: SCOPE } as never,
    );
    expect(invalido.status).toBe(400);
    expect(String((await invalido.json()).error)).toContain('audience.apply');
  });
});

describe('(c) audience.select — publico salvo por referencia', () => {
  it('expande a referencia salva e mantem a exclusao vencendo', async () => {
    const { store, calls } = makeStore({
      [AUDIENCE]: { id: AUDIENCE, name: 'L', kind: 'static_list', filters: null, company_ids: [X, Y], contact_ids: [] },
    });
    const { source } = makeSource([{ company_id: X }, { company_id: Y }], { companyIds: [], count: 0 }, [{ company_id: X }]);

    const res = await handleAudienceSelect(
      makeCtx({ publics: [{ audience_id: AUDIENCE }], exclude: { company_ids: [X] } }) as never,
      { store, source, scope: SCOPE } as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const finais: string[] = body.data.recipients.map((r: Row) => r.company_id);
    expect(finais).toEqual([Y]);
    expect(body.data.eligible_count).toBe(1);
    expect(calls.loads[0]).toEqual({ id: AUDIENCE, viewer: PROFILE });

    const semPublico = await handleAudienceSelect(
      makeCtx({ publics: [{ audience_id: AUDIENCE_RULE }] }) as never,
      { store, source, scope: SCOPE } as never,
    );
    expect(semPublico.status).toBe(404);
  });

  it('publico vazio (sem audience_id, filtros ou ids) responde 400', async () => {
    const { store } = makeStore({});
    const { source } = makeSource([]);
    const res = await handleAudienceSelect(makeCtx({ publics: [{}] }) as never, { store, source, scope: SCOPE } as never);
    expect(res.status).toBe(400);
  });
});
