/**
 * MX08 — cartao t_bc869ae9: "API de rascunho mistura identidades/colunas e aceita
 * destinatario do cliente" (item 21 do BACKLOG_VERIFICADO, area edge).
 *
 * O `draft.*` da edge `multiplix-dispatch` tinha TRES sintomas do MESMO defeito:
 *   1. IDENTIDADES — `multiplix_dispatches.created_by` (e o `p_created_by` da RPC)
 *      guarda `profiles.id`, mas a edge comparava/gravava o `auth.uid` cru do JWT
 *      (`ctx.userId`). Com os dois divergindo, o proprio dono levava 404/409 falsos
 *      e a criacao caia em `multiplix_draft_owner_not_found`.
 *   2. COLUNAS — `draft.get` selecionava `template`/`recipient_count`, nomes que
 *      NAO existem na tabela (sao `message_template`/`total_recipients`): 42703 do
 *      PostgREST saindo como 502.
 *   3. DESTINATARIO DO CLIENTE — `draft.create` aceitava `recipients` prontos do
 *      navegador (com `destino_e164`/`elegibilidade` forjaveis). Quem decide quem
 *      recebe e o servidor: a edge recebe so ids de empresa/contato e re-resolve o
 *      publico na ponte Singu sob o ESCOPO ASSINADO DO JWT.
 *
 * Prova (execucao real, sem rede): o `SupabaseClient` e um duble em memoria e a
 * ponte Singu e um duble injetado — mas o ESCOPO DE PUBLICO nunca e injetado: todo
 * caso de `draft.create` passa pelo `resolveAudienceScope` real, lendo as permissoes
 * pelas RPCs (`is_admin`/`user_has_permission`). E por isso que o 403 do chamador
 * sem permissao e provado de verdade, sem contornar o resolvedor.
 *
 * Rodar:
 *   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
 *     --allow-net=127.0.0.1 supabase/functions/multiplix-dispatch/__tests__/draft.test.ts
 */

import {
  handleDraftCreate,
  handleDraftDiscard,
  handleDraftGet,
  handleDraftUpdate,
  type ActionContext,
  type DraftCreateDeps,
} from '../index.ts';
import type { AudienceSource } from '../actions/audience.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ---------------------------------------------------------------------------
// Identidades (auth.uid != profiles.id — o caso que o defeito escondia).
// ---------------------------------------------------------------------------

const AUTH_USER = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';
const OTHER_USER = '33333333-3333-4333-8333-333333333333';
const OTHER_PROFILE = '44444444-4444-4444-8444-444444444444';
const DISPATCH = '55555555-5555-4555-8555-555555555555';
const NEW_DISPATCH = '66666666-6666-4666-8666-666666666666';
const COMPANY_A = '77777777-7777-4777-8777-777777777777';
const COMPANY_B = '88888888-8888-4888-8888-888888888888';
const REQ_ID = '99999999-9999-4999-8999-999999999999';
const FORGED_PHONE = '5511988887777';

type Doc = Record<string, unknown>;

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

interface Mutation {
  table: string;
  op: 'insert' | 'update' | 'delete';
  payload: unknown;
  filters: Array<[string, unknown]>;
}

interface FakeState {
  dispatches: Doc[];
  profiles: Doc[];
  /** Permissoes de PUBLICO concedidas (`multiplix.audience.*`). Vazio = 403. */
  permissions: string[];
  isAdmin: boolean;
  /** Toda LEITURA desta tabela falha (prova do 502, nao do 404 falso). */
  failReadsOn: string | null;
  createResult: Doc;
  createError: { message: string; code?: string } | null;
  rpcCalls: RpcCall[];
  mutations: Mutation[];
  /** Colunas pedidas em cada `.select()` — prova as COLUNAS REAIS. */
  selects: Array<{ table: string; columns: string }>;
}

