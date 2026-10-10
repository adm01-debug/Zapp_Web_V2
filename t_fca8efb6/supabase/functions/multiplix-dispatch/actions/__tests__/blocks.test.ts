/**
 * F45 — Bloco E: testes de `blocks.upsert | blocks.delete | blocks.reorder`.
 *
 * Sem rede: o `SupabaseClient` e um duble em memoria que implementa exatamente a
 * cadeia PostgREST usada pelos handlers (`.from().select().eq()...maybeSingle()`,
 * `.insert().select()`, `.update().eq().select()`, `.delete().eq().select()`,
 * `.order().limit()`) e registra:
 *   - `mutations`: toda escrita (insert/update/delete) que chegou ao "banco";
 *   - `rpcCalls`: toda chamada de RPC.
 *
 * Os 3 casos exigidos pelo F45:
 *   1. reorder chama a RPC `reorder_multiplix_blocks` com a ordem EXATA e nao
 *      reescreve linha nenhuma pela tabela;
 *   2. `asset_id` e zerado quando o ROTEIRO muda e PRESERVADO quando so o TITULO
 *      muda (o caso que mata a implementacao ingenua: zerar asset em toda edicao);
 *   3. dispatch de outro usuario -> erro nomeado, SEM mutacao.
 */

import { handleBlocksDelete, handleBlocksReorder, handleBlocksUpsert } from '../blocks.ts';
import type { ActionContext } from '../../index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ---------------------------------------------------------------------------
// Duble do Supabase (PostgREST minimo em memoria).
// ---------------------------------------------------------------------------

const DISPATCH = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const BLOCK_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BLOCK_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BLOCK_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ASSET = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type Doc = Record<string, unknown>;

interface Mutation {
  table: string;
  op: 'insert' | 'update' | 'delete';
  payload: unknown;
  filters: Array<[string, unknown]>;
}

function createFakeSupabase(opts: {
  dispatches: Doc[];
  blocks?: Doc[];
  rpcError?: { message: string; code?: string } | null;
}) {
  const tables: Record<string, Doc[]> = {
    multiplix_dispatches: opts.dispatches,
    multiplix_blocks: opts.blocks ?? [],
  };
  const mutations: Mutation[] = [];
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  let seq = 0;
  const genId = () => `${String(++seq).padStart(8, '0')}-1111-4111-8111-${String(seq).padStart(12, '0')}`;

  function from(table: string) {
    const rows = tables[table] ?? (tables[table] = []);
    let op: Mutation['op'] | 'select' = 'select';
    let payload: unknown;
    let orderCol: string | null = null;
    let orderAsc = true;
    let limitN: number | null = null;
    const filters: Array<[string, unknown]> = [];

    const matching = () => rows.filter((r) => filters.every(([c, v]) => r[c] === v));

    const run = (): Doc[] => {
      if (op === 'select') {
        let out = matching();
        if (orderCol) {
          const col = orderCol;
          out = [...out].sort((a, b) => (Number(a[col]) - Number(b[col])) * (orderAsc ? 1 : -1));
        }
        if (limitN !== null) out = out.slice(0, limitN);
        return out;
      }
      if (op === 'insert') {
        const list = Array.isArray(payload) ? (payload as Doc[]) : [payload as Doc];
        const inserted = list.map((r) => ({
          id: genId(),
          created_at: '2026-10-01T00:00:00Z',
          updated_at: '2026-10-01T00:00:00Z',
          ...r,
        }));
        rows.push(...inserted);
        mutations.push({ table, op, payload, filters: [] });
        return inserted;
      }
      if (op === 'update') {
        const targets = matching();
        for (const r of targets) Object.assign(r, payload as Doc, { updated_at: '2026-10-01T01:00:00Z' });
        // PostgREST nao escreve quando o WHERE nao casa: o duble so registra
        // mutacao quando alguma linha foi de fato alterada.
        if (targets.length > 0) mutations.push({ table, op, payload, filters: [...filters] });
        return targets;
      }
      const targets = matching();
      for (const r of targets) rows.splice(rows.indexOf(r), 1);
      if (targets.length > 0) mutations.push({ table, op: 'delete', payload: null, filters: [...filters] });
      return targets;
    };

    const finish = () => {
      const out = run();
      if (out.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
      return { data: out.length ? out[0] : null, error: null };
    };

    const api = {
      select: () => api,
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
      order: (c: string, o?: { ascending?: boolean }) => {
        orderCol = c;
        orderAsc = o?.ascending !== false;
        return api;
      },
      limit: (n: number) => {
        limitN = n;
        return api;
      },
      maybeSingle: () => Promise.resolve(finish()),
    };
    return api;
  }

  const supabase = {
    from,
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (opts.rpcError) return Promise.resolve({ data: null, error: opts.rpcError });
      const ids = (args.p_block_ids as string[]) ?? [];
      return Promise.resolve({
        data: ids.map((id, i) => ({ block_id: id, block_order: i })),
        error: null,
      });
    },
  };

  return { supabase, tables, mutations, rpcCalls };
}

