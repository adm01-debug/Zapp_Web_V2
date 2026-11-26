/**
 * webhook-replay — ação admin que reprocessa a dead-letter.
 *
 * O que precisa ficar provado:
 *   - só admin/supervisor reprocessa (403 para os demais, 401 sem sessão);
 *   - item com `replay_payload` completo é reenviado ao `ingest_inbound_message`
 *     e sai da fila (`resolved = true`);
 *   - item que falha de novo volta para a fila com `retry_count + 1`;
 *   - IDEMPOTÊNCIA: rodar de novo não reenvia o que já saiu da fila, e o replay
 *     nunca insere mensagem (`messages`) por conta própria — quem garante que
 *     não duplica é o `ux_messages_dedup` da RPC.
 *
 * Sem banco real: clientes falsos injetados via `_injected`.
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen supabase/functions/webhook-replay/index.test.ts
 */

import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

import { handleWebhookReplay, MAX_REPLAY_BATCH } from "./index.ts";

interface LinhaFalsa {
  id: string;
  external_id: string | null;
  replay_payload: unknown;
  retry_count: number;
  resolved: boolean;
}

const ARGS_OK = {
  p_connection_id: "conexao-1",
  p_phone: "5511988887777",
  p_push_name: "Contato Sintético",
  p_content: "oi",
  p_message_type: "text",
  p_media_url: null,
  p_external_id: "MSG-1",
  p_created_at: "2026-10-12T00:00:00.000Z",
};

function linha(over: Partial<LinhaFalsa> = {}): LinhaFalsa {
  return { id: "f1", external_id: "MSG-1", replay_payload: ARGS_OK, retry_count: 0, resolved: false, ...over };
}

function supabaseFalso(linhas: LinhaFalsa[], opts: { rpcErro?: { code: string } | null } = {}) {
  const atualizacoes: { id: unknown; patch: Record<string, unknown> }[] = [];
  const rpcs: { nome: string; args: unknown }[] = [];
  const inserts: string[] = [];

  const client = {
    from: (tabela: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        not: () => builder,
        order: () => builder,
        limit: () =>
          Promise.resolve({ data: tabela === "webhook_failures" ? linhas.filter((l) => !l.resolved) : [], error: null }),
        update: (patch: Record<string, unknown>) => ({
          eq: (_coluna: string, valor: unknown) => {
            atualizacoes.push({ id: valor, patch });
            // Emula o efeito da fila: linha resolvida sai das próximas leituras.
            for (const l of linhas) {
              if (l.id === valor && patch.resolved === true) l.resolved = true;
            }
            return Promise.resolve({ error: null });
          },
        }),
        insert: () => {
          inserts.push(tabela);
          return Promise.resolve({ error: null });
        },
      };
      return builder;
    },
    rpc: (nome: string, args: unknown) => {
      rpcs.push({ nome, args });
      return Promise.resolve({ data: null, error: opts.rpcErro ? { code: opts.rpcErro.code } : null });
    },
  };

  return { client: client as unknown as SupabaseClient, atualizacoes, rpcs, inserts };
}

function chamadorFalso(opts: { semSessao?: boolean; admin?: boolean } = {}) {
  return {
    auth: {
      getUser: () =>
        Promise.resolve(
          opts.semSessao
            ? { data: { user: null }, error: { message: "invalid claim" } }
            : { data: { user: { id: "usuario-1" } }, error: null },
        ),
    },
    rpc: () => Promise.resolve({ data: opts.admin ?? true, error: null }),
  } as unknown as SupabaseClient;
}

function pedido(corpo: unknown = {}, comToken = true) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (comToken) headers.Authorization = "Bearer token-sintetico";
  return new Request("http://localhost/functions/v1/webhook-replay", {
    method: "POST",
    headers,
    body: JSON.stringify(corpo),
  });
}

