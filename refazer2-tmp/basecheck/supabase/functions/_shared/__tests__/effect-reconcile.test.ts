/**
 * IA-047 — contrato executável do CONFIRMADOR de efeitos externos
 * (`_shared/effect-reconcile.ts`).
 *
 * O que fica travado:
 *   1. confirmado (recibo durável OU sonda de LEITURA) → handler `succeeded`
 *      e a linha de origem é atualizada para o estado confirmado;
 *   2. não confirmado e ainda cabe tentativa → `partial` (o job NÃO é terminal:
 *      o reaper devolve à fila e o próximo tick tenta de novo);
 *   3. esgotou → `EffectReconcileError('UNCONFIRMED')` (o worker converte em
 *      `failed/UNCONFIRMED`) e a origem fica intacta em `outcome_unknown`;
 *   4. NUNCA REENVIA: com um espião de `fetch`, a execução não faz NENHUMA
 *      chamada a rota de envio (`/message/send*`, `/send/*`) — só leitura;
 *   5. enfileiramento idempotente: a MESMA chave estável
 *      `reconcile:<efeito>:<id>` (o UNIQUE de `ai_jobs` deduplica).
 *
 * Roda sem rede e sem banco: o client Supabase e o `fetch` entram por injeção.
 * Comando do CI:
 *   deno test --config scripts/ci/deno.json --frozen --allow-env <este arquivo>
 */

import {
  EFFECT_MESSAGE_SEND,
  EFFECT_RECONCILE_KIND,
  EffectReconcileError,
  buildEffectReconcileKey,
  enqueueEffectReconcile,
  handleEffectReconcile,
  makeEffectReconcileDeps,
  type EffectReconcileContext,
  type EffectReconcileInput,
} from "../effect-reconcile.ts";
import { HANDLERS } from "../../ai-jobs-worker/index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} — esperado ${String(expected)}, recebido ${String(actual)}`);
  }
}

const MESSAGE_ID = "11111111-1111-1111-1111-111111111111";

/** Job no formato do worker (lease/estados/prioridade). */
function makeJob(attemptCount: number, maxAttempts: number) {
  return { id: "job-1", status: "running" as const, attemptCount, maxAttempts, leaseToken: "lease-1", priority: 100 };
}

/** Payload do job `effect.reconcile`. */
function makePayload(sourceId = MESSAGE_ID) {
  return {
    effect: EFFECT_MESSAGE_SEND,
    source_table: "messages",
    source_id: sourceId,
    external_id: null as string | null,
    attempt_from: 1,
  };
}

function makeInput(payload: Record<string, unknown>, attemptCount: number, maxAttempts: number): EffectReconcileInput {
  return { job: makeJob(attemptCount, maxAttempts), kind: EFFECT_RECONCILE_KIND, payload, functionName: "ai-jobs-worker", userId: null };
}

/* --------------------------------------------------------------------------- */
/* Stub do client Supabase (PostgREST): encadeamento fluente + rpc espiada.     */
/* --------------------------------------------------------------------------- */

interface RpcCall { fn: string; args: Record<string, unknown>; }

// deno-lint-ignore no-explicit-any
function makeStubClient(tables: Record<string, unknown>, rpcResult: { data: unknown; error: { message?: string; code?: string } | null } = { data: null, error: null }) {
  const rpcCalls: RpcCall[] = [];
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      return Promise.resolve(rpcResult);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(table: string): any {
      const row = tables[table] ?? null;
      const chain: Record<string, unknown> = {};
      const pass = () => chain;
      for (const m of ["select", "eq", "in", "is", "not", "order", "limit", "gte", "lte", "neq", "or", "range", "update", "insert", "upsert", "delete"]) {
        chain[m] = pass;
      }
      chain.maybeSingle = () => Promise.resolve({ data: row, error: null });
      chain.single = () => Promise.resolve({ data: row, error: null });
      chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: row === null ? [] : [row], error: null }).then(res, rej);
      return chain;
    },
  };
  return { client, rpcCalls };
}

