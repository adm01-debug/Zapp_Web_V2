/**
 * BLOCO E — testes de `dispatch.list` e `recipients.list` (acoes de leitura).
 *
 * Sem rede: o `SupabaseClient` e um duble em memoria que implementa a cadeia
 * PostgREST usada pelos handlers (`.from().select(cols, {count}).eq()...order()
 * .range()` e `.maybeSingle()`) e o `rpc('user_has_permission')`. O duble
 * registra:
 *   - `queried`: tabelas tocadas, na ordem (prova de que o escopo BARRA a leitura);
 *   - `eqs`: os filtros `eq` aplicados na ultima query de cada tabela (prova do
 *     WHERE por dono);
 *   - `count`: o total exato antes do recorte de paginacao.
 *
 * O que os testes provam:
 *   1. ESCOPO — sem a permissao ampla, `dispatch.list` so devolve disparos do
 *      dono (o do outro usuario nunca aparece) e `recipients.list` responde 404
 *      para disparo alheio SEM tocar `multiplix_recipients`.
 *   2. PAGINACAO/LIMITE — `limit`/`offset` recortam na ordem certa, o `total`
 *      do meta e o count exato, e os tetos (200 / 1000) sao recusados com 400.
 */

import { handleDispatchList, handleRecipientsList } from '../listing.ts';
import type { ActionContext } from '../../index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const AUTH_USER = 'auth-user-1';
const AUTH_OTHER = 'auth-user-2';
const PROFILE = 'aaaa0000-0000-4000-8000-000000000001';
const PROFILE_OTHER = 'bbbb0000-0000-4000-8000-000000000002';

const D1 = 'dddddddd-0000-4000-8000-000000000001';
const D2 = 'dddddddd-0000-4000-8000-000000000002';
const D3 = 'dddddddd-0000-4000-8000-000000000003';
const D4 = 'dddddddd-0000-4000-8000-000000000004';

const R1 = 'rrrr0000-0000-4000-8000-000000000001';
const R2 = 'rrrr0000-0000-4000-8000-000000000002';
const R3 = 'rrrr0000-0000-4000-8000-000000000003';
const R4 = 'rrrr0000-0000-4000-8000-000000000004';
const R5 = 'rrrr0000-0000-4000-8000-000000000005';
const RX = 'rrrr0000-0000-4000-8000-000000000099';