function makeState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    dispatches: [],
    profiles: [
      { id: PROFILE, user_id: AUTH_USER },
      { id: OTHER_PROFILE, user_id: OTHER_USER },
    ],
    // Escopo de publico padrao: usuario autorizado (o caso "dono legitimo").
    permissions: ['multiplix.audience.admin'],
    isAdmin: false,
    failReadsOn: null,
    createResult: { dispatch_id: NEW_DISPATCH, recipient_count: 1, created: true },
    createError: null,
    rpcCalls: [],
    mutations: [],
    selects: [],
    ...overrides,
  };
}

/** Duble do PostgREST minimo (a cadeia exata que os handlers usam). */
function makeSupabase(state: FakeState) {
  const tables: Record<string, Doc[]> = {
    multiplix_dispatches: state.dispatches,
    profiles: state.profiles,
  };

  function from(table: string) {
    const rows = tables[table] ?? (tables[table] = []);
    let op: Mutation['op'] | 'select' = 'select';
    let payload: unknown = null;
    const filters: Array<[string, unknown]> = [];

    const matching = () => rows.filter((r) => filters.every(([c, v]) => r[c] === v));

    const run = (): Doc[] => {
      if (op === 'select') return matching();
      if (op === 'update') {
        const targets = matching();
        for (const row of targets) Object.assign(row, payload as Doc);
        if (targets.length > 0) state.mutations.push({ table, op, payload, filters: [...filters] });
        return targets;
      }
      if (op === 'insert') {
        const inserted = [{ id: NEW_DISPATCH, ...(payload as Doc) }];
        rows.push(...inserted);
        state.mutations.push({ table, op, payload, filters: [] });
        return inserted;
      }
      const targets = matching();
      for (const row of targets) rows.splice(rows.indexOf(row), 1);
      if (targets.length > 0) state.mutations.push({ table, op: 'delete', payload: null, filters: [...filters] });
      return targets;
    };

    const finish = () => {
      // Falha de BANCO na leitura: nao pode virar "nao encontrado".
      if (op === 'select' && state.failReadsOn === table) {
        return { data: null, error: { message: 'db down (teste)', code: '08006' } };
      }
      const out = run();
      if (out.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
      return { data: out.length ? out[0] : null, error: null };
    };

    const api = {
      select: (columns = '*') => {
        state.selects.push({ table, columns: String(columns) });
        return api;
      },
      insert: (p: unknown) => {
        op = 'insert';
        payload = p;
        return api;
      },
      update: (p: unknown) => {
        op = 'update';
        payload = p;
        return api;
      },
      delete: () => {
        op = 'delete';
        return api;
      },
      eq: (c: string, v: unknown) => {
        filters.push([c, v]);
        return api;
      },
      in: (c: string, v: unknown[]) => {
        filters.push([c, v]);
        return api;
      },
      order: () => api,
      limit: () => api,
      range: () => api,
      maybeSingle: () => Promise.resolve(finish()),
    };
    return api;
  }

  function rpc(fn: string, args: Record<string, unknown>) {
    state.rpcCalls.push({ fn, args });
    if (fn === 'is_admin') return Promise.resolve({ data: state.isAdmin, error: null });
    if (fn === 'user_has_permission') {
      const granted = state.permissions.includes(String(args._permission_name));
      return Promise.resolve({ data: granted, error: null });
    }
    if (fn === 'multiplix_create_draft') {
      if (state.createError) return Promise.resolve({ data: null, error: state.createError });
      return Promise.resolve({ data: [state.createResult], error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }

  const supabase = {
    from,
    rpc,
    auth: {
      admin: {
        getUserById: () => Promise.resolve({ data: { user: { email: 'vendedor@exemplo.test' } }, error: null }),
      },
    },
  };
  return { supabase, tables };
}

function makeCtx(state: FakeState, payload: Doc, action = 'draft.get', userId = AUTH_USER): ActionContext {
  const db = makeSupabase(state);
  return {
    action,
    payload,
    userId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: db.supabase as any,
    correlationId: 'corr-mx08',
    req: new Request('https://zapp-web-v2.vercel.app/functions/v1/multiplix-dispatch', {
      method: 'POST',
      headers: { origin: 'https://zapp-web-v2.vercel.app' },
    }),
  };
}

/**
 * Duble da ponte Singu (EXTERNA) — unico ponto injetado. O escopo NAO e injetavel:
 * `resolveAudienceScope` roda de verdade em todo caso de `draft.create`.
 */
function bridge(rows: Doc[], calls: Array<{ companyIds: string[]; contactIds: string[] }> = []): DraftCreateDeps {
  const source: AudienceSource = {
    listFilteredCompanyIds: () => Promise.resolve({ companyIds: [], count: 0 }),
    resolveRecipients: (companyIds, contactIds) => {
      calls.push({ companyIds, contactIds });
      return Promise.resolve(rows);
    },
  };
  return { source };
}

/** O que a ponte devolve: elegibilidade em PT (o Singu fala PT; a fronteira traduz). */
const SINGU_ROWS: Doc[] = [
  {
    company_id: COMPANY_A,
    company_name: 'Alfa',
    destino_e164: '5511900001111',
    destino_origem: 'contact_phones',
    elegibilidade: 'apto',
  },
  {
    company_id: COMPANY_B,
    company_name: 'Beta',
    destino_e164: '5511900002222',
    destino_origem: 'contact_phones',
    elegibilidade: 'fora_do_escopo',
  },
];

function createPayload(extra: Doc = {}): Doc {
  return {
    name: 'Disparo de teste',
    message_template: 'Oi {{empresa}}',
    company_ids: [COMPANY_A, COMPANY_B],
    client_request_id: REQ_ID,
    ...extra,
  };
}

const body = async (res: Response) => (await res.json()) as Doc;
const createCalls = (state: FakeState) => state.rpcCalls.filter((c) => c.fn === 'multiplix_create_draft');
const columnsOf = (state: FakeState, table: string) =>
  state.selects.filter((s) => s.table === table).map((s) => s.columns);

// ---------------------------------------------------------------------------
// (3) DESTINATARIO DO CLIENTE — nunca entra.
// ---------------------------------------------------------------------------

Deno.test('MX08 draft.create: `recipients`/destino do cliente e RECUSADO (400) e nada e resolvido ou criado', async () => {
  const state = makeState();
  const calls: Array<{ companyIds: string[]; contactIds: string[] }> = [];
  // Payload do defeito: o navegador mandava as linhas prontas (com o telefone
  // que ele escolheu) e `template` — os nomes que a API antiga aceitava.
  const res = await handleDraftCreate(
    makeCtx(state, {
      name: 'Disparo forjado',
      template: 'Oi',
      recipients: [{ company_id: COMPANY_A, destino_e164: FORGED_PHONE, elegibilidade: 'apto' }],
      client_request_id: REQ_ID,
    }, 'draft.create'),
    bridge(SINGU_ROWS, calls),
  );

  assert(res.status === 400, `payload com destinatario do cliente deve ser 400, veio ${res.status}`);
  assert(calls.length === 0, 'nenhuma resolucao pode acontecer com payload invalido');
  assert(createCalls(state).length === 0, 'nenhum rascunho pode ser criado a partir de destinatario do cliente');
  const serialized = JSON.stringify(state.rpcCalls);
  assert(!serialized.includes(FORGED_PHONE), 'o telefone escolhido pelo cliente nunca pode chegar ao servidor');
});

Deno.test('MX08 draft.create: `recipients` junto do payload valido tambem e recusado (schema estrito)', async () => {
  const state = makeState();
  const calls: Array<{ companyIds: string[]; contactIds: string[] }> = [];
  const res = await handleDraftCreate(
    makeCtx(state, createPayload({
      recipients: [{ company_id: COMPANY_A, destino_e164: FORGED_PHONE, elegibilidade: 'apto' }],
    }), 'draft.create'),
    bridge(SINGU_ROWS, calls),
  );

  assert(res.status === 400, `campo extra de destinatario deve ser recusado, veio ${res.status}`);
  assert(calls.length === 0, 'nada pode ser resolvido quando o payload traz destinatario');
  assert(createCalls(state).length === 0, 'nenhuma criacao com campo extra de destinatario');
  assert(!JSON.stringify(state.rpcCalls).includes(FORGED_PHONE), 'telefone forjado nunca chega ao servidor');
});

Deno.test('MX08 draft.create: sem ids de empresa/contato nao ha rascunho (ninguem decide o publico pelo corpo)', async () => {
  const state = makeState();
  const calls: Array<{ companyIds: string[]; contactIds: string[] }> = [];
  const res = await handleDraftCreate(
    makeCtx(state, {
      name: 'Sem publico',
      message_template: 'Oi',
      client_request_id: REQ_ID,
    }, 'draft.create'),
    bridge(SINGU_ROWS, calls),
  );

  assert(res.status === 400, `sem company_ids/contact_ids deve ser 400, veio ${res.status}`);
  assert(calls.length === 0, 'nada a resolver sem ids');
  assert(createCalls(state).length === 0, 'nada a criar sem ids');
});

// ---------------------------------------------------------------------------
// (1) IDENTIDADE — `created_by` e `profiles.id`, nunca o auth.uid.
// ---------------------------------------------------------------------------

Deno.test('MX08 draft.create: a RPC recebe p_created_by = profiles.id (o auth.uid difere)', async () => {
  const state = makeState();
  const calls: Array<{ companyIds: string[]; contactIds: string[] }> = [];
  const res = await handleDraftCreate(
    makeCtx(state, createPayload(), 'draft.create', AUTH_USER),
    bridge(SINGU_ROWS, calls),
  );

  assert(res.status === 200, `esperava 200, veio ${res.status} (${JSON.stringify(await res.clone().json().catch(() => null))})`);
  const call = createCalls(state)[0];
  assert(call !== undefined, 'a RPC multiplix_create_draft deveria ter sido chamada');
  const createdBy = String(call.args.p_created_by);
  assert(
    createdBy === PROFILE,
    `p_created_by deve ser o profiles.id (${PROFILE}) — o auth.uid (${AUTH_USER}) quebra o dono; veio ${createdBy}`,
  );
  const criados = JSON.stringify(state.rpcCalls.filter((c) => c.fn === 'multiplix_create_draft').map((c) => c.args));
  assert(!criados.includes(AUTH_USER), 'p_created_by nunca pode ser o auth.uid cru');
});

Deno.test('MX08 draft.create: quem decide o destino e o SERVIDOR (a ponte recebe ids; a RPC recebe a elegibilidade resolvida)', async () => {
  const state = makeState();
  const calls: Array<{ companyIds: string[]; contactIds: string[] }> = [];
  const res = await handleDraftCreate(
    makeCtx(state, createPayload({ contact_ids: [COMPANY_B] }), 'draft.create'),
    bridge(SINGU_ROWS, calls),
  );

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  assert(calls.length === 1, `a ponte deveria ser chamada 1x, foi ${calls.length}`);
  assert(
    JSON.stringify(calls[0].companyIds) === JSON.stringify([COMPANY_A, COMPANY_B]),
    `a ponte deve receber os company_ids do pedido, veio ${JSON.stringify(calls[0].companyIds)}`,
  );

  const sent = createCalls(state)[0].args.p_recipients as Doc[];
  assert(Array.isArray(sent) && sent.length === 1, `so o elegivel entra no rascunho, veio ${JSON.stringify(sent)}`);
  assert(sent[0].company_id === COMPANY_A, `empresa do elegivel inesperada: ${String(sent[0].company_id)}`);
  assert(
    sent[0].destino_e164 === '5511900001111',
    `o destino tem de vir da RESOLUCAO do servidor, veio ${String(sent[0].destino_e164)}`,
  );
  assert(sent[0].elegibilidade === 'eligible', `a fronteira PT->EN deve traduzir 'apto' -> 'eligible', veio ${String(sent[0].elegibilidade)}`);
});

Deno.test('MX08 draft.create: chamador SEM permissao de publico recebe 403 e nada e resolvido nem criado', async () => {
  // O caminho REAL de autorizacao: sem escopo injetado, o `resolveAudienceScope`
  // resolve as permissoes pelas RPCs e recusa. E o caso que a recusa anterior
  // apontou como nao provado.
  const state = makeState({ permissions: [], isAdmin: false });
  const calls: Array<{ companyIds: string[]; contactIds: string[] }> = [];
  const res = await handleDraftCreate(
    makeCtx(state, createPayload(), 'draft.create'),
    bridge(SINGU_ROWS, calls),
  );

  assert(res.status === 403, `sem permissao de publico deve ser 403, veio ${res.status}`);
  assert(calls.length === 0, 'sem autorizacao, nenhuma resolucao pode acontecer');
  assert(createCalls(state).length === 0, 'sem autorizacao, nenhum rascunho pode ser criado');
  assert(state.mutations.length === 0, 'sem autorizacao, nenhuma escrita pode acontecer');
});

Deno.test('MX08 draft.create: JWT sem perfil correspondente recebe 403 e nao cria', async () => {
  const state = makeState({ profiles: [] });
  const calls: Array<{ companyIds: string[]; contactIds: string[] }> = [];
  const res = await handleDraftCreate(
    makeCtx(state, createPayload(), 'draft.create'),
    bridge(SINGU_ROWS, calls),
  );

  assert(res.status === 403, `sem perfil o usuario nao cria rascunho (403), veio ${res.status}`);
  assert(calls.length === 0, 'o perfil e resolvido antes da ponte');
  assert(createCalls(state).length === 0, 'nada criado sem perfil');
});

// ---------------------------------------------------------------------------
// (2) COLUNAS + POSSE na leitura.
// ---------------------------------------------------------------------------

Deno.test('MX08 draft.get: le as colunas REAIS e reconhece o dono por profiles.id (auth.uid != profiles.id)', async () => {
  const state = makeState({
    dispatches: [{
      id: DISPATCH,
      name: 'Rascunho',
      status: 'draft',
      created_by: PROFILE,
      message_template: 'Oi',
      total_recipients: 2,
      dispatch_version: 1,
    }],
  });

  const res = await handleDraftGet(makeCtx(state, { dispatch_id: DISPATCH }, 'draft.get', AUTH_USER));
  assert(res.status === 200, `o dono deve ler o proprio rascunho mesmo com auth.uid != profiles.id, veio ${res.status}`);

  const columns = columnsOf(state, 'multiplix_dispatches')[0] ?? '';
  const tokens = columns.split(',').map((c) => c.trim());
  assert(tokens.includes('message_template'), `a leitura deve pedir message_template, pediu: ${columns}`);
  assert(tokens.includes('total_recipients'), `a leitura deve pedir total_recipients, pediu: ${columns}`);
  assert(!tokens.includes('template'), `a coluna 'template' NAO existe na tabela (42703), pediu: ${columns}`);
  assert(!tokens.includes('recipient_count'), `a coluna 'recipient_count' NAO existe na tabela (42703), pediu: ${columns}`);
});

Deno.test('MX08 draft.get: rascunho de OUTRO dono -> 404 (nao revela existencia); com manage_all -> 200', async () => {
  const outro = makeState({
    permissions: [],
    dispatches: [{ id: DISPATCH, status: 'draft', created_by: OTHER_PROFILE }],
  });
  const negado = await handleDraftGet(makeCtx(outro, { dispatch_id: DISPATCH }, 'draft.get', AUTH_USER));
  assert(negado.status === 404, `rascunho alheio deve ser 404, veio ${negado.status}`);

  const amplo = makeState({
    permissions: ['multiplix.dispatch.manage_all'],
    dispatches: [{ id: DISPATCH, status: 'draft', created_by: OTHER_PROFILE }],
  });
  const permitido = await handleDraftGet(makeCtx(amplo, { dispatch_id: DISPATCH }, 'draft.get', AUTH_USER));
  assert(permitido.status === 200, `manage_all deve ler o rascunho alheio, veio ${permitido.status}`);
});

// ---------------------------------------------------------------------------
// (1)+(2) ESCRITA — posse correta, manage_all sem tomar a posse, erro de banco.
// ---------------------------------------------------------------------------

Deno.test('MX08 draft.update: o dono atualiza (auth.uid != profiles.id) e a posse nao muda', async () => {
  const state = makeState({
    dispatches: [{ id: DISPATCH, name: 'Antes', status: 'draft', created_by: PROFILE }],
  });

  const res = await handleDraftUpdate(makeCtx(state, { dispatch_id: DISPATCH, name: 'Depois' }, 'draft.update', AUTH_USER));
  assert(res.status === 200, `o dono deve editar o proprio rascunho, veio ${res.status}`);

  const row = state.dispatches[0];
  assert(row.name === 'Depois', `o patch deveria aplicar o nome, veio ${String(row.name)}`);
  assert(row.created_by === PROFILE, `created_by nao pode mudar numa edicao (veio ${String(row.created_by)})`);
  const mutation = state.mutations[0];
  assert(mutation !== undefined, 'deveria haver 1 update');
  assert(
    !Object.keys(mutation.payload as Doc).includes('created_by'),
    `o patch nunca leva created_by: ${JSON.stringify(mutation.payload)}`,
  );
  assert(
    mutation.filters.some(([c, v]) => c === 'created_by' && v === PROFILE),
    `o WHERE deve escopar pelo profiles.id do dono, veio ${JSON.stringify(mutation.filters)}`,
  );
});

Deno.test('MX08 draft.update: manage_all edita rascunho alheio SEM tomar a posse', async () => {
  const state = makeState({
    dispatches: [{ id: DISPATCH, name: 'Alheio', status: 'draft', created_by: OTHER_PROFILE }],
    permissions: ['multiplix.dispatch.manage_all'],
  });

  const res = await handleDraftUpdate(makeCtx(state, { dispatch_id: DISPATCH, name: 'Ajustado' }, 'draft.update', AUTH_USER));
  assert(res.status === 200, `manage_all deve editar o rascunho alheio, veio ${res.status}`);
  assert(
    state.dispatches[0].created_by === OTHER_PROFILE,
    `quem tem manage_all NAO pode tomar a posse: created_by virou ${String(state.dispatches[0].created_by)}`,
  );
  assert(state.dispatches[0].name === 'Ajustado', 'a edicao deveria ter sido aplicada');
});

Deno.test('MX08 draft.update: outro dono -> 404 sem nenhuma mutacao', async () => {
  const state = makeState({
    dispatches: [{ id: DISPATCH, status: 'draft', created_by: OTHER_PROFILE }],
    permissions: [],
  });

  const res = await handleDraftUpdate(makeCtx(state, { dispatch_id: DISPATCH, name: 'Invasao' }, 'draft.update', AUTH_USER));
  assert(res.status === 404, `rascunho alheio sem manage_all deve ser 404, veio ${res.status}`);
  assert(state.mutations.length === 0, `nenhuma escrita em rascunho alheio (${state.mutations.length})`);
});

Deno.test('MX08 draft.update/discard: falha de BANCO na leitura do dono vira 502, nunca 404 falso', async () => {
  for (const action of ['draft.update', 'draft.discard'] as const) {
    const state = makeState({
      dispatches: [{ id: DISPATCH, status: 'draft', created_by: PROFILE }],
      failReadsOn: 'multiplix_dispatches',
    });
    const ctx = makeCtx(state, { dispatch_id: DISPATCH, name: 'x' }, action, AUTH_USER);
    let thrown: unknown = null;
    try {
      if (action === 'draft.update') await handleDraftUpdate(ctx);
      else await handleDraftDiscard(ctx);
    } catch (error) {
      thrown = error;
    }
    assert(thrown !== null, `${action}: erro de banco deveria subir como DispatchError (nao virar 404)`);
    const err = thrown as { code?: string; status?: number };
    assert(
      err.status === 502,
      `${action}: falha de banco deve subir com status 502 (nao 404 falso), veio ${String(err.status)}`,
    );
    assert(err.code === 'MULTIPLIX_DRAFT_UPDATE' || err.code === 'MULTIPLIX_DRAFT_DISCARD', `${action}: codigo nomeado, veio ${String(err.code)}`);
    assert(state.mutations.length === 0, `${action}: nenhuma mutacao quando a leitura falha`);
  }
});

Deno.test('MX08 draft.discard: o dono descarta; outro dono -> 404 sem apagar', async () => {
  const dono = makeState({
    dispatches: [{ id: DISPATCH, status: 'draft', created_by: PROFILE }],
  });
  const ok = await handleDraftDiscard(makeCtx(dono, { dispatch_id: DISPATCH }, 'draft.discard', AUTH_USER));
  assert(ok.status === 200, `o dono deve descartar o proprio rascunho, veio ${ok.status}`);
  assert(dono.dispatches.length === 0, 'o rascunho do dono deveria ter sido apagado');
  const filtro = dono.mutations[0]?.filters ?? [];
  assert(
    filtro.some(([c, v]) => c === 'created_by' && v === PROFILE),
    `o DELETE deve escopar pelo profiles.id do dono, veio ${JSON.stringify(filtro)}`,
  );

  const outro = makeState({
    permissions: [],
    dispatches: [{ id: DISPATCH, status: 'draft', created_by: OTHER_PROFILE }],
  });
  const negado = await handleDraftDiscard(makeCtx(outro, { dispatch_id: DISPATCH }, 'draft.discard', AUTH_USER));
  assert(negado.status === 404, `rascunho alheio deve ser 404, veio ${negado.status}`);
  assert(outro.dispatches.length === 1, 'o rascunho alheio permanece intacto');
  assert(outro.mutations.length === 0, 'nenhum DELETE em rascunho alheio');
});

Deno.test('MX08 draft.discard: manage_all descarta o rascunho alheio (a posse do outro permanece)', async () => {
  const state = makeState({
    permissions: ['multiplix.dispatch.manage_all'],
    dispatches: [{ id: DISPATCH, status: 'draft', created_by: OTHER_PROFILE }],
  });
  const res = await handleDraftDiscard(makeCtx(state, { dispatch_id: DISPATCH }, 'draft.discard', AUTH_USER));
  assert(res.status === 200, `manage_all deve descartar rascunho alheio, veio ${res.status}`);
  assert(state.dispatches.length === 0, 'o rascunho deveria ter sido apagado');
  const filtro = state.mutations[0]?.filters ?? [];
  assert(
    filtro.some(([c, v]) => c === 'created_by' && v === OTHER_PROFILE),
    `o DELETE deve escopar pelo dono LIDO (nao pelo operador), veio ${JSON.stringify(filtro)}`,
  );
});

Deno.test('MX08 draft.create: teto de destinatarios (F17) continua nomeado com contagem e limite', async () => {
  const state = makeState({
    createError: { message: 'multiplix_over_recipient_limit: count=3 limit=2', code: '22023' },
  });
  const res = await handleDraftCreate(
    makeCtx(state, createPayload(), 'draft.create'),
    bridge(SINGU_ROWS),
  );
  assert(res.status === 400, `teto excedido e erro nomeado 400, veio ${res.status}`);
  const out = await body(res);
  assert(out.error === 'multiplix_over_recipient_limit', `codigo nomeado esperado, veio ${JSON.stringify(out)}`);
  assert(out.count === 3 && out.limit === 2, `contagem/limite do teto: ${JSON.stringify(out)}`);
});
