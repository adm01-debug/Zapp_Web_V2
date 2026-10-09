/**
 * F51/F52 — testes dos handlers `confirm` e `status` do Multiplix (Bloco E).
 *
 * DUBLES: um cliente Supabase em memoria cujo
 * `rpc('multiplix_confirm_dispatch', ...)` modela o CONTRATO da RPC SQL —
 * UMA transacao + idempotencia por `(dispatch_id, dispatch_version)`. O fake
 * NAO e um `resolver` do teste: ele e burro de proposito (faz o minimo do
 * contrato) e um conjunto de asserts prova o que o HANDLER faz com ele:
 *
 *   1) 5 POSTs de `confirm` = 1 confirmacao. O handler NAO pode reenviar uma
 *      versao diferente a cada clique (se reenviasse `dispatch_version+1` a
 *      cada chamada, o fake materializaria 5x e este teste cairia).
 *   2) falha no meio da materializacao = 0 itens E o handler NUNCA insere item
 *      direto: `insertCalls === 0`. A atomicidade e da RPC (1 chamada), nao do
 *      TS — e o fake modela o rollback descartando o staging.
 *   3) `status` devolve sent, delivered, read e replied SEPARADOS (4 chaves
 *      distintas, sem colapsar em um unico "sent").
 *
 * Estilo do teste segue `supabase/functions/multiplix-send/index.test.ts`:
 * `assert` proprio (sem dependencia externa) e builder "thenable" que imita a
 * cadeia do PostgREST.
 */

import { handleConfirm, handleStatus } from '../lifecycle.ts';
import type { ActionContext } from '../../index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const DISPATCH_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const USER_ID = 'user-do-jwt';
const PROFILE_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const CONN_ID = 'cccccccc-0000-4000-8000-000000000003';

type Row = Record<string, unknown>;

interface FakeState {
  dispatch: Row;
  recipients: Row[];
  blocks: Row[];
  items: Row[];
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  /** quantas vezes o HANDLER chamou .insert() em qualquer tabela (deve ser 0) */
  insertCalls: number;
  permission: boolean;
  /** se definido, a RPC falha na k-esima insercao (teste de falha-no-meio) */
  failAtItem?: number;
}

function makeState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    dispatch: {
      id: DISPATCH_ID,
      created_by: PROFILE_ID,
      status: 'draft',
      dispatch_version: 1,
      scheduled_at: null,
      whatsapp_connection_id: CONN_ID,
      total_recipients: 2,
    },
    recipients: [
      { id: 'r1', dispatch_id: DISPATCH_ID, destino_e164: '5511900000001', company_id: 'c1', company_name_snapshot: 'Alfa', eligibility: 'eligible' },
      { id: 'r2', dispatch_id: DISPATCH_ID, destino_e164: '5511900000002', company_id: 'c2', company_name_snapshot: 'Beta', eligibility: 'eligible' },
    ],
    blocks: [
      { id: 'b1', dispatch_id: DISPATCH_ID, block_order: 0, block_type: 'text', content_version: 1 },
      { id: 'b2', dispatch_id: DISPATCH_ID, block_order: 1, block_type: 'text', content_version: 1 },
      { id: 'b3', dispatch_id: DISPATCH_ID, block_order: 2, block_type: 'voice_ai', content_version: 1 },
    ],
    items: [],
    rpcCalls: [],
    insertCalls: 0,
    permission: false,
    ...overrides,
  };
}

/** Resumo da resposta idempotente (o que a RPC devolve quando ja confirmado). */
function summaryOf(state: FakeState, version: number, created: boolean): Row {
  return {
    dispatch_id: state.dispatch.id,
    dispatch_version: version,
    status: state.dispatch.status,
    scheduled_at: state.dispatch.scheduled_at,
    recipient_count: state.recipients.length,
    block_count: state.blocks.length,
    items_created: created ? state.items.length : 0,
    items_total: state.items.length,
    created,
  };
}

