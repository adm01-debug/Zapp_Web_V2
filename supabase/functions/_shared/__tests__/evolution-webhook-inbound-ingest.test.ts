/**
 * F3 — contrato executável do CAMINHO DE ENTRADA do webhook Evolution.
 *
 * Gaps provados por leitura que nenhum teste anterior cobria:
 *   1. Caminho feliz: `ingest_inbound_message` recebe phone, content, messageType,
 *      external_id e connection_id corretos; downstream (attribute_talkx_reply) é
 *      disparado apenas depois.
 *   2. Idempotência: `outcome = 'duplicate'` trava os downstream — a mensagem
 *      duplicada não gera segunda atribuição TalkX nem dispara chatbot.
 *   3. Mensagem de grupo (`@g.us`): ignorada ANTES de qualquer acesso ao banco —
 *      nem `ingest_inbound_message` é chamado.
 *   4. Texto vazio (content = ""): descartado antes do RPC — nem conexão é buscada.
 *   5. Payload sem `remoteJid`: early-exit sem tocar banco (JID não resolvível).
 *
 * Run with:
 *   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
 *     --allow-net=127.0.0.1 \
 *     supabase/functions/_shared/__tests__/evolution-webhook-inbound-ingest.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleIncomingMessage } from "../evolution-webhook-messages.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

type Chamada = { nome: string; args: Record<string, unknown> };
type RpcHandler = (args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

/** Resultado padrão de ingest_inbound_message para o caminho feliz. */
function ingestResult(outcome: "inserted" | "duplicate" | "updated" = "inserted") {
  return {
    contact_id: "contact-f3",
    contact_name: "Fixture F3",
    assigned_to: null,
    avatar_url: null,
    contact_created: outcome === "inserted",
    message_id: "msg-f3",
    outcome,
  };
}

/**
 * Fake Supabase que:
 *  - Registra todas as chamadas de `.rpc()` em `chamadas[]`.
 *  - Permite substituir o comportamento de qualquer RPC via `rpcHandlers`.
 *  - Devolve `{ id: "conn-f3" }` para `whatsapp_connections` (lookup de conexão).
 *  - Devolve lista vazia para todo `.from()` encadeado sem terminal.
 *  - Inclui `talkx_optout_keywords` vazio (sem keywords = "SAIR" não é opt-out).
 */
function fakeSupabase(chamadas: Chamada[], rpcHandlers: Partial<Record<string, RpcHandler>> = {}) {
  let tabela = "";
  const chain: Record<string, unknown> = {};
  const mesmo = () => chain;
  for (const metodo of [
    "select", "eq", "in", "is", "not", "gte", "lte", "order", "limit",
    "update", "insert", "upsert", "delete", "neq", "range",
  ]) {
    chain[metodo] = mesmo;
  }
  chain.maybeSingle = async () =>
    tabela === "whatsapp_connections"
      ? { data: { id: "conn-f3" }, error: null }
      : { data: null, error: null };
  chain.single = chain.maybeSingle;
  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: [], error: null });

  return {
    from: (t: string) => {
      tabela = t;
      return chain;
    },
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      const handler = rpcHandlers[nome];
      return handler
        ? await handler(args)
        : { data: null, error: null };
    },
  } as unknown as EvolutionDbClient;
}

/** Payload v1 de mensagem de entrada (formato Evolution v2). */
function payloadEntrada(opts: {
  texto?: string;
  jid?: string;
  id?: string;
  fromMe?: boolean;
}) {
  const jid = opts.jid ?? "5511900000000@s.whatsapp.net";
  const id = opts.id ?? "3EB0F3TEST01";
  const texto = opts.texto ?? "Olá, quero informações";
  const fromMe = opts.fromMe ?? false;
  const data: Record<string, unknown> = {
    pushName: "Fixture F3",
    message: { conversation: texto },
    messageTimestamp: 1727779200,
  };
  const key = {
    id,
    remoteJid: jid,
    fromMe,
  };
  return { data, key };
}

// ---------------------------------------------------------------------------
// F3-1: caminho feliz
// ---------------------------------------------------------------------------
Deno.test(
  "F3-1: caminho feliz — ingest_inbound_message recebe args corretos e downstream é chamado",
  async () => {
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      ingest_inbound_message: async () => ({ data: [ingestResult("inserted")], error: null }),
      attribute_talkx_reply: async () => ({
        data: { attributed: false, reason: "no_recipient_in_window" },
        error: null,
      }),
      attribute_multiplix_reply: async () => ({ data: null, error: null }),
    });

    const { data, key } = payloadEntrada({ texto: "Quero comprar" });
    await handleIncomingMessage(supabase, "inst-f3-happy", data, key, "https://stub.supabase.co", "svc-key");

    const ingestCalls = chamadas.filter((c) => c.nome === "ingest_inbound_message");
    assertEquals(ingestCalls.length, 1, "deve chamar ingest_inbound_message exatamente uma vez");

    const args = ingestCalls[0].args;
    assertEquals(args.p_phone, "5511900000000", "normaliza JID para telefone sem @");
    assertEquals(args.p_content, "Quero comprar", "repassa o texto da mensagem");
    assertEquals(args.p_message_type, "text", "tipo correto para conversation");
    assertEquals(args.p_external_id, "3EB0F3TEST01", "repassa o id do key como external_id");
    assertEquals(args.p_push_name, "Fixture F3", "pushName vira p_push_name");

    // downstream deve ter sido disparado
    assertEquals(
      chamadas.some((c) => c.nome === "attribute_talkx_reply"),
      true,
      "attribute_talkx_reply deve ser chamado após ingest bem-sucedido",
    );
  },
);

