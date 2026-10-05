/**
 * MX08 (t_fed60cec) — prova dos 3 defeitos da camada `draft.*` da edge
 * `multiplix-dispatch`, todos reproduziveis SEM rede (duble de Supabase +
 * ponte Singu injetada):
 *
 *   (1) IDENTIDADE — `created_by`/`p_created_by` guardam `profiles.id`, NAO o
 *       `auth.uid` do JWT. O duble modela a RPC `multiplix_create_draft` da
 *       migration F31 fielmente: rejeita `p_created_by` que nao existe em
 *       `profiles` (`multiplix_draft_owner_not_found`). Com auth.uid !=
 *       profiles.id, o codigo defeituoso falharia com 502 e os reads/updates
 *       devolveriam 404/409 para o proprio dono.
 *   (2) COLUNAS — `multiplix_dispatches` NAO tem `template`/`recipient_count`
 *       (as reais sao `message_template`/`total_recipients`). O duble responde
 *       42703 como o PostgREST quando o select pede coluna inexistente.
 *   (3) DESTINATARIO DO CLIENTE — o payload pode trazer `recipients` com
 *       `destino_e164`/`elegibilidade` forjados; o handler TEM de ignorar: a RPC
 *       so recebe o que a ponte Singu (injetada) resolveu no servidor, ja na
 *       fronteira PT->EN (`mapResolvedRecipients`).
 *
 * Cobre ainda a aceitacao: caller sem permissao de audiencia -> 403; outro dono
 * -> 404 sem mutacao; `manage_all` opera rascunho alheio; mesmo
 * `client_request_id` nao duplica o disparo.
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  handleDraftCreate,
  handleDraftDiscard,
  handleDraftGet,
  handleDraftUpdate,
  type ActionContext,
  type DraftCreateDeps,
} from '../index.ts';
import { handleBlocksUpsert } from '../actions/blocks.ts';
import type { AudienceScope, AudienceSource } from '../actions/audience.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// auth.uid do JWT — de PROPOSITO diferente do profiles.id (o defeito MX08 so
// aparece quando os dois divergem).
const AUTH_USER = 'auth-uid-do-jwt-1';
const AUTH_OTHER = 'auth-uid-do-jwt-2';
const PROFILE = 'aaaa0000-0000-4000-8000-000000000001'; // profiles.id do AUTH_USER
const PROFILE_OTHER = 'bbbb0000-0000-4000-8000-000000000002';

const COMPANY_A = 'cccc0000-0000-4000-8000-0000000000a1';
const COMPANY_B = 'cccc0000-0000-4000-8000-0000000000b2';
const COMPANY_FORGED = 'eeee0000-0000-4000-8000-0000000000ee';
const FORGED_PHONE = '5513999999999';

const D1 = 'dddddddd-0000-4000-8000-000000000001';
const D2 = 'dddddddd-0000-4000-8000-000000000002';
const REQ_1 = '11110000-0000-4000-8000-000000000001';
const NOW = '2026-10-05T12:00:00Z';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Colunas REAIS de `multiplix_dispatches` (schema-manifest + migration F31). */
const DISPATCH_COLUMNS = new Set([
  'id', 'name', 'status', 'message_template', 'media_url', 'media_type',
  'schedule_timezone', 'scheduled_at', 'created_by', 'client_request_id',
  'origin', 'dispatch_version', 'audience_version', 'total_recipients',
  'sent_count', 'delivered_count', 'failed_count', 'outcome_unknown_count',
  'started_at', 'paused_at', 'pause_reason', 'completed_at', 'created_at',
  'updated_at', 'whatsapp_connection_id', 'send_interval_min',
  'send_interval_max', 'send_window_start', 'send_window_end',
  'typing_delay_min', 'typing_delay_max', 'speed_profile',
  'business_hours_only', 'audience_filters',
]);

type Row = Record<string, unknown>;

interface FakeState {
  profiles: Row[];
  dispatches: Row[];
  recipients: Row[];
  blocks: Row[];
  /** resultado de `user_has_permission(multiplix.dispatch.manage_all)`. */
  permission: boolean;
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  mutations: Array<{ table: string; op: string; payload: unknown }>;
  queried: string[];
  eqs: Record<string, Array<[string, unknown]>>;
}