function makeCtx(supabase: unknown, userId: string, payload: Doc): ActionContext {
  return {
    action: 'blocks.upsert',
    payload,
    userId,
    supabase: supabase as ActionContext['supabase'],
    correlationId: 'corr-f45',
    req: new Request('https://zapp-web-v2.vercel.app/functions/v1/multiplix-dispatch', {
      method: 'POST',
    }),
  };
}

function dispatchRow(overrides: Doc = {}): Doc {
  return { id: DISPATCH, status: 'draft', created_by: USER, ...overrides };
}

function seedBlock(overrides: Doc = {}): Doc {
  return {
    id: BLOCK_A,
    dispatch_id: DISPATCH,
    block_type: 'voice_ai',
    block_order: 0,
    content: { text: 'Titulo original', voice: { script: 'Roteiro v1', voice_id: 'voz-1' } },
    content_version: 1,
    asset_id: ASSET,
    personalization_mode: 'same_audio',
    ...overrides,
  };
}

const body = async (res: Response) => (await res.json()) as Doc;

// ---------------------------------------------------------------------------
// (1) reorder -> RPC do F33, com a ordem exata.
// ---------------------------------------------------------------------------

Deno.test('F45 reorder: chama reorder_multiplix_blocks com a ordem exata e nao reordena na tabela', async () => {
  const db = createFakeSupabase({
    dispatches: [dispatchRow()],
    blocks: [
      seedBlock({ id: BLOCK_A, block_order: 0 }),
      seedBlock({ id: BLOCK_B, block_order: 1 }),
      seedBlock({ id: BLOCK_C, block_order: 2 }),
    ],
  });

  const res = await handleBlocksReorder(
    makeCtx(db.supabase, USER, { dispatch_id: DISPATCH, block_ids: [BLOCK_C, BLOCK_A, BLOCK_B] }),
  );

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  assert(db.rpcCalls.length === 1, `deveria chamar a RPC 1x, chamou ${db.rpcCalls.length}`);
  assert(
    db.rpcCalls[0].fn === 'reorder_multiplix_blocks',
    `RPC inesperada: ${db.rpcCalls[0].fn}`,
  );
  assert(
    db.rpcCalls[0].args.p_dispatch_id === DISPATCH,
    `p_dispatch_id inesperado: ${db.rpcCalls[0].args.p_dispatch_id}`,
  );
  assert(
    JSON.stringify(db.rpcCalls[0].args.p_block_ids) === JSON.stringify([BLOCK_C, BLOCK_A, BLOCK_B]),
    `ordem enviada a RPC fora do contrato: ${JSON.stringify(db.rpcCalls[0].args.p_block_ids)}`,
  );
  assert(
    db.mutations.length === 0,
    `a reordenacao nao pode escrever pela tabela, houve ${db.mutations.length} mutacao(oes)`,
  );

  // A resposta reflete a ordem autoritativa que a RPC devolveu.
  const out = await body(res);
  assert(
    JSON.stringify(out.data) ===
      JSON.stringify({
        dispatch_id: DISPATCH,
        order: [
          { block_id: BLOCK_C, block_order: 0 },
          { block_id: BLOCK_A, block_order: 1 },
          { block_id: BLOCK_B, block_order: 2 },
        ],
      }),
    `resposta fora do contrato: ${JSON.stringify(out)}`,
  );
});