/** `fetch` espião: grava as chamadas e responde por rota (sem rede). */
function installFetchSpy(responder: (url: string) => Response): { calls: Array<{ url: string; method: string }>; restore: () => void } {
  const calls: Array<{ url: string; method: string }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = (globalThis as any).fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = (input: unknown, init?: { method?: string }): Promise<Response> => {
    const url = typeof input === "string" ? input : String((input as { url?: unknown })?.url ?? input);
    calls.push({ url, method: init?.method ?? "GET" });
    return Promise.resolve(responder(url));
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { calls, restore: () => { (globalThis as any).fetch = original; } };
}

const SEND_ROUTE = /\/message\/send|\/send\/text|\/send\/media|\/send\/audio|\/send\/sticker/;

/* --------------------------------------------------------------------------- */
/* (1) confirmação → succeeded + linha de origem atualizada                      */
/* --------------------------------------------------------------------------- */

Deno.test("IA-047: recibo durável confirmado → succeeded e linha de origem atualizada", async () => {
  const { client, rpcCalls } = makeStubClient({ messages: { id: MESSAGE_ID, status: "sent", external_id: "ext-1" } });
  const deps = makeEffectReconcileDeps({ supabase: client });
  const spy = installFetchSpy(() => new Response("{}", { status: 200 }));
  try {
    const result = await handleEffectReconcile(makeInput(makePayload(), 1, 8), deps);
    assertEquals(result.status, "succeeded", "recibo durável confirmado tem de virar succeeded");
    // Não precisa nem tocar o provedor: o recibo já está persistido.
    assertEquals(spy.calls.length, 0, "recibo durável não deve disparar NENHUMA chamada de rede");
    assertEquals(rpcCalls.length, 0, "confirmação não usa RPC");
  } finally {
    spy.restore();
  }
});

Deno.test("IA-047: sonda de LEITURA no provedor confirma por external_id (v2) → succeeded", async () => {
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  Deno.env.set("EVOLUTION_API_URL", "https://evolution.test");
  Deno.env.set("EVOLUTION_API_KEY", "key-test");
  // A linha está incerta (sem recibo) → cai na sonda de leitura.
  const row = { id: MESSAGE_ID, status: "failed", external_id: null, contact_id: "c1", whatsapp_connection_id: "conn1" };
  const { client } = makeStubClient({
    messages: row,
    contacts: { phone: "5511999999999" },
    whatsapp_connections: { instance_id: "inst-1" },
  });
  const deps = makeEffectReconcileDeps({ supabase: client });
  const spy = installFetchSpy(() => new Response(JSON.stringify({ messages: [{ key: { id: "ext-1" } }] }), { status: 200 }));
  try {
    const payload = { ...makePayload(), external_id: "ext-1" };
    const result = await handleEffectReconcile(makeInput(payload, 1, 8), deps);
    assertEquals(result.status, "succeeded", "a sonda de leitura achou a mensagem → succeeded");
    assert(spy.calls.some((c) => c.url.includes("/chat/findMessages/")), "deveria consultar o histórico (leitura)");
    assertEquals(spy.calls.filter((c) => SEND_ROUTE.test(c.url)).length, 0, "a sonda NÃO pode chamar rota de envio");
  } finally {
    spy.restore();
  }
});

/* --------------------------------------------------------------------------- */
/* (2) não confirmado e ainda cabe tentativa → partial                          */
/* --------------------------------------------------------------------------- */

Deno.test("IA-047: não confirmado com tentativas restantes → partial (não terminal)", async () => {
  Deno.env.set("EVOLUTION_API_FLAVOR", "go"); // GO não tem histórico → só o recibo durável decide
  const { client } = makeStubClient({ messages: { id: MESSAGE_ID, status: "failed", external_id: null } });
  const deps = makeEffectReconcileDeps({ supabase: client });
  const spy = installFetchSpy(() => new Response("{}", { status: 200 }));
  try {
    const result = await handleEffectReconcile(makeInput(makePayload(), 3, 8), deps);
    assertEquals(result.status, "partial", "não confirmado com tentativas restantes tem de ser partial");
    assertEquals(spy.calls.length, 0, "GO sem histórico não deve tocar o provedor");
  } finally {
    spy.restore();
    Deno.env.delete("EVOLUTION_API_FLAVOR");
  }
});

/* --------------------------------------------------------------------------- */
/* (3) esgotou → UNCONFIRMED (terminal) e a origem fica intacta                 */
/* --------------------------------------------------------------------------- */

Deno.test("IA-047: esgotadas as tentativas → lança UNCONFIRMED (terminal)", async () => {
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  const { client } = makeStubClient({ messages: { id: MESSAGE_ID, status: "outcome_unknown", external_id: null } });
  const deps = makeEffectReconcileDeps({ supabase: client });
  let captured: unknown = null;
  try {
    await handleEffectReconcile(makeInput(makePayload(), 8, 8), deps);
  } catch (err) {
    captured = err;
  } finally {
    Deno.env.delete("EVOLUTION_API_FLAVOR");
  }
  assert(captured instanceof EffectReconcileError, "esgotado tem de lançar EffectReconcileError");
  assertEquals((captured as EffectReconcileError).code, "UNCONFIRMED", "o code tem de ser UNCONFIRMED");
});

/* --------------------------------------------------------------------------- */
/* (4) NUNCA REENVIA — prova por espião de fetch                                */
/* --------------------------------------------------------------------------- */

Deno.test("IA-047: o handler NÃO faz nenhum POST de envio (espia o fetch)", async () => {
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  Deno.env.set("EVOLUTION_API_URL", "https://evolution.test");
  Deno.env.set("EVOLUTION_API_KEY", "key-test");
  const row = { id: MESSAGE_ID, status: "failed", external_id: null, contact_id: "c1", whatsapp_connection_id: "conn1" };
  const { client } = makeStubClient({
    messages: row,
    contacts: { phone: "5511999999999" },
    whatsapp_connections: { instance_id: "inst-1" },
  });
  const deps = makeEffectReconcileDeps({ supabase: client });
  const spy = installFetchSpy(() => new Response(JSON.stringify({ messages: [] }), { status: 200 }));
  try {
    const result = await handleEffectReconcile(makeInput({ ...makePayload(), external_id: "ext-1" }, 1, 8), deps);
    assertEquals(result.status, "partial", "histórico sem a mensagem → partial");
    assertEquals(
      spy.calls.filter((c) => SEND_ROUTE.test(c.url)).length,
      0,
      `reconciliação NUNCA pode chamar rota de envio; chamadas: ${JSON.stringify(spy.calls)}`,
    );
    // Controle positivo: a leitura de histórico aconteceu (o espião não está cego).
    assert(spy.calls.some((c) => c.url.includes("/chat/findMessages/")), "deveria haver a leitura de histórico");
  } finally {
    spy.restore();
  }
});

/* --------------------------------------------------------------------------- */
/* (5) payload/efeito inválidos falham sem tocar a origem                        */
/* --------------------------------------------------------------------------- */

Deno.test("IA-047: payload malformado e efeito desconhecido → EffectReconcileError", async () => {
  const noopDeps = { confirm: async () => ({ state: "unconfirmed" as const }), applyConfirmed: async () => true };
  let bad: unknown = null;
  try {
    await handleEffectReconcile(makeInput({ effect: "", source_table: "", source_id: "" }, 1, 8), noopDeps);
  } catch (err) { bad = err; }
  assert(bad instanceof EffectReconcileError, "payload vazio tem de lançar");
  assertEquals((bad as EffectReconcileError).code, "EFFECT_RECONCILE_BAD_PAYLOAD", "code de payload");

  let unknown: unknown = null;
  try {
    await handleEffectReconcile(
      makeInput({ effect: "efeito.inexistente", source_table: "messages", source_id: MESSAGE_ID }, 1, 8),
      noopDeps,
    );
  } catch (err) { unknown = err; }
  assert(unknown instanceof EffectReconcileError, "efeito desconhecido tem de lançar");
  assertEquals((unknown as EffectReconcileError).code, "EFFECT_RECONCILE_UNKNOWN_EFFECT", "code de efeito desconhecido");
});

/* --------------------------------------------------------------------------- */
/* (6) enfileiramento idempotente (chave estável)                               */
/* --------------------------------------------------------------------------- */

Deno.test("IA-047: enqueue repetido usa a MESMA chave estável (UNIQUE deduplica)", async () => {
  const { client, rpcCalls } = makeStubClient({}, { data: "job-uuid-1", error: null });
  const args = { supabase: client, effect: EFFECT_MESSAGE_SEND, sourceTable: "messages", sourceId: MESSAGE_ID, externalId: "ext-1", attemptFrom: 2 };
  const id1 = await enqueueEffectReconcile(args);
  const id2 = await enqueueEffectReconcile(args);
  assertEquals(id1, "job-uuid-1", "primeiro enqueue devolve o id do job");
  assertEquals(id2, "job-uuid-1", "segundo enqueue devolve o MESMO id");
  assertEquals(rpcCalls.length, 2, "as duas chamadas passaram pela RPC");
  const k1 = rpcCalls[0].args.p_idempotency_key as string;
  const k2 = rpcCalls[1].args.p_idempotency_key as string;
  assertEquals(k1, buildEffectReconcileKey(EFFECT_MESSAGE_SEND, MESSAGE_ID), "chave estável esperada");
  assertEquals(k1, k2, "repetir o enqueue tem de usar a MESMA chave");
  assertEquals(rpcCalls[0].fn, "enqueue_ai_job", "usa a RPC da fila durável existente");
  assertEquals(rpcCalls[0].args.p_kind, EFFECT_RECONCILE_KIND, "kind do job");
  const payload = rpcCalls[0].args.p_payload as Record<string, unknown>;
  assertEquals(payload.effect, EFFECT_MESSAGE_SEND, "payload.effect");
  assertEquals(payload.source_table, "messages", "payload.source_table");
  assertEquals(payload.source_id, MESSAGE_ID, "payload.source_id");
  assertEquals(payload.external_id, "ext-1", "payload.external_id");
  assertEquals(payload.attempt_from, 2, "payload.attempt_from");
});

/* --------------------------------------------------------------------------- */
/* (7) o worker registra o kind                                                  */
/* --------------------------------------------------------------------------- */

Deno.test("IA-047: ai-jobs-worker registra o handler de effect.reconcile", () => {
  assert(typeof HANDLERS[EFFECT_RECONCILE_KIND] === "function", "HANDLERS precisa mapear effect.reconcile");
});