/**
 * Modela o CONTRATO da RPC SQL `multiplix_confirm_dispatch`:
 *  - candidata = p_expected_version + 1 (a versao vem do CLIENTE, nao de um
 *    contador do servidor — e o que torna 5 cliques = 1 confirmacao);
 *  - ja existe item com a versao candidata -> idempotente (created=false);
 *  - ja confirmado em OUTRA versao -> erro nomeado;
 *  - caso contrario: staging (transacao) e commit; qualquer falha descarta o
 *    staging inteiro (rollback), como o Postgres faria.
 */
function fakeConfirm(state: FakeState, args: Record<string, unknown>): { data: unknown; error: unknown } {
  const expected = Number(args.p_expected_version);
  const candidate = expected + 1;
  const confirmedVersion = state.items.reduce((m, it) => Math.max(m, Number(it.dispatch_version) || 0), 0);

  if (confirmedVersion > 0) {
    if (confirmedVersion === candidate) {
      return { data: [summaryOf(state, candidate, false)], error: null };
    }
    return { data: null, error: { message: 'multiplix_dispatch_already_confirmed' } };
  }

  const staging: Row[] = [];
  let n = 0;
  for (const r of state.recipients) {
    if (r.eligibility !== 'eligible') continue;
    for (const b of state.blocks) {
      n += 1;
      if (state.failAtItem !== undefined && n === state.failAtItem) {
        // ROLLBACK: nada do staging vira estado (a transacao SQL inteira cai).
        return { data: null, error: { message: 'multiplix_confirm_materialization_failed' } };
      }
      staging.push({
        dispatch_id: state.dispatch.id,
        recipient_id: r.id,
        block_id: b.id,
        dispatch_version: candidate,
        status: 'pending',
        replied_at: null,
      });
    }
  }
  if (staging.length === 0) {
    return { data: null, error: { message: 'multiplix_confirm_no_eligible_recipients' } };
  }
  // COMMIT
  state.items.push(...staging);
  state.dispatch = {
    ...state.dispatch,
    dispatch_version: candidate,
    status: args.p_scheduled_at ? 'scheduled' : 'sending',
  };
  return { data: [summaryOf(state, candidate, true)], error: null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tableBuilder(table: string, state: FakeState): any {
  const eqs: Array<[string, unknown]> = [];
  let range: [number, number] | null = null;

  const rows = (): { data: unknown; error: unknown } => {
    if (table === 'multiplix_dispatches') {
      const hit = eqs.every(([c, v]) => state.dispatch[c] === v);
      return { data: hit ? state.dispatch : null, error: null };
    }
    if (table === 'profiles') return { data: { id: state.dispatch.created_by }, error: null };
    let base: Row[] = [];
    if (table === 'multiplix_recipients') base = state.recipients;
    else if (table === 'multiplix_blocks') base = state.blocks;
    else if (table === 'multiplix_delivery_items') base = state.items;
    else return { data: [], error: null };
    const filtered = base.filter((r) => eqs.every(([c, v]) => r[c] === v));
    if (range) return { data: filtered.slice(range[0], range[1] + 1), error: null };
    return { data: filtered, error: null };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: Record<string, any> = {};
  const chain = () => b;
  b.select = chain; b.order = chain; b.in = chain; b.is = chain; b.or = chain; b.delete = chain;
  b.eq = (c: string, v: unknown) => { eqs.push([c, v]); return b; };
  b.range = (from: number, to: number) => { range = [from, to]; return b; };
  b.limit = (n: number) => { range = [0, Math.max(0, n - 1)]; return b; };
  b.insert = () => { state.insertCalls += 1; return b; };
  b.maybeSingle = () => Promise.resolve(rows());
  b.single = () => Promise.resolve(rows());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b.then = (onFulfilled: any, onRejected: any) => Promise.resolve(rows()).then(onFulfilled, onRejected);
  return b;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSupabase(state: FakeState): any {
  return {
    rpc(name: string, args: Record<string, unknown> = {}) {
      state.rpcCalls.push({ name, args });
      if (name === 'user_has_permission') return Promise.resolve({ data: state.permission, error: null });
      if (name === 'multiplix_confirm_dispatch') return Promise.resolve(fakeConfirm(state, args));
      return Promise.resolve({ data: null, error: { message: `rpc nao mockada: ${name}` } });
    },
    from(table: string) {
      return tableBuilder(table, state);
    },
  };
}

function makeCtx(state: FakeState, payload: Record<string, unknown>, action = 'confirm'): ActionContext {
  return {
    action,
    payload,
    userId: USER_ID,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: makeSupabase(state) as any,
    correlationId: '11111111-1111-4111-8111-111111111111',
    req: new Request('https://edge.test/multiplix-dispatch', { method: 'POST' }),
  };
}

// ---------------------------------------------------------------------------
// F51 — confirm
// ---------------------------------------------------------------------------

Deno.test('F51 confirm: 5 POSTs com a MESMA dispatch_version = 1 confirmacao', async () => {
  const state = makeState();
  const body = { dispatch_id: DISPATCH_ID, dispatch_version: 1 };

  const results: Array<{ created: boolean; version: number; items: number }> = [];
  for (let i = 0; i < 5; i++) {
    const res = await handleConfirm(makeCtx(state, body));
    assert(res.status === 200, `confirm #${i + 1}: esperado 200, recebido ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    results.push({
      created: json.data.created === true,
      version: json.data.dispatch_version,
      items: json.data.items_total,
    });
  }

  const created = results.filter((r) => r.created === true);
  assert(created.length === 1, `esperado exatamente 1 confirmacao, recebidas ${created.length}`);
  assert(results.every((r) => r.version === 2), `todas as respostas devem trazer dispatch_version=2: ${JSON.stringify(results)}`);
  assert(results.every((r) => r.items === 6), `2 destinatarios x 3 blocos = 6 itens em TODAS as respostas: ${JSON.stringify(results)}`);

  // A versao revisada foi reenviada intacta em TODAS as 5 chamadas: se o handler
  // tivesse inventado uma versao nova por clique, a RPC teria materializado 5x.
  const confirmCalls = state.rpcCalls.filter((c) => c.name === 'multiplix_confirm_dispatch');
  assert(confirmCalls.length === 5, `esperadas 5 chamadas a RPC, recebidas ${confirmCalls.length}`);
  assert(
    confirmCalls.every((c) => c.args.p_expected_version === 1),
    `p_expected_version deve ser sempre 1: ${JSON.stringify(confirmCalls.map((c) => c.args.p_expected_version))}`,
  );
  assert(state.items.length === 6, `o banco deve ter 6 itens (nao 5x6): ${state.items.length}`);
  assert(state.dispatch.dispatch_version === 2, `dispatch_version deve ser 2: ${state.dispatch.dispatch_version}`);
  assert(state.dispatch.status === 'sending', `status deve ser sending: ${state.dispatch.status}`);
  assert(state.insertCalls === 0, `o handler NAO pode inserir item direto (insertCalls=${state.insertCalls})`);
});

Deno.test('F51 confirm: falha no meio da materializacao = 0 itens (atomicidade da RPC)', async () => {
  // 2 destinatarios x 3 blocos = 6 itens; a RPC falha na 4a insercao.
  const state = makeState({ failAtItem: 4 });

  const res = await handleConfirm(makeCtx(state, { dispatch_id: DISPATCH_ID, dispatch_version: 1 }));
  assert(res.status >= 400, `esperado erro (>=400), recebido ${res.status}`);

  assert(state.items.length === 0, `falha no meio deve deixar 0 itens (rollback), nao ${state.items.length}`);
  assert(state.insertCalls === 0, `o handler NAO pode tocar a tabela de itens (insertCalls=${state.insertCalls})`);

  const confirmCalls = state.rpcCalls.filter((c) => c.name === 'multiplix_confirm_dispatch');
  assert(confirmCalls.length === 1, `a materializacao e UMA operacao atomica: 1 chamada a RPC, ${confirmCalls.length} feitas`);
  assert(state.dispatch.dispatch_version === 1, `dispatch_version nao pode avancar com a transacao abortada: ${state.dispatch.dispatch_version}`);
  assert(state.dispatch.status === 'draft', `status nao pode sair de draft com a transacao abortada: ${state.dispatch.status}`);
});

Deno.test('F51 confirm: revisao desatualizada (versao != dispatch_version atual) -> 409 nomeado', async () => {
  const state = makeState();
  // RPC recusa versao velha com erro nomeado.
  state.rpcCalls.push({ name: 'noop', args: {} });
  const originalRpc = state.rpcCalls;
  assert(originalRpc.length === 1, 'sanidade do duble');

  // Simula a RPC devolvendo `multiplix_dispatch_review_stale`.
  const staleState = makeState();
  const supabase = makeSupabase(staleState);
  const original = supabase.rpc;
  supabase.rpc = (name: string, args: Record<string, unknown>) => {
    if (name === 'multiplix_confirm_dispatch') {
      return Promise.resolve({ data: null, error: { message: 'multiplix_dispatch_review_stale' } });
    }
    return original(name, args);
  };

  const ctx: ActionContext = {
    action: 'confirm',
    payload: { dispatch_id: DISPATCH_ID, dispatch_version: 1 },
    userId: USER_ID,
    supabase,
    correlationId: '11111111-1111-4111-8111-111111111111',
    req: new Request('https://edge.test/multiplix-dispatch', { method: 'POST' }),
  };
  const res = await handleConfirm(ctx);
  assert(res.status === 409, `esperado 409, recebido ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await res.json() as any;
  assert(
    String(json.error).includes('multiplix_dispatch_review_stale'),
    `erro nomeado esperado, recebido ${JSON.stringify(json)}`,
  );
  assert(staleState.items.length === 0, 'revisao desatualizada nao pode materializar item');
});

// ---------------------------------------------------------------------------
// F52 — status
// ---------------------------------------------------------------------------

Deno.test('F52 status: sent, delivered, read e replied SEPARADOS (4 chaves)', async () => {
  const state = makeState({
    dispatch: {
      id: DISPATCH_ID, created_by: PROFILE_ID, status: 'sending', dispatch_version: 2,
      scheduled_at: null, whatsapp_connection_id: CONN_ID, total_recipients: 2,
      sent_count: 1, delivered_count: 1, failed_count: 0, outcome_unknown_count: 0,
    },
    items: [
      // 1 item APENAS enviado
      { id: 'i1', dispatch_id: DISPATCH_ID, recipient_id: 'r1', block_id: 'b1', dispatch_version: 2, status: 'sent', sent_at: '2026-10-01T10:00:00Z', delivered_at: null, read_at: null, replied_at: null },
      // 1 item entregue (nao lido)
      { id: 'i2', dispatch_id: DISPATCH_ID, recipient_id: 'r1', block_id: 'b2', dispatch_version: 2, status: 'delivered', sent_at: '2026-10-01T10:00:01Z', delivered_at: '2026-10-01T10:00:05Z', read_at: null, replied_at: null },
      // 1 item lido, sem resposta
      { id: 'i3', dispatch_id: DISPATCH_ID, recipient_id: 'r2', block_id: 'b1', dispatch_version: 2, status: 'read', sent_at: '2026-10-01T10:00:02Z', delivered_at: '2026-10-01T10:00:06Z', read_at: '2026-10-01T10:00:09Z', replied_at: null },
      // 1 item lido E respondido
      { id: 'i4', dispatch_id: DISPATCH_ID, recipient_id: 'r2', block_id: 'b3', dispatch_version: 2, status: 'read', sent_at: '2026-10-01T10:00:03Z', delivered_at: '2026-10-01T10:00:07Z', read_at: '2026-10-01T10:00:10Z', replied_at: '2026-10-01T10:05:00Z' },
      // 1 item pendente (fila)
      { id: 'i5', dispatch_id: DISPATCH_ID, recipient_id: 'r2', block_id: 'b2', dispatch_version: 2, status: 'pending', sent_at: null, delivered_at: null, read_at: null, replied_at: null },
    ],
  });

  const res = await handleStatus(makeCtx(state, { dispatch_id: DISPATCH_ID }, 'status'));
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await res.json() as any;
  const agg = json.data.aggregate;

  // Exatamente 4 campos distintos, presentes na resposta.
  for (const key of ['sent', 'delivered', 'read', 'replied']) {
    assert(typeof agg[key] === 'number', `aggregate.${key} deve ser numero, veio ${typeof agg[key]}`);
  }
  assert(agg.sent === 1, `sent = 1 (so o item 'sent'), veio ${agg.sent}`);
  assert(agg.delivered === 1, `delivered = 1 (so o item 'delivered'), veio ${agg.delivered}`);
  assert(agg.read === 2, `read = 2 (os dois itens lidos), veio ${agg.read}`);
  assert(agg.replied === 1, `replied = 1 (so o item com replied_at), veio ${agg.replied}`);

  // Prova de NAO colapso: se os 4 fossem o mesmo balde, estes pares seriam iguais.
  assert(agg.read !== agg.replied, 'read e replied nao podem colapsar (2 vs 1)');
  assert(agg.sent !== agg.read, 'sent e read nao podem colapsar (1 vs 2)');
  assert(agg.delivered !== agg.read, 'delivered e read nao podem colapsar (1 vs 2)');

  assert(agg.total_items === 5, `total_items = 5, veio ${agg.total_items}`);
  assert(agg.pending === 1, `pending = 1, veio ${agg.pending}`);

  // por destinatario e por bloco
  assert(Array.isArray(json.data.by_recipient) && json.data.by_recipient.length === 2, 'by_recipient deve ter 2 destinatarios');
  assert(Array.isArray(json.data.by_block) && json.data.by_block.length === 3, 'by_block deve ter 3 blocos');

  const r1 = json.data.by_recipient.find((x: Row) => x.recipient_id === 'r1');
  const r2 = json.data.by_recipient.find((x: Row) => x.recipient_id === 'r2');
  assert(r1.sent === 1 && r1.delivered === 1, `r1 deve ter sent=1,delivered=1: ${JSON.stringify(r1)}`);
  assert(r2.read === 2 && r2.replied === 1, `r2 deve ter read=2,replied=1: ${JSON.stringify(r2)}`);

  const b1 = json.data.by_block.find((x: Row) => x.block_id === 'b1');
  assert(b1.sent === 1 && b1.read === 1, `b1 deve ter sent=1,read=1: ${JSON.stringify(b1)}`);

  // A soma por bloco = agregado (o corte por bloco e um corte do mesmo conjunto).
  const sumSent = json.data.by_block.reduce((s: number, x: Row) => s + Number(x.sent), 0);
  assert(sumSent === agg.sent, `soma de sent por bloco = agregado (${sumSent} vs ${agg.sent})`);
});

Deno.test('F52 status: por destinatario, horario e atribuicao do retorno (linked e inferred)', async () => {
  const state = makeState({
    dispatch: {
      id: DISPATCH_ID, created_by: PROFILE_ID, status: 'sending', dispatch_version: 2,
      scheduled_at: null, whatsapp_connection_id: CONN_ID, total_recipients: 3,
      sent_count: 2, delivered_count: 2, failed_count: 0, outcome_unknown_count: 0,
    },
    recipients: [
      { id: 'r1', dispatch_id: DISPATCH_ID, destino_e164: '5511900000001', company_id: 'c1', company_name_snapshot: 'Alfa', eligibility: 'eligible' },
      { id: 'r2', dispatch_id: DISPATCH_ID, destino_e164: '5511900000002', company_id: 'c2', company_name_snapshot: 'Beta', eligibility: 'eligible' },
      { id: 'r3', dispatch_id: DISPATCH_ID, destino_e164: '5511900000003', company_id: 'c3', company_name_snapshot: 'Gama', eligibility: 'eligible' },
    ],
    items: [
      // r1: retorno com correlacao EXATA (`linked`, external_id casou).
      { id: 'i1', dispatch_id: DISPATCH_ID, recipient_id: 'r1', block_id: 'b1', dispatch_version: 2, status: 'read', sent_at: '2026-10-01T10:00:00Z', delivered_at: '2026-10-01T10:00:05Z', read_at: '2026-10-01T10:00:09Z', replied_at: '2026-10-01T10:05:00Z', reply_attribution: 'linked' },
      // r2: retorno com correlacao por janela + telefone (`inferred`).
      { id: 'i2', dispatch_id: DISPATCH_ID, recipient_id: 'r2', block_id: 'b1', dispatch_version: 2, status: 'read', sent_at: '2026-10-01T10:00:01Z', delivered_at: '2026-10-01T10:00:06Z', read_at: '2026-10-01T10:00:10Z', replied_at: '2026-10-01T10:06:30Z', reply_attribution: 'inferred' },
      // r2: 2o item SEM resposta — nao pode apagar nem zerar o retorno ja lido.
      { id: 'i3', dispatch_id: DISPATCH_ID, recipient_id: 'r2', block_id: 'b2', dispatch_version: 2, status: 'delivered', sent_at: '2026-10-01T10:00:02Z', delivered_at: '2026-10-01T10:00:07Z', read_at: null, replied_at: null, reply_attribution: null },
      // r1: 2o retorno MAIS TARDE — o corte por destinatario reporta o PRIMEIRO retorno (10:05:00).
      { id: 'i4', dispatch_id: DISPATCH_ID, recipient_id: 'r1', block_id: 'b2', dispatch_version: 2, status: 'read', sent_at: '2026-10-01T10:00:03Z', delivered_at: '2026-10-01T10:00:08Z', read_at: '2026-10-01T10:00:11Z', replied_at: '2026-10-01T10:20:00Z', reply_attribution: 'linked' },
    ],
  });

  const res = await handleStatus(makeCtx(state, { dispatch_id: DISPATCH_ID }, 'status'));
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await res.json() as any;

  const r1 = json.data.by_recipient.find((x: Row) => x.recipient_id === 'r1');
  const r2 = json.data.by_recipient.find((x: Row) => x.recipient_id === 'r2');
  const r3 = json.data.by_recipient.find((x: Row) => x.recipient_id === 'r3');

  // r1: horario E atribuicao do retorno exato (o 1o retorno, nao o de 10:20).
  assert(r1.replied_at === '2026-10-01T10:05:00Z', `r1.replied_at = 1o retorno, veio ${JSON.stringify(r1.replied_at)}`);
  assert(r1.reply_attribution === 'linked', `r1.reply_attribution = 'linked', veio ${JSON.stringify(r1.reply_attribution)}`);

  // r2: retorno inferido, mesmo com o 2o item sem resposta.
  assert(r2.replied_at === '2026-10-01T10:06:30Z', `r2.replied_at, veio ${JSON.stringify(r2.replied_at)}`);
  assert(r2.reply_attribution === 'inferred', `r2.reply_attribution = 'inferred', veio ${JSON.stringify(r2.reply_attribution)}`);

  // r3: sem retorno -> campos presentes e NULOS (a tela distingue "sem resposta" de "campo ausente").
  assert(r3.replied_at === null, `r3.replied_at deve ser null, veio ${JSON.stringify(r3.replied_at)}`);
  assert(r3.reply_attribution === null, `r3.reply_attribution deve ser null, veio ${JSON.stringify(r3.reply_attribution)}`);

  // Compatibilidade: os campos/contadores atuais seguem intactos e independentes do horario.
  assert(r1.replied === 2, `r1.replied = 2 (os dois itens respondidos), veio ${r1.replied}`);
  assert(r2.replied === 1, `r2.replied = 1, veio ${r2.replied}`);
  assert(r3.replied === 0, `r3.replied = 0, veio ${r3.replied}`);
  assert(json.data.aggregate.replied === 3, `aggregate.replied = 3, veio ${json.data.aggregate.replied}`);
  assert(r1.destino_e164 === '5511900000001' && r1.company_name === 'Alfa', 'campos atuais do destinatario preservados');
});