Deno.test('F45 reorder: conjunto divergente da RPC vira erro nomeado (nao 500)', async () => {
  const db = createFakeSupabase({
    dispatches: [dispatchRow()],
    blocks: [seedBlock({ id: BLOCK_A }), seedBlock({ id: BLOCK_B, block_order: 1 })],
    rpcError: { message: 'multiplix_block_reorder_set_mismatch', code: '22023' },
  });

  const res = await handleBlocksReorder(
    makeCtx(db.supabase, USER, { dispatch_id: DISPATCH, block_ids: [BLOCK_A, BLOCK_B] }),
  );

  assert(res.status === 409, `esperava 409, veio ${res.status}`);
  assert((await body(res)).error === 'multiplix_block_invalid', 'erro nomeado esperado');
});

Deno.test('F45 reorder: ids duplicados sao recusados antes de qualquer chamada', async () => {
  const db = createFakeSupabase({ dispatches: [dispatchRow()], blocks: [seedBlock()] });
  const res = await handleBlocksReorder(
    makeCtx(db.supabase, USER, { dispatch_id: DISPATCH, block_ids: [BLOCK_A, BLOCK_A] }),
  );
  assert(res.status === 400, `esperava 400, veio ${res.status}`);
  assert((await body(res)).error === 'multiplix_block_invalid', 'erro nomeado esperado');
  assert(db.rpcCalls.length === 0, 'nao pode chamar a RPC com ids duplicados');
});

// ---------------------------------------------------------------------------
// (2) versionamento: roteiro zera asset; titulo NAO.
// ---------------------------------------------------------------------------

Deno.test('F45 versionamento: mudar o ROTEIRO incrementa content_version e zera asset_id', async () => {
  const db = createFakeSupabase({
    dispatches: [dispatchRow()],
    blocks: [seedBlock({ asset_id: ASSET, content_version: 1 })],
  });

  const res = await handleBlocksUpsert(
    makeCtx(db.supabase, USER, {
      dispatch_id: DISPATCH,
      block_id: BLOCK_A,
      content: { voice: { script: 'Roteiro v2' } },
    }),
  );

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const row = db.tables.multiplix_blocks[0] as Doc;
  assert(row.asset_id === null, `roteiro mudou: asset_id deveria ser null, veio ${row.asset_id}`);
  assert(row.content_version === 2, `content_version deveria ir para 2, veio ${row.content_version}`);
  const voice = (row.content as Doc).voice as Doc;
  assert(voice.script === 'Roteiro v2', `roteiro nao atualizou: ${voice.script}`);
  assert(voice.voice_id === 'voz-1', `voice_id deveria ser preservado: ${voice.voice_id}`);
});

Deno.test('F45 versionamento: mudar so o TITULO preserva asset_id (mata a implementacao ingenua)', async () => {
  const db = createFakeSupabase({
    dispatches: [dispatchRow()],
    blocks: [seedBlock({ asset_id: ASSET, content_version: 1 })],
  });

  const res = await handleBlocksUpsert(
    makeCtx(db.supabase, USER, {
      dispatch_id: DISPATCH,
      block_id: BLOCK_A,
      content: { text: 'Titulo novo' },
    }),
  );

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const row = db.tables.multiplix_blocks[0] as Doc;
  // O caso que mata a implementacao ingenua: edicao de titulo NAO invalida audio.
  assert(
    row.asset_id === ASSET,
    `titulo mudou: asset_id NAO pode ser zerado (veio ${row.asset_id})`,
  );
  assert(row.content_version === 2, `content_version deveria ir para 2, veio ${row.content_version}`);
  const voice = (row.content as Doc).voice as Doc;
  assert(voice.script === 'Roteiro v1', `roteiro deveria ficar intacto: ${voice.script}`);
});