/** id de disparo deterministico, valido como UUID (12 digitos no ultimo grupo). */
function dId(n: number): string {
  return `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/**
 * 60 disparos do MESMO dono (PROFILE). O `dId(1)` e o mais ANTIGO (created_at
 * menor) e, portanto, cai na posicao 60 na ordem `created_at desc` — fora dos 50
 * que o `dispatch.list` devolve por padrao.
 */
const MANY_DISPATCHES: Row[] = Array.from({ length: 60 }, (_, i) => ({
  id: dId(i + 1),
  name: `M${i + 1}`,
  status: 'draft',
  created_by: PROFILE,
  created_at: `2026-09-01T00:${String(i).padStart(2, '0')}:00Z`,
  scheduled_at: null,
  dispatch_version: 1,
  total_recipients: 0,
}));

/** O alvo fora dos 50 mais recentes (o defeito que o `dispatch_id` resolve). */
const TARGET_BEYOND_50 = dId(1);

type Row = Record<string, unknown>;

interface FakeState {
  profiles: Row[];
  dispatches: Row[];
  recipients: Row[];
  /** resultado de `user_has_permission(multiplix.dispatch.manage_all)` */
  permission: boolean;
  /** tabelas consultadas, na ordem */
  queried: string[];
  /** ultimos filtros `eq` aplicados por tabela */
  eqs: Record<string, Array<[string, unknown]>>;
}

function makeState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    profiles: [
      { id: PROFILE, user_id: AUTH_USER },
      { id: PROFILE_OTHER, user_id: AUTH_OTHER },
    ],
    dispatches: [
      { id: D1, name: 'D1', status: 'draft', created_by: PROFILE, created_at: '2026-10-01T10:00:00Z', scheduled_at: null, dispatch_version: 1, total_recipients: 5 },
      { id: D2, name: 'D2', status: 'sending', created_by: PROFILE, created_at: '2026-10-01T11:00:00Z', scheduled_at: null, dispatch_version: 2, total_recipients: 3 },
      { id: D3, name: 'D3', status: 'completed', created_by: PROFILE, created_at: '2026-10-01T12:00:00Z', scheduled_at: null, dispatch_version: 3, total_recipients: 1 },
      { id: D4, name: 'OUTRO', status: 'draft', created_by: PROFILE_OTHER, created_at: '2026-10-01T13:00:00Z', scheduled_at: null, dispatch_version: 1, total_recipients: 9 },
    ],
    recipients: [
      { id: R1, dispatch_id: D1, company_id: 'c1', company_name_snapshot: 'Alfa', destino_e164: '5511900000001', singu_contact_id: null, eligibility: 'eligible', eligibility_reason: null, inclusion_reason: null, status: 'sent', sent_at: null, delivered_at: null, created_at: '2026-10-01T10:00:01Z' },
      { id: R2, dispatch_id: D1, company_id: 'c2', company_name_snapshot: 'Beta', destino_e164: '5511900000002', singu_contact_id: null, eligibility: 'eligible', eligibility_reason: null, inclusion_reason: null, status: 'delivered', sent_at: null, delivered_at: null, created_at: '2026-10-01T10:00:02Z' },
      { id: R3, dispatch_id: D1, company_id: 'c3', company_name_snapshot: 'Gama', destino_e164: '5511900000003', singu_contact_id: null, eligibility: 'eligible', eligibility_reason: null, inclusion_reason: null, status: 'failed', sent_at: null, delivered_at: null, created_at: '2026-10-01T10:00:03Z' },
      { id: R4, dispatch_id: D1, company_id: 'c4', company_name_snapshot: 'Delta', destino_e164: '5511900000004', singu_contact_id: null, eligibility: 'eligible', eligibility_reason: null, inclusion_reason: null, status: 'pending', sent_at: null, delivered_at: null, created_at: '2026-10-01T10:00:04Z' },
      { id: R5, dispatch_id: D1, company_id: 'c5', company_name_snapshot: 'Epsilon', destino_e164: '5511900000005', singu_contact_id: null, eligibility: 'eligible', eligibility_reason: null, inclusion_reason: null, status: 'failed', sent_at: null, delivered_at: null, created_at: '2026-10-01T10:00:05Z' },
      { id: RX, dispatch_id: D4, company_id: 'cx', company_name_snapshot: 'Outro', destino_e164: '5511900000099', singu_contact_id: null, eligibility: 'eligible', eligibility_reason: null, inclusion_reason: null, status: 'sent', sent_at: null, delivered_at: null, created_at: '2026-10-01T13:00:01Z' },
    ],
    permission: false,
    queried: [],
    eqs: {},
    ...overrides,
  };
}

/** Duble do Supabase (PostgREST minimo em memoria, com `count` e `range`). */
function makeSupabase(state: FakeState) {
  const tableRows = (table: string): Row[] => {
    if (table === 'profiles') return state.profiles;
    if (table === 'multiplix_dispatches') return state.dispatches;
    if (table === 'multiplix_recipients') return state.recipients;
    return [];
  };

  function from(table: string) {
    state.queried.push(table);
    const eqs: Array<[string, unknown]> = [];
    let orderCol: string | null = null;
    let orderAsc = true;
    let range: [number, number] | null = null;
    let limitN: number | null = null;

    const matching = () => tableRows(table).filter((r) => eqs.every(([c, v]) => r[c] === v));

    const resolve = () => {
      state.eqs[table] = [...eqs];
      let rows = matching();
      if (orderCol) {
        const col = orderCol;
        rows = [...rows].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (orderAsc ? 1 : -1));
      }
      const count = rows.length;
      if (range) rows = rows.slice(range[0], range[1] + 1);
      else if (limitN !== null) rows = rows.slice(0, limitN);
      return { data: rows, error: null, count };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: Record<string, any> = {};
    const chain = () => api;
    api.select = chain;
    api.order = (c: string, o?: { ascending?: boolean }) => {
      orderCol = c;
      orderAsc = o?.ascending !== false;
      return api;
    };
    api.eq = (c: string, v: unknown) => {
      eqs.push([c, v]);
      return api;
    };
    api.range = (fromN: number, toN: number) => {
      range = [fromN, toN];
      return api;
    };
    api.limit = (n: number) => {
      limitN = n;
      return api;
    };
    api.maybeSingle = () => {
      state.eqs[table] = [...eqs];
      const rows = matching();
      return Promise.resolve({ data: rows.length ? rows[0] : null, error: null, count: rows.length });
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.then = (onF: any, onR: any) => Promise.resolve(resolve()).then(onF, onR);
    return api;
  }

  const supabase = {
    from,
    rpc(name: string, _args: Record<string, unknown>) {
      if (name === 'user_has_permission') return Promise.resolve({ data: state.permission, error: null });
      return Promise.resolve({ data: null, error: { message: `rpc nao mockada: ${name}` } });
    },
  };
  return supabase;
}

function makeCtx(state: FakeState, payload: Row, action: string, userId = AUTH_USER): ActionContext {
  return {
    action,
    payload,
    userId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: makeSupabase(state) as any,
    correlationId: 'corr-listing',
    req: new Request('https://zapp-web-v2.vercel.app/functions/v1/multiplix-dispatch', {
      method: 'POST',
      headers: { origin: 'https://zapp-web-v2.vercel.app' },
    }),
  };
}

const body = async (res: Response) => (await res.json()) as Row;

// ---------------------------------------------------------------------------
// dispatch.list — escopo
// ---------------------------------------------------------------------------

Deno.test('dispatch.list escopo: sem permissao ampla so devolve os disparos do dono', async () => {
  const state = makeState();
  const res = await handleDispatchList(makeCtx(state, {}, 'dispatch.list'));

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const json = await body(res);
  const data = json.data as Row[];
  const ids = data.map((r) => r.id);

  assert(data.length === 3, `so os 3 disparos do dono, veio ${data.length}`);
  assert(!ids.includes(D4), `o disparo de OUTRO usuario (${D4}) nao pode aparecer`);
  assert(json.meta !== undefined && (json.meta as Row).limit === 50, 'limit default deve ser 50');

  const where = state.eqs.multiplix_dispatches ?? [];
  assert(
    where.some(([c, v]) => c === 'created_by' && v === PROFILE),
    `o WHERE deveria filtrar created_by=${PROFILE}: ${JSON.stringify(where)}`,
  );
});

Deno.test('dispatch.list escopo: usuario sem profile e sem permissao -> lista vazia (nao consulta a tabela)', async () => {
  const state = makeState();
  const res = await handleDispatchList(makeCtx(state, {}, 'dispatch.list', 'auth-desconhecido'));

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const json = await body(res);
  assert((json.data as Row[]).length === 0, 'sem chave de dono a lista tem de ser vazia');
  assert((json.meta as Row).total === 0, 'total deve ser 0');
  assert(
    !state.queried.includes('multiplix_dispatches'),
    'sem profile e sem permissao a tabela de disparos nao pode ser tocada',
  );
});

Deno.test('dispatch.list escopo: a permissao ampla ve os disparos de qualquer dono', async () => {
  const state = makeState({ permission: true });
  const res = await handleDispatchList(makeCtx(state, {}, 'dispatch.list'));

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const json = await body(res);
  assert((json.data as Row[]).length === 4, `com manage_all ve os 4, veio ${(json.data as Row[]).length}`);

  const where = state.eqs.multiplix_dispatches ?? [];
  assert(
    !where.some(([c]) => c === 'created_by'),
    `com manage_all nao ha filtro de dono: ${JSON.stringify(where)}`,
  );
});

// ---------------------------------------------------------------------------
// dispatch.list — paginacao/limite
// ---------------------------------------------------------------------------

Deno.test('dispatch.list paginacao: limit/offset recortam na ordem created_at desc e total e exato', async () => {
  const state = makeState();
  const res = await handleDispatchList(makeCtx(state, { limit: 2, offset: 1 }, 'dispatch.list'));

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const json = await body(res);
  const meta = json.meta as Row;

  assert(meta.limit === 2 && meta.offset === 1, `meta de paginacao errado: ${JSON.stringify(meta)}`);
  assert(meta.total === 3, `total deveria ser 3 (count exato antes do range), veio ${meta.total}`);

  // desc por created_at: D3, D2, D1 -> offset 1, limit 2 -> [D2, D1]
  const ids = (json.data as Row[]).map((r) => r.id);
  assert(
    JSON.stringify(ids) === JSON.stringify([D2, D1]),
    `recorte fora do contrato: ${JSON.stringify(ids)}`,
  );
});

Deno.test('dispatch.list paginacao: limit acima de 200 e recusado com 400 (sem tocar o banco)', async () => {
  const state = makeState();
  const res = await handleDispatchList(makeCtx(state, { limit: 201 }, 'dispatch.list'));

  assert(res.status === 400, `esperava 400, veio ${res.status}`);
  assert(state.queried.length === 0, `payload invalido nao pode consultar o banco: ${JSON.stringify(state.queried)}`);
});

// ---------------------------------------------------------------------------
// dispatch.list — dispatch_id opcional (um disparo especifico na MESMA rota)
// ---------------------------------------------------------------------------

Deno.test('dispatch.list dispatch_id: disparo de OUTRO dono -> lista vazia e o registro alheio nunca e trazido', async () => {
  const state = makeState();
  const res = await handleDispatchList(makeCtx(state, { dispatch_id: D4 }, 'dispatch.list'));

  // Mesmo comportamento de hoje para ausencia/posse: lista vazia (200), NAO 403
  // nem 404 — o hook trata ausencia como nao-encontrado e a listagem nao pode
  // virar um oraculo de existencia de disparo alheio.
  assert(res.status === 200, `esperava 200 com lista vazia (nao 403/404), veio ${res.status}`);
  const json = await body(res);
  const rows = json.data as Row[];
  assert(rows.length === 0, `disparo de outro usuario nao pode aparecer: ${JSON.stringify(rows.map((r) => r.id))}`);
  assert(!rows.some((r) => r.id === D4), 'o registro alheio nunca pode ser trazido');
  assert((json.meta as Row).total === 0, `total deveria ser 0, veio ${(json.meta as Row).total}`);

  // O id entra no MESMO WHERE do dono: nao houve leitura para depois filtrar.
  const where = state.eqs.multiplix_dispatches ?? [];
  assert(
    where.some(([c, v]) => c === 'id' && v === D4),
    `o id deveria entrar no WHERE: ${JSON.stringify(where)}`,
  );
  assert(
    where.some(([c, v]) => c === 'created_by' && v === PROFILE),
    `o escopo de dono tem de ir no MESMO WHERE: ${JSON.stringify(where)}`,
  );
});

Deno.test('dispatch.list dispatch_id: disparo proprio fora dos 50 mais recentes e encontrado', async () => {
  const state = makeState({ dispatches: MANY_DISPATCHES });

  // Prova do defeito original: SEM `dispatch_id`, o alvo (mais antigo) fica fora
  // dos 50 que a listagem padrao devolve.
  const semId = await handleDispatchList(makeCtx(state, {}, 'dispatch.list'));
  const semIdRows = (await body(semId)).data as Row[];
  assert(
    semIdRows.length === 50 && !semIdRows.some((r) => r.id === TARGET_BEYOND_50),
    `o alvo deveria estar fora dos 50 mais recentes (defeito a resolver)`,
  );

  // COM `dispatch_id`, o filtro por id entra no WHERE e o alvo e encontrado.
  const res = await handleDispatchList(makeCtx(state, { dispatch_id: TARGET_BEYOND_50 }, 'dispatch.list'));
  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const json = await body(res);
  const rows = json.data as Row[];

  assert(rows.length === 1, `no maximo 1 item por id unico, veio ${rows.length}`);
  assert(rows[0].id === TARGET_BEYOND_50, `deveria encontrar o alvo fora dos 50: ${JSON.stringify(rows.map((r) => r.id))}`);
  assert((json.meta as Row).total === 1, `total deveria ser 1, veio ${(json.meta as Row).total}`);

  const where = state.eqs.multiplix_dispatches ?? [];
  assert(
    where.some(([c, v]) => c === 'id' && v === TARGET_BEYOND_50),
    `o id deveria entrar no WHERE: ${JSON.stringify(where)}`,
  );
  assert(
    where.some(([c, v]) => c === 'created_by' && v === PROFILE),
    `o recorte por id e o escopo de dono viajam no MESMO WHERE: ${JSON.stringify(where)}`,
  );
});

Deno.test('dispatch.list dispatch_id: id inexistente -> lista vazia (200), nao 404', async () => {
  const state = makeState();
  const res = await handleDispatchList(
    makeCtx(state, { dispatch_id: 'eeeeeeee-0000-4000-8000-000000000000' }, 'dispatch.list'),
  );

  assert(res.status === 200, `esperava 200 (lista vazia), veio ${res.status}`);
  const json = await body(res);
  assert((json.data as Row[]).length === 0, 'id inexistente nao devolve item');
  assert((json.meta as Row).total === 0, 'total deve ser 0');
});

Deno.test('dispatch.list sem dispatch_id: contrato antigo permanece (sem filtro por id, paginacao normal)', async () => {
  const state = makeState();
  const res = await handleDispatchList(makeCtx(state, { limit: 2, offset: 1 }, 'dispatch.list'));

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const json = await body(res);
  const meta = json.meta as Row;
  assert(meta.limit === 2 && meta.offset === 1, `meta de paginacao inalterado: ${JSON.stringify(meta)}`);
  assert(meta.total === 3, `total deveria continuar 3, veio ${meta.total}`);

  const where = state.eqs.multiplix_dispatches ?? [];
  assert(
    !where.some(([c]) => c === 'id'),
    `sem dispatch_id nao pode haver filtro por id: ${JSON.stringify(where)}`,
  );
  assert(
    where.some(([c, v]) => c === 'created_by' && v === PROFILE),
    `o escopo de dono continua no WHERE: ${JSON.stringify(where)}`,
  );
});

// ---------------------------------------------------------------------------
// recipients.list — escopo
// ---------------------------------------------------------------------------

Deno.test('recipients.list escopo: disparo de OUTRO usuario -> 404 e NAO lista destinatarios', async () => {
  const state = makeState();
  const res = await handleRecipientsList(makeCtx(state, { dispatch_id: D4 }, 'recipients.list'));

  assert(res.status === 404, `esperava 404 (nao 403), veio ${res.status}`);
  const json = await body(res);
  assert(json.error === 'multiplix_dispatch_not_found', `erro nomeado esperado, veio ${JSON.stringify(json)}`);
  assert(
    !state.queried.includes('multiplix_recipients'),
    'nao pode listar destinatarios de disparo alheio',
  );
});

Deno.test('recipients.list escopo: disparo inexistente -> 404 sem consultar destinatarios', async () => {
  const state = makeState();
  const res = await handleRecipientsList(
    makeCtx(state, { dispatch_id: 'eeeeeeee-0000-4000-8000-000000000000' }, 'recipients.list'),
  );
  assert(res.status === 404, `esperava 404, veio ${res.status}`);
  assert(!state.queried.includes('multiplix_recipients'), 'disparo inexistente nao lista destinatarios');
});

Deno.test('recipients.list escopo: a permissao ampla acessa disparo de outro dono', async () => {
  const state = makeState({ permission: true });
  const res = await handleRecipientsList(makeCtx(state, { dispatch_id: D4 }, 'recipients.list'));

  assert(res.status === 200, `esperava 200 com manage_all, veio ${res.status}`);
  const json = await body(res);
  assert((json.data as Row[]).length === 1, 'deve devolver o unico destinatario do disparo');
});

// ---------------------------------------------------------------------------
// recipients.list — paginacao/limite/status
// ---------------------------------------------------------------------------

Deno.test('recipients.list paginacao: limit/offset recortam por created_at asc com total exato', async () => {
  const state = makeState();
  const res = await handleRecipientsList(
    makeCtx(state, { dispatch_id: D1, limit: 2, offset: 1 }, 'recipients.list'),
  );

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const json = await body(res);
  const meta = json.meta as Row;

  assert(meta.limit === 2 && meta.offset === 1, `meta errado: ${JSON.stringify(meta)}`);
  assert(meta.total === 5, `total deveria ser 5, veio ${meta.total}`);
  assert(
    JSON.stringify((json.data as Row[]).map((r) => r.id)) === JSON.stringify([R2, R3]),
    `recorte fora do contrato: ${JSON.stringify((json.data as Row[]).map((r) => r.id))}`,
  );
});

Deno.test('recipients.list: limit default e 500 e o filtro de status entra no WHERE', async () => {
  const state = makeState();
  const res = await handleRecipientsList(
    makeCtx(state, { dispatch_id: D1, status: 'failed' }, 'recipients.list'),
  );

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const json = await body(res);
  assert((json.meta as Row).limit === 500, `limit default deveria ser 500, veio ${(json.meta as Row).limit}`);

  const rows = json.data as Row[];
  assert(rows.length === 2 && rows.every((r) => r.status === 'failed'), `filtro de status falhou: ${JSON.stringify(rows.map((r) => r.status))}`);

  const where = state.eqs.multiplix_recipients ?? [];
  assert(
    where.some(([c, v]) => c === 'status' && v === 'failed'),
    `o status deveria filtrar no WHERE: ${JSON.stringify(where)}`,
  );
});

Deno.test('recipients.list: limit acima de 1000 e recusado com 400', async () => {
  const res = await handleRecipientsList(
    makeCtx(makeState(), { dispatch_id: D1, limit: 1001 }, 'recipients.list'),
  );
  assert(res.status === 400, `esperava 400, veio ${res.status}`);
});

Deno.test('recipients.list: payload sem dispatch_id valido -> 400', async () => {
  const state = makeState();
  const res = await handleRecipientsList(makeCtx(state, { dispatch_id: 'nao-uuid' }, 'recipients.list'));
  assert(res.status === 400, `esperava 400, veio ${res.status}`);
  assert(state.queried.length === 0, 'payload invalido nao pode consultar o banco');
});