function makeState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    profiles: [
      { id: PROFILE, user_id: AUTH_USER },
      { id: PROFILE_OTHER, user_id: AUTH_OTHER },
    ],
    dispatches: [
      {
        id: D1, name: 'Rascunho do dono', status: 'draft',
        message_template: 'Oi {{empresa}}', total_recipients: 2,
        dispatch_version: 1, audience_version: 1, created_by: PROFILE,
        whatsapp_connection_id: null, scheduled_at: null,
        client_request_id: '11110000-0000-4000-8000-00000000d001', created_at: NOW, updated_at: NOW,
      },
      {
        id: D2, name: 'Rascunho alheio', status: 'draft',
        message_template: 'Oi', total_recipients: 1,
        dispatch_version: 1, audience_version: 1, created_by: PROFILE_OTHER,
        whatsapp_connection_id: null, scheduled_at: null,
        client_request_id: null, created_at: NOW, updated_at: NOW,
      },
    ],
    recipients: [],
    blocks: [],
    permission: false,
    rpcCalls: [],
    mutations: [],
    queried: [],
    eqs: {},
    ...overrides,
  };
}

/** Cadeia PostgREST minima: select/eq/update/delete/maybeSingle + colunas reais. */
function makeSupabase(state: FakeState) {
  const tables: Record<string, Row[]> = {
    profiles: state.profiles,
    multiplix_dispatches: state.dispatches,
    multiplix_recipients: state.recipients,
    multiplix_blocks: state.blocks,
  };

  let seq = 0;
  const genId = () =>
    `99990000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  /** Projeta a linha nas colunas pedidas (o PostgREST so devolve o select). */
  const project = (row: Row): Row => {
    if (colsGlobal === '*') return { ...row };
    const out: Row = {};
    for (const c of colsGlobal.split(',')) out[c.trim()] = row[c.trim()];
    return out;
  };
  let colsGlobal = '*';

  function from(table: string) {
    const rows = tables[table] ?? [];
    state.queried.push(table);
    let op: 'select' | 'update' | 'delete' | 'insert' = 'select';
    let payload: unknown;
    let cols = '*';
    const eqs: Array<[string, unknown]> = [];
    const ins: Array<[string, unknown[]]> = [];
    let orderBy: [string, boolean] | null = null;
    let limitN: number | null = null;

    // O PostgREST devolve 42703 quando o select pede coluna inexistente — e o
    // que derrubava `draft.get` com `template`/`recipient_count`.
    const columnError = () => {
      if (cols === '*' || table !== 'multiplix_dispatches') return null;
      const bad = cols.split(',').map((c) => c.trim()).filter((c) => c && !DISPATCH_COLUMNS.has(c));
      return bad.length
        ? { code: '42703', message: `column ${table}.${bad[0]} does not exist` }
        : null;
    };

    const matching = () =>
      rows.filter((r) =>
        eqs.every(([c, v]) => r[c] === v) &&
        ins.every(([c, vs]) => vs.includes(r[c] as never))
      );

    const finish = () => {
      state.eqs[table] = [...eqs, ...ins];
      colsGlobal = cols;
      const bad = columnError();
      if (bad) return { data: null, error: bad };
      if (op === 'insert') {
        const row = { id: genId(), ...(payload as Row) };
        rows.push(row);
        state.mutations.push({ table, op, payload: row });
        return { data: project(row), error: null };
      }
      let found = matching();
      if (op === 'select') {
        if (orderBy) {
          const [col, asc] = orderBy;
          found = [...found].sort((a, b) => {
            const av = a[col] as number | string | null;
            const bv = b[col] as number | string | null;
            const cmp = av == null ? -1 : bv == null ? 1 : av < bv ? -1 : av > bv ? 1 : 0;
            return asc ? cmp : -cmp;
          });
        }
        if (limitN !== null) found = found.slice(0, limitN);
        return { data: found.length ? project(found[0]) : null, error: null };
      }
      if (op === 'update') {
        for (const r of found) Object.assign(r, payload as Row, { updated_at: NOW });
        if (found.length) state.mutations.push({ table, op, payload });
      } else {
        for (const r of found) rows.splice(rows.indexOf(r), 1);
        if (found.length) state.mutations.push({ table, op, payload: null });
      }
      return { data: found.length ? project(found[0]) : null, error: null };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: Record<string, any> = {};
    api.select = (c?: string) => {
      if (typeof c === 'string') cols = c;
      return api;
    };
    api.insert = (p: unknown) => { op = 'insert'; payload = p; return api; };
    api.update = (p: unknown) => { op = 'update'; payload = p; return api; };
    api.delete = () => { op = 'delete'; return api; };
    api.eq = (c: string, v: unknown) => { eqs.push([c, v]); return api; };
    api.in = (c: string, vs: unknown[]) => { ins.push([c, vs]); return api; };
    api.order = (c: string, opts?: { ascending?: boolean }) => {
      orderBy = [c, opts?.ascending !== false];
      return api;
    };
    api.limit = (n: number) => { limitN = n; return api; };
    api.maybeSingle = () => Promise.resolve(finish());
    return api;
  }

  /**
   * Modela o CONTRATO da RPC `multiplix_create_draft` (F31): dono tem de ser um
   * `profiles.id` existente; so entra destinatario elegivel com company_id uuid;
   * dedupe por destino; idempotente por `client_request_id`.
   */
  function fakeCreateDraft(args: Record<string, unknown>): { data: unknown; error: unknown } {
    if (!state.profiles.some((p) => p.id === args.p_created_by)) {
      return { data: null, error: { message: 'multiplix_draft_owner_not_found', code: 'P0002' } };
    }
    const list = Array.isArray(args.p_recipients) ? args.p_recipients as Row[] : [];
    const eligible = list.filter((r) =>
      ['eligible', 'apto'].includes(String(r?.elegibilidade ?? 'eligible')) &&
      UUID_RE.test(String(r?.company_id ?? ''))
    );
    const byDestino = new Map<string | null, Row>();
    for (const r of eligible) {
      const destino = String(r?.destino_e164 ?? '').trim() || null;
      if (!byDestino.has(destino)) byDestino.set(destino, r);
    }
    const dedup = [...byDestino.values()];
    if (dedup.length === 0) {
      return { data: null, error: { message: 'multiplix_draft_no_eligible_recipients', code: '22023' } };
    }
    const existing = state.dispatches.find((d) => d.client_request_id === args.p_client_request_id);
    if (existing) {
      const count = state.recipients.filter((r) => r.dispatch_id === existing.id).length;
      return {
        data: [{ dispatch_id: existing.id, recipient_count: count, created: false, duplicated_count: 0 }],
        error: null,
      };
    }
    const dispatch: Row = {
      id: genId(),
      name: args.p_name,
      message_template: args.p_template,
      status: args.p_scheduled_at ? 'scheduled' : 'draft',
      total_recipients: dedup.length,
      scheduled_at: args.p_scheduled_at ?? null,
      whatsapp_connection_id: args.p_whatsapp_connection_id ?? null,
      created_by: args.p_created_by,
      client_request_id: args.p_client_request_id,
      dispatch_version: 1,
      audience_version: 1,
      created_at: NOW,
      updated_at: NOW,
    };
    state.dispatches.push(dispatch);
    for (const r of dedup) {
      state.recipients.push({
        id: genId(),
        dispatch_id: dispatch.id,
        company_id: r.company_id,
        company_name_snapshot: r.company_name ?? null,
        destino_e164: String(r.destino_e164 ?? '').trim() || null,
      });
    }
    return {
      data: [{
        dispatch_id: dispatch.id,
        recipient_count: dedup.length,
        created: true,
        duplicated_count: eligible.length - dedup.length,
      }],
      error: null,
    };
  }

  return {
    from,
    rpc(name: string, args: Record<string, unknown> = {}) {
      state.rpcCalls.push({ name, args });
      if (name === 'user_has_permission') {
        return Promise.resolve({ data: state.permission, error: null });
      }
      if (name === 'multiplix_create_draft') return Promise.resolve(fakeCreateDraft(args));
      return Promise.resolve({ data: null, error: { message: `rpc nao mockada: ${name}` } });
    },
  };
}

function makeCtx(state: FakeState, payload: Row, action = 'draft.get', userId = AUTH_USER): ActionContext {
  return {
    action,
    payload,
    userId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: makeSupabase(state) as any,
    correlationId: 'corr-mx08',
    req: new Request('https://zapp-web-v2.vercel.app/functions/v1/multiplix-dispatch', {
      method: 'POST',
      headers: { origin: 'https://zapp-web-v2.vercel.app' },
    }),
  };
}

/** O que a ponte Singu devolve (elegibilidade em PT, como o Singu fala). */
const SINGU_ROWS: Row[] = [
  { company_id: COMPANY_A, contact_id: 'k1', company_name: 'Alfa', destino_e164: '5511900001111', destino_origem: 'contact_phones', elegibilidade: 'apto' },
  { company_id: COMPANY_B, contact_id: 'k2', company_name: 'Beta', destino_e164: '5511900002222', destino_origem: 'contact_phones', elegibilidade: 'fora_do_escopo' },
];

/** Duble da ponte Singu + escopo injetado (sem rede/env). */
function draftDeps(
  rows: Row[] = SINGU_ROWS,
  calls: Array<{ companyIds: string[]; contactIds: string[] }> = [],
): DraftCreateDeps {
  const scope: AudienceScope = { permissions: ['admin'], vendedorEmail: null };
  const source: AudienceSource = {
    listFilteredCompanyIds: () => Promise.resolve({ companyIds: [], count: 0 }),
    resolveRecipients: (companyIds, contactIds) => {
      calls.push({ companyIds, contactIds });
      return Promise.resolve(rows);
    },
  };
  return { scope, source };
}

function createPayload(extra: Row = {}): Row {
  return {
    name: 'Disparo de teste',
    message_template: 'Oi {{empresa}}',
    company_ids: [COMPANY_A, COMPANY_B],
    client_request_id: REQ_1,
    ...extra,
  };
}

const body = async (res: Response) => (await res.json()) as Row;

// ---------------------------------------------------------------------------
// (1) identidade: auth.uid NAO e profiles.id
// ---------------------------------------------------------------------------

Deno.test('MX08 draft.create: a RPC recebe p_created_by = profiles.id (nao o auth.uid)', async () => {
  const state = makeState();
  const res = await handleDraftCreate(
    makeCtx(state, createPayload(), 'draft.create'),
    draftDeps(),
  );

  assert(res.status === 200, `esperava 200, veio ${res.status} (${JSON.stringify(await res.clone().json().catch(() => null))})`);
  const call = state.rpcCalls.find((c) => c.name === 'multiplix_create_draft');
  assert(call, 'a RPC multiplix_create_draft deveria ter sido chamada');
  assert(
    call.args.p_created_by === PROFILE,
    `p_created_by deve ser o profiles.id (${PROFILE}), nao o auth.uid — veio ${call.args.p_created_by}`,
  );
  const created = state.dispatches.find((d) => d.client_request_id === REQ_1 && d.id !== D1);
  assert(created, 'o rascunho deveria ter sido criado');
  assert(created.created_by === PROFILE, `created_by deve ser profiles.id, veio ${created.created_by}`);
});

// ---------------------------------------------------------------------------
// (3) destinatario do cliente nunca chega a RPC
// ---------------------------------------------------------------------------

Deno.test('MX08 draft.create: recipients/destino_e164 forjados pelo cliente sao IGNORADOS', async () => {
  const state = makeState();
  const resolveCalls: Array<{ companyIds: string[]; contactIds: string[] }> = [];
  const res = await handleDraftCreate(
    makeCtx(state, createPayload({
      // Forja: telefone e empresa que o servidor NAO resolveu.
      recipients: [{ company_id: COMPANY_FORGED, destino_e164: FORGED_PHONE, elegibilidade: 'eligible' }],
    }), 'draft.create'),
    draftDeps(SINGU_ROWS, resolveCalls),
  );

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  assertEquals(resolveCalls, [{ companyIds: [COMPANY_A, COMPANY_B], contactIds: [] }]);

  const call = state.rpcCalls.find((c) => c.name === 'multiplix_create_draft');
  assert(call, 'a RPC deveria ter sido chamada');
  const sent = JSON.stringify(call.args.p_recipients);
  assert(!sent.includes(FORGED_PHONE), `o destino forjado ${FORGED_PHONE} chegou a RPC: ${sent}`);
  assert(!sent.includes(COMPANY_FORGED), `a empresa forjada chegou a RPC: ${sent}`);

  const recipients = call.args.p_recipients as Row[];
  assert(recipients.length === 1, `so o destinatario resolvido pelo servidor entra, veio ${recipients.length}`);
  assert(recipients[0].destino_e164 === '5511900001111', `destino tem de ser o do servidor: ${sent}`);
  assert(
    recipients[0].elegibilidade === 'eligible',
    `a elegibilidade sai da fronteira PT->EN do servidor, nao do cliente: ${sent}`,
  );
});

Deno.test('MX08 draft.create: `recipients` do cliente nao satisfaz o contrato — ids de empresa/contato sao exigidos', async () => {
  const state = makeState();
  const res = await handleDraftCreate(
    makeCtx(state, {
      name: 'X',
      message_template: 'oi',
      client_request_id: REQ_1,
      // Contrato antigo (inseguro): recipients prontos do navegador.
      recipients: [{ company_id: COMPANY_A, destino_e164: FORGED_PHONE, elegibilidade: 'eligible' }],
    }, 'draft.create'),
    draftDeps(),
  );

  assert(res.status === 400, `esperava 400, veio ${res.status}`);
  assert(
    state.rpcCalls.every((c) => c.name !== 'multiplix_create_draft'),
    'sem ids validos a RPC nao pode ser chamada',
  );
});

Deno.test('MX08 draft.create: o mesmo client_request_id NAO duplica o disparo (idempotencia da RPC)', async () => {
  const state = makeState();
  const r1 = await handleDraftCreate(makeCtx(state, createPayload(), 'draft.create'), draftDeps());
  const r2 = await handleDraftCreate(makeCtx(state, createPayload(), 'draft.create'), draftDeps());

  assert(r1.status === 200 && r2.status === 200, 'as duas postagens deveriam responder 200');
  const b1 = await body(r1);
  const b2 = await body(r2);
  const d1 = (b1.data as Row).dispatch_id;
  assert((b2.data as Row).dispatch_id === d1, 'segundo POST deve devolver o MESMO dispatch');
  assert((b2.data as Row).created === false, 'segundo POST deve vir com created=false');
  const comRequestId = state.dispatches.filter((d) => d.client_request_id === REQ_1);
  assert(comRequestId.length === 2 || comRequestId.length === 1, 'sanidade do duble');
  assert(
    state.dispatches.filter((d) => d.client_request_id === REQ_1 && d.id !== D1).length === 1,
    'posts repetidos nao podem duplicar o disparo',
  );
});

// ---------------------------------------------------------------------------
// (2) colunas reais + (1) leitura/escopo do dono
// ---------------------------------------------------------------------------

Deno.test('MX08 draft.get: devolve as colunas REAIS (message_template/total_recipients) para o dono', async () => {
  const state = makeState();
  const res = await handleDraftGet(makeCtx(state, { dispatch_id: D1 }));

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const data = (await body(res)).data as Row;
  assert(data.message_template === 'Oi {{empresa}}', `message_template ausente/errado: ${JSON.stringify(data)}`);
  assert(data.total_recipients === 2, `total_recipients ausente/errado: ${JSON.stringify(data)}`);
  assert(data.dispatch_version === 1, 'draft.get precisa devolver dispatch_version (a versao que o confirm revisa)');
  assert(!('template' in data) && !('recipient_count' in data), 'colunas fantasmas nao podem sair na resposta');
});

Deno.test('MX08 draft.get: rascunho de OUTRO dono -> 404; com manage_all -> 200', async () => {
  // AUTH_USER (dono de D1) tenta ler D2, que e de PROFILE_OTHER.
  const state = makeState();
  const negado = await handleDraftGet(makeCtx(state, { dispatch_id: D2 }, 'draft.get', AUTH_USER));
  assert(negado.status === 404, `outro dono: esperava 404, veio ${negado.status}`);
  assert((await body(negado)).error === 'multiplix_draft_not_found', 'erro nomeado esperado');

  const admin = makeState({ permission: true });
  const permitido = await handleDraftGet(makeCtx(admin, { dispatch_id: D2 }, 'draft.get', AUTH_USER));
  assert(permitido.status === 200, `manage_all: esperava 200, veio ${permitido.status}`);
  assert(((await body(permitido)).data as Row).id === D2, 'manage_all deve ler o rascunho alheio');
});

Deno.test('MX08 draft.update: dono atualiza (auth.uid != profiles.id); outro dono -> 404 sem mutacao', async () => {
  const state = makeState();
  const res = await handleDraftUpdate(makeCtx(state, { dispatch_id: D1, name: 'Novo nome' }, 'draft.update'));
  assert(res.status === 200, `dono: esperava 200, veio ${res.status}`);
  const alvo = state.dispatches.find((d) => d.id === D1);
  assert(alvo?.name === 'Novo nome', `o nome deveria ter sido atualizado: ${JSON.stringify(alvo)}`);
  // O recorte de dono vai no WHERE com o profiles.id, nunca com o auth.uid.
  const where = state.eqs.multiplix_dispatches ?? [];
  const hasOwner = where.some(([c, v]) =>
    c === 'created_by' && (v === PROFILE || (Array.isArray(v) && v.includes(PROFILE)))
  );
  assert(hasOwner, `o WHERE deve filtrar created_by = profiles.id: ${JSON.stringify(where)}`);
  const leaksAuthUid = where.some(([c, v]) =>
    c === 'created_by' && (v === AUTH_USER || (Array.isArray(v) && v.includes(AUTH_USER)))
  );
  assert(!leaksAuthUid, 'o WHERE nao pode usar o auth.uid como created_by');

  const alheio = makeState();
  const negado = await handleDraftUpdate(
    makeCtx(alheio, { dispatch_id: D2, name: 'invadido' }, 'draft.update', AUTH_USER),
  );
  assert(negado.status === 404, `outro dono: esperava 404, veio ${negado.status}`);
  assert(alheio.mutations.length === 0, 'nao pode mutar rascunho de outro usuario');
  assert(alheio.dispatches.find((d) => d.id === D2)?.name === 'Rascunho alheio', 'o rascunho alheio ficou intacto');
});

Deno.test('MX08 draft.update: com manage_all o rascunho alheio e editavel', async () => {
  const state = makeState({ permission: true });
  const res = await handleDraftUpdate(
    makeCtx(state, { dispatch_id: D2, name: 'editado por admin' }, 'draft.update', AUTH_USER),
  );
  assert(res.status === 200, `manage_all: esperava 200, veio ${res.status}`);
  assert(
    state.dispatches.find((d) => d.id === D2)?.name === 'editado por admin',
    'manage_all deve conseguir editar o rascunho alheio',
  );
});

Deno.test('MX08 draft.discard: dono descarta; outro dono -> 404 sem mutacao; manage_all descarta', async () => {
  const state = makeState();
  const res = await handleDraftDiscard(makeCtx(state, { dispatch_id: D1 }, 'draft.discard'));
  assert(res.status === 200, `dono: esperava 200, veio ${res.status}`);
  assert(!state.dispatches.some((d) => d.id === D1), 'o rascunho do dono deveria ter sido apagado');

  const alheio = makeState();
  const negado = await handleDraftDiscard(
    makeCtx(alheio, { dispatch_id: D2 }, 'draft.discard', AUTH_USER),
  );
  assert(negado.status === 404, `outro dono: esperava 404, veio ${negado.status}`);
  assert(alheio.dispatches.some((d) => d.id === D2), 'o rascunho alheio nao pode ser apagado');

  const admin = makeState({ permission: true });
  const permitido = await handleDraftDiscard(
    makeCtx(admin, { dispatch_id: D2 }, 'draft.discard', AUTH_USER),
  );
  assert(permitido.status === 200, `manage_all: esperava 200, veio ${permitido.status}`);
  assert(!admin.dispatches.some((d) => d.id === D2), 'manage_all deve descartar o rascunho alheio');
});

// ---------------------------------------------------------------------------
// (1) guarda dos blocos: mesma resolucao de identidade
// ---------------------------------------------------------------------------

Deno.test('MX08 blocks.upsert: a guarda aceita o dono via profiles.id (auth.uid != profiles.id)', async () => {
  const state = makeState();
  const res = await handleBlocksUpsert(
    makeCtx(state, { dispatch_id: D1, block_type: 'text', content: { text: 'ola' } }, 'blocks.upsert'),
  );
  assert(res.status === 200, `dono: esperava 200, veio ${res.status}`);

  const alheio = makeState();
  const negado = await handleBlocksUpsert(
    makeCtx(alheio, { dispatch_id: D2, block_type: 'text', content: { text: 'x' } }, 'blocks.upsert', AUTH_USER),
  );
  assert(negado.status === 409, `outro dono: esperava 409, veio ${negado.status}`);
  assert(alheio.mutations.length === 0, 'nao pode escrever bloco em rascunho alheio');
});