Deno.test('F45 versionamento: mudar a VOZ ou o PARAMETRO tambem invalida o ativo', async () => {
  for (
    const patch of [
      { content: { voice: { voice_id: 'voz-2' } } },
      { personalization_mode: 'personalized' },
    ]
  ) {
    const db = createFakeSupabase({
      dispatches: [dispatchRow()],
      blocks: [seedBlock({ asset_id: ASSET, content_version: 3 })],
    });
    const res = await handleBlocksUpsert(
      makeCtx(db.supabase, USER, { dispatch_id: DISPATCH, block_id: BLOCK_A, ...patch }),
    );
    assert(res.status === 200, `esperava 200, veio ${res.status}`);
    const row = db.tables.multiplix_blocks[0] as Doc;
    assert(row.asset_id === null, `patch ${JSON.stringify(patch)} deveria zerar asset_id`);
    assert(row.content_version === 4, `content_version deveria ir para 4, veio ${row.content_version}`);
  }
});

Deno.test('F45 upsert: edicao sem mudanca nao escreve (no-op idempotente)', async () => {
  const db = createFakeSupabase({
    dispatches: [dispatchRow()],
    blocks: [seedBlock({ asset_id: ASSET, content_version: 1 })],
  });
  const res = await handleBlocksUpsert(
    makeCtx(db.supabase, USER, {
      dispatch_id: DISPATCH,
      block_id: BLOCK_A,
      content: { text: 'Titulo original' },
    }),
  );
  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const row = db.tables.multiplix_blocks[0] as Doc;
  assert(row.content_version === 1, `no-op nao pode incrementar a versao, veio ${row.content_version}`);
  assert(row.asset_id === ASSET, 'no-op nao pode tocar o asset');
  assert(db.mutations.length === 0, `no-op nao pode escrever, houve ${db.mutations.length}`);
});

Deno.test('F45 upsert: insercao entra no fim da ordem e comeca na versao 1', async () => {
  const db = createFakeSupabase({
    dispatches: [dispatchRow()],
    blocks: [seedBlock({ id: BLOCK_A, block_order: 0 }), seedBlock({ id: BLOCK_B, block_order: 1 })],
  });
  const res = await handleBlocksUpsert(
    makeCtx(db.supabase, USER, {
      dispatch_id: DISPATCH,
      block_type: 'text',
      content: { text: 'Novo bloco' },
    }),
  );
  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const inserted = db.tables.multiplix_blocks.find((r) => r.block_type === 'text') as Doc;
  assert(inserted !== undefined, 'o bloco text deveria ter sido inserido');
  assert(inserted.block_order === 2, `deveria entrar no fim (2), veio ${inserted.block_order}`);
  assert(inserted.content_version === 1, `versao inicial deveria ser 1, veio ${inserted.content_version}`);
  assert(inserted.asset_id === null, `bloco novo sem asset: ${inserted.asset_id}`);
});

Deno.test('F45 upsert: insercao sem block_type e recusada com erro nomeado', async () => {
  const db = createFakeSupabase({ dispatches: [dispatchRow()], blocks: [] });
  const res = await handleBlocksUpsert(
    makeCtx(db.supabase, USER, { dispatch_id: DISPATCH, content: { text: 'sem tipo' } }),
  );
  assert(res.status === 400, `esperava 400, veio ${res.status}`);
  assert((await body(res)).error === 'multiplix_block_invalid', 'erro nomeado esperado');
  assert(db.mutations.length === 0, 'nao pode escrever sem block_type');
});

