/**
 * X028 — contrato executável dos RECIBOS DE LEITURA/ENTREGA do Talk X.
 *
 * O que fica travado:
 *   1. um recibo do Evolution GO onde `Chat !== Sender` (o adaptador infere
 *      `fromMe === false`, evolution-go-adapter) ainda chama o Talk X — é
 *      exatamente o caso em que o entregue/lida ficava em zero;
 *   2. a RPC usada é a canônica `record_talkx_recipient_receipt`, com o
 *      `p_event` explícito ('read' | 'delivered'); a antiga
 *      `record_talkx_recipient_delivered` deixa de ser chamada pela edge;
 *   3. `delivered` repetido não lança — a idempotência é da RPC;
 *   4. recibo que não casa com nenhum destinatário loga o não-casamento.
 *
 * Payloads GO anonimizados em fixture (sem telefone/CPF reais).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleMessagesUpdate } from "../evolution-webhook-msg-handlers.ts";
import { translateGoPayload } from "../evolution-go-adapter.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

type Chamada = { nome: string; args: Record<string, unknown> };

/** Mock chainable mínimo: `whatsapp_connections` devolve a conexão, o resto null. */
function fakeSupabase(chamadas: Chamada[], rpcRetorno: Record<string, unknown> = {}) {
  let tabela = "";
  const chain: Record<string, unknown> = {};
  const mesmo = () => chain;
  for (const metodo of ["select", "eq", "in", "is", "not", "gte", "order", "limit", "update", "insert", "upsert", "delete"]) {
    chain[metodo] = mesmo;
  }
  chain.maybeSingle = async () =>
    tabela === "whatsapp_connections" ? { data: { id: "conn-1" }, error: null } : { data: null, error: null };
  chain.single = chain.maybeSingle;
  return {
    from: (t: string) => {
      tabela = t;
      return chain;
    },
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      return { data: rpcRetorno[nome] ?? false, error: null };
    },
  } as unknown as EvolutionDbClient;
}

/**
 * Payload GO anonimizado (evento de recibo). `Chat !== Sender` é o cenário real
 * em que o adaptador infere `fromMe === false` mesmo num recibo da NOSSA mensagem.
 */
function goReceipt(state: string, id = "3EB0FIXTURE"): Record<string, unknown> {
  return {
    event: "receipt",
    instanceName: "inst-go-x028",
    state,
    data: {
      MessageIDs: [id],
      Chat: "5511000000000@s.whatsapp.net",
      Sender: "5511000000001@c.us",
    },
  };
}

const INSTANCE = "inst-x028-receipts";

Deno.test("X028: recibo GO read com Chat !== Sender chama record_talkx_recipient_receipt com p_event=read", async () => {
  const chamadas: Chamada[] = [];
  const traduzido = translateGoPayload(goReceipt("read"));

  await handleMessagesUpdate(fakeSupabase(chamadas), INSTANCE, traduzido.data, {});

  const recibos = chamadas.filter((c) => c.nome === "record_talkx_recipient_receipt");
  assertEquals(recibos.length, 1, "o recibo Talk X deve ser chamado uma vez");
  assertEquals(recibos[0].args.p_external_id, "3EB0FIXTURE");
  assertEquals(recibos[0].args.p_connection_id, "conn-1");
  assertEquals(recibos[0].args.p_event, "read");
  assertEquals(
    chamadas.some((c) => c.nome === "record_talkx_recipient_delivered"),
    false,
    "a edge deve usar a RPC canônica, não o invólucro antigo",
  );
});

Deno.test("X028: recibo GO delivered com Chat !== Sender chama a RPC com p_event=delivered", async () => {
  const chamadas: Chamada[] = [];
  const traduzido = translateGoPayload(goReceipt("delivered", "3EB0DELIVERED"));

  await handleMessagesUpdate(
    fakeSupabase(chamadas, { record_talkx_recipient_receipt: true }),
    INSTANCE,
    traduzido.data,
    {},
  );

  const recibos = chamadas.filter((c) => c.nome === "record_talkx_recipient_receipt");
  assertEquals(recibos.length, 1);
  assertEquals(recibos[0].args.p_external_id, "3EB0DELIVERED");
  assertEquals(recibos[0].args.p_event, "delivered");
});

Deno.test("X028: delivered repetido (mesmo external_id) não lança erro", async () => {
  const chamadas: Chamada[] = [];
  const supabase = fakeSupabase(chamadas, { record_talkx_recipient_receipt: true });
  const traduzido = translateGoPayload(goReceipt("delivered", "3EB0REPEAT"));

  await handleMessagesUpdate(supabase, INSTANCE, traduzido.data, {});
  await handleMessagesUpdate(supabase, INSTANCE, traduzido.data, {});

  const recibos = chamadas.filter((c) => c.nome === "record_talkx_recipient_receipt");
  assertEquals(recibos.length, 2, "cada evento chama a RPC; a idempotência é dela");
});

Deno.test("X028: recibo outbound v2 (fromMe=true) continua chamando a mesma RPC", async () => {
  const chamadas: Chamada[] = [];

  await handleMessagesUpdate(
    fakeSupabase(chamadas, { record_talkx_recipient_receipt: true }),
    INSTANCE,
    { updates: [{ key: { id: "3EB0V2", fromMe: true }, status: "READ" }] },
    {},
  );

  const recibos = chamadas.filter((c) => c.nome === "record_talkx_recipient_receipt");
  assertEquals(recibos.length, 1, "o caminho v2 (fromMe explícito) segue coberto");
  assertEquals(recibos[0].args.p_event, "read");
});

Deno.test("X028: recibo que não casa com destinatário loga o não-casamento (sem erro)", async () => {
  const chamadas: Chamada[] = [];
  const warns: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warns.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    await handleMessagesUpdate(
      fakeSupabase(chamadas, { record_talkx_recipient_receipt: false }),
      INSTANCE,
      { updates: [{ key: { id: "3EB0NOMATCH", fromMe: false }, status: "READ" }] },
      {},
    );
  } finally {
    console.warn = original;
  }

  assertEquals(warns.some((w) => w.includes("did not match a recipient")), true);
});