Deno.test("replay: reprocessa quem tem payload, pula payload incompleto e resolve a fila", async () => {
  const linhas = [linha(), linha({ id: "f2", external_id: "MSG-2", replay_payload: { p_external_id: "MSG-2" } })];
  const banco = supabaseFalso(linhas);
  const res = await handleWebhookReplay(pedido({ endpoint: "evolution-webhook" }), {
    supabase: banco.client,
    callerClient: chamadorFalso(),
  });

  assertEquals(res.status, 200);
  const corpo = await res.json();
  assertEquals(corpo.endpoint, "evolution-webhook");
  assertEquals(corpo.lidas, 2);
  assertEquals(corpo.reprocessados, 1);
  assertEquals(corpo.resolvidos, 1);
  assertEquals(corpo.falhas, 0);
  assertEquals(corpo.ignorados, 1);

  assertEquals(banco.rpcs.length, 1);
  assertEquals(banco.rpcs[0].nome, "ingest_inbound_message");
  assertEquals(banco.rpcs[0].args, ARGS_OK);
  assertEquals(banco.atualizacoes.length, 1);
  assertEquals(banco.atualizacoes[0].id, "f1");
  assertEquals(banco.atualizacoes[0].patch.resolved, true);
  assertMatch(String(banco.atualizacoes[0].patch.resolved_at), /^\d{4}-\d{2}-\d{2}T/);
});

Deno.test("replay é idempotente: a segunda passada não reenvia o que já saiu da fila", async () => {
  const linhas = [linha()];
  const banco = supabaseFalso(linhas);

  const primeira = await handleWebhookReplay(pedido(), { supabase: banco.client, callerClient: chamadorFalso() });
  assertEquals((await primeira.json()).reprocessados, 1);

  const segunda = await handleWebhookReplay(pedido(), { supabase: banco.client, callerClient: chamadorFalso() });
  const corpo = await segunda.json();
  assertEquals(segunda.status, 200);
  assertEquals(corpo.lidas, 0);
  assertEquals(corpo.reprocessados, 0);
  // Nenhuma RPC a mais e nenhuma escrita em `messages`: a dedup é do ingest.
  assertEquals(banco.rpcs.length, 1);
  assertEquals(banco.inserts.filter((t) => t === "messages").length, 0);
});

Deno.test("replay: RPC falhou de novo → volta para a fila com retry_count + 1", async () => {
  const banco = supabaseFalso([linha({ retry_count: 2 })], { rpcErro: { code: "08006" } });
  const res = await handleWebhookReplay(pedido(), { supabase: banco.client, callerClient: chamadorFalso() });

  assertEquals(res.status, 200);
  const corpo = await res.json();
  assertEquals(corpo.reprocessados, 1);
  assertEquals(corpo.resolvidos, 0);
  assertEquals(corpo.falhas, 1);
  assertEquals(banco.atualizacoes.length, 1);
  assertEquals(banco.atualizacoes[0].patch.retry_count, 3);
  assertEquals(banco.atualizacoes[0].patch.resolved, undefined);
});

Deno.test("replay: não-admin recebe 403 e a RPC nem é chamada", async () => {
  const banco = supabaseFalso([linha()]);
  const res = await handleWebhookReplay(pedido(), {
    supabase: banco.client,
    callerClient: chamadorFalso({ admin: false }),
  });
  assertEquals(res.status, 403);
  assertEquals(banco.rpcs.length, 0);
  assertEquals(banco.atualizacoes.length, 0);
});

Deno.test("replay: sem sessão válida recebe 401 e a RPC nem é chamada", async () => {
  const banco = supabaseFalso([linha()]);
  const res = await handleWebhookReplay(pedido(), {
    supabase: banco.client,
    callerClient: chamadorFalso({ semSessao: true }),
  });
  assertEquals(res.status, 401);
  assertEquals(banco.rpcs.length, 0);
});

Deno.test("replay: lote é limitado por MAX_REPLAY_BATCH", async () => {
  const banco = supabaseFalso([linha()]);
  const res = await handleWebhookReplay(pedido({ limit: 10_000 }), {
    supabase: banco.client,
    callerClient: chamadorFalso(),
  });
  assertEquals(res.status, 200);
  assertEquals(MAX_REPLAY_BATCH, 50);
  assert(MAX_REPLAY_BATCH <= 50);
});