// ---------------------------------------------------------------------------
// (3) escopo: dispatch de outro usuario (ou fora de draft) -> erro, sem mutacao.
// ---------------------------------------------------------------------------

Deno.test('F45 escopo: upsert em dispatch de OUTRO usuario falha nomeado e sem mutacao', async () => {
  const db = createFakeSupabase({
    dispatches: [dispatchRow({ created_by: OTHER })],
    blocks: [seedBlock()],
  });

  const res = await handleBlocksUpsert(
    makeCtx(db.supabase, USER, {
      dispatch_id: DISPATCH,
      block_id: BLOCK_A,
      content: { voice: { script: 'invadido' } },
    }),
  );

  assert(res.status === 409, `esperava 409, veio ${res.status}`);
  assert(
    (await body(res)).error === 'multiplix_dispatch_not_editable',
    'erro nomeado esperado: multiplix_dispatch_not_editable',
  );
  assert(db.mutations.length === 0, `nao pode mutar dispatch de outro usuario (${db.mutations.length})`);
  const row = db.tables.multiplix_blocks[0] as Doc;
  assert(row.asset_id === ASSET, 'o bloco de outro usuario nao pode ser tocado');
  assert((row.content as Doc).voice !== undefined, 'conteudo alheio intacto');
});

Deno.test('F45 escopo: delete e reorder fora de draft tambem falham, sem mutacao', async () => {
  for (const status of ['scheduled', 'sending']) {
    const db = createFakeSupabase({
      dispatches: [dispatchRow({ status })],
      blocks: [seedBlock()],
    });
    const del = await handleBlocksDelete(
      makeCtx(db.supabase, USER, { dispatch_id: DISPATCH, block_id: BLOCK_A }),
    );
    assert(del.status === 409, `delete em '${status}': esperava 409, veio ${del.status}`);
    assert((await body(del)).error === 'multiplix_dispatch_not_editable', 'erro nomeado no delete');

    const reo = await handleBlocksReorder(
      makeCtx(db.supabase, USER, { dispatch_id: DISPATCH, block_ids: [BLOCK_A] }),
    );
    assert(reo.status === 409, `reorder em '${status}': esperava 409, veio ${reo.status}`);
    assert((await body(reo)).error === 'multiplix_dispatch_not_editable', 'erro nomeado no reorder');

    assert(db.mutations.length === 0, `estado '${status}': nenhuma mutacao permitida`);
    assert(db.rpcCalls.length === 0, `estado '${status}': a RPC nao pode ser chamada`);
  }
});

Deno.test('F45 escopo: bloco de outro dispatch nao e encontrado (sem tocar o alvo)', async () => {
  const db = createFakeSupabase({
    dispatches: [dispatchRow()],
    blocks: [seedBlock({ id: BLOCK_A })],
  });
  const res = await handleBlocksDelete(
    makeCtx(db.supabase, USER, { dispatch_id: DISPATCH, block_id: BLOCK_B }),
  );
  assert(res.status === 404, `esperava 404, veio ${res.status}`);
  assert((await body(res)).error === 'multiplix_block_not_found', 'erro nomeado esperado');
  assert(db.mutations.length === 0, 'bloco inexistente nao gera delete');
  assert(db.tables.multiplix_blocks.length === 1, 'o bloco existente permanece');
});

Deno.test('F45: payload invalido vira multiplix_block_invalid (nunca 500)', async () => {
  const db = createFakeSupabase({ dispatches: [dispatchRow()] });
  const res = await handleBlocksUpsert(makeCtx(db.supabase, USER, { dispatch_id: 'nao-uuid' }));
  assert(res.status === 400, `esperava 400, veio ${res.status}`);
  assert((await body(res)).error === 'multiplix_block_invalid', 'erro nomeado esperado');
});