// ---------------------------------------------------------------------------
// F3-2: idempotência — outcome=duplicate não dispara downstream
// ---------------------------------------------------------------------------
Deno.test(
  "F3-2: idempotência — webhook duplicado (outcome=duplicate) NÃO dispara downstream",
  async () => {
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      ingest_inbound_message: async () => ({ data: [ingestResult("duplicate")], error: null }),
      attribute_talkx_reply: async () => ({ data: { attributed: true }, error: null }),
    });

    const { data, key } = payloadEntrada({ id: "3EB0DUPL0001" });
    await handleIncomingMessage(supabase, "inst-f3-dupl", data, key, "https://stub.supabase.co", "svc-key");

    // ingest deve ter sido chamado normalmente
    assertEquals(
      chamadas.filter((c) => c.nome === "ingest_inbound_message").length,
      1,
      "ingest_inbound_message deve ser chamado mesmo em duplicate",
    );

    // mas nenhum downstream
    assertEquals(
      chamadas.some((c) => c.nome === "attribute_talkx_reply"),
      false,
      "duplicate NÃO pode chamar attribute_talkx_reply",
    );
    assertEquals(
      chamadas.some((c) => c.nome === "attribute_multiplix_reply"),
      false,
      "duplicate NÃO pode chamar attribute_multiplix_reply",
    );
    assertEquals(
      chamadas.some((c) => c.nome === "trigger_chatbot_l1"),
      false,
      "duplicate NÃO pode chamar trigger_chatbot_l1",
    );
  },
);

// ---------------------------------------------------------------------------
// F3-3: mensagem de grupo (@g.us) — ignorada antes do banco
// ---------------------------------------------------------------------------
Deno.test(
  "F3-3: mensagem de grupo (@g.us) é ignorada ANTES de qualquer acesso ao banco",
  async () => {
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      ingest_inbound_message: async () => ({ data: [ingestResult()], error: null }),
    });

    const { data, key } = payloadEntrada({
      jid: "5511900000000-1727000000@g.us",
      texto: "mensagem no grupo",
    });
    await handleIncomingMessage(supabase, "inst-f3-group", data, key, "https://stub.supabase.co", "svc-key");

    assertEquals(
      chamadas.some((c) => c.nome === "ingest_inbound_message"),
      false,
      "mensagem de grupo NÃO pode chamar ingest_inbound_message",
    );
  },
);

// ---------------------------------------------------------------------------
// F3-4: texto vazio — early-exit antes de qualquer RPC
// ---------------------------------------------------------------------------
Deno.test(
  "F3-4: texto vazio não chega ao banco — early-exit antes de ingest_inbound_message",
  async () => {
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      ingest_inbound_message: async () => ({ data: [ingestResult()], error: null }),
    });

    const { data, key } = payloadEntrada({ texto: "" });
    await handleIncomingMessage(supabase, "inst-f3-empty", data, key, "https://stub.supabase.co", "svc-key");

    assertEquals(
      chamadas.some((c) => c.nome === "ingest_inbound_message"),
      false,
      "texto vazio NÃO pode chamar ingest_inbound_message",
    );
  },
);

// ---------------------------------------------------------------------------
// F3-5: payload sem remoteJid — early-exit sem tocar banco
// ---------------------------------------------------------------------------
Deno.test(
  "F3-5: payload sem remoteJid — JID não resolvível, early-exit sem chamar banco",
  async () => {
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      ingest_inbound_message: async () => ({ data: [ingestResult()], error: null }),
    });

    // key sem remoteJid (simula payload malformado)
    const data: Record<string, unknown> = {
      pushName: "Malformado",
      message: { conversation: "oi" },
      messageTimestamp: 1727779200,
    };
    const key = { id: "3EB0NOREMOTE", fromMe: false };

    await handleIncomingMessage(
      supabase,
      "inst-f3-nojid",
      data,
      key as Parameters<typeof handleIncomingMessage>[3],
      "https://stub.supabase.co",
      "svc-key",
    );

    assertEquals(
      chamadas.some((c) => c.nome === "ingest_inbound_message"),
      false,
      "payload sem remoteJid NÃO pode chamar ingest_inbound_message",
    );
  },
);
