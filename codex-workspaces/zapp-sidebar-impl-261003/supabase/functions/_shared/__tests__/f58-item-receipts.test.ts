/**
 * F58 — contrato executável da RECONCILIAÇÃO DE RECIBOS POR ITEM.
 *
 * O que fica travado:
 *   1. DELIVERY_ACK de mensagem nossa numa conexão conhecida chama
 *      `record_multiplix_item_delivered` com external_id e connection_id — é assim que
 *      um item em `outcome_unknown` (worker morreu entre o POST e o complete) é
 *      resolvido pelo evento que chega depois;
 *   2. READ chama a MESMA RPC com `p_event: 'read'` — antes do F58 o ramo de READ só
 *      falava com o TalkX e o `read_at` do item nunca era carimbado;
 *   3. recibo de mensagem que NÃO é nossa (`fromMe` falso) não chama nada;
 *   4. a chamada de item é independente do encadeamento do destinatário: acontece
 *      mesmo quando o TalkX/recipient já confirmou (são registros distintos).
 *
 * A asserção é por chamada registrada (nome + argumentos), não por snapshot: apagar a
 * chamada de item faz o teste FALHAR.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleMessagesUpdate } from "../evolution-webhook-msg-handlers.ts";

type Chamada = { nome: string; args: Record<string, unknown> };

/** Mock chainable mínimo: `whatsapp_connections` devolve a conexão, o resto devolve null. */
function fakeSupabase(chamadas: Chamada[], rpcRetorno: Record<string, unknown> = {}) {
  let tabela = "";
  const chain: Record<string, unknown> = {};
  const mesmo = () => chain;
  chain.select = mesmo;
  chain.eq = mesmo;
  chain.order = mesmo;
  chain.limit = mesmo;
  chain.is = mesmo;
  chain.update = mesmo;
  chain.insert = mesmo;
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
  };
}

function chamadasDe(chamadas: Chamada[], nome: string): Chamada[] {
  return chamadas.filter((c) => c.nome === nome);
}

Deno.test("F58: DELIVERY_ACK nosso resolve o ITEM da fila (sem p_event)", async () => {
  const chamadas: Chamada[] = [];
  await handleMessagesUpdate(
    fakeSupabase(chamadas),
    "inst-1",
    { messages: [{ key: { id: "3EB0ABC", fromMe: true }, status: "DELIVERY_ACK" }] },
    {},
  );

  const itens = chamadasDe(chamadas, "record_multiplix_item_delivered");
  assertEquals(itens.length, 1, "DELIVERY_ACK deve chamar a RPC de ITEM exatamente uma vez");
  assertEquals(itens[0].args.p_external_id, "3EB0ABC");
  assertEquals(itens[0].args.p_connection_id, "conn-1");
  assertEquals(
    "p_event" in itens[0].args,
    false,
    "delivered usa o DEFAULT da RPC; nao deve mandar p_event",
  );
});

Deno.test("F58: READ resolve o ITEM com p_event='read' (era o buraco: so falava com o TalkX)", async () => {
  const chamadas: Chamada[] = [];
  await handleMessagesUpdate(
    fakeSupabase(chamadas),
    "inst-1",
    { messages: [{ key: { id: "3EB0READ", fromMe: true }, status: "READ" }] },
    {},
  );

  const itens = chamadasDe(chamadas, "record_multiplix_item_delivered");
  assertEquals(itens.length, 1, "READ deve chamar a RPC de ITEM exatamente uma vez");
  assertEquals(itens[0].args.p_external_id, "3EB0READ");
  assertEquals(itens[0].args.p_connection_id, "conn-1");
  assertEquals(itens[0].args.p_event, "read", "READ precisa do evento explicito");
});

Deno.test("F58: recibo que NAO e nosso (fromMe falso) nao mexe no item", async () => {
  const chamadas: Chamada[] = [];
  await handleMessagesUpdate(
    fakeSupabase(chamadas),
    "inst-1",
    { messages: [{ key: { id: "3EB0DELES", fromMe: false }, status: "DELIVERY_ACK" }] },
    {},
  );

  assertEquals(
    chamadasDe(chamadas, "record_multiplix_item_delivered").length,
    0,
    "recibo de mensagem do contato nao pode resolver item nosso",
  );
});

Deno.test("F58: o item e resolvido mesmo quando o destinatario ja confirmou", async () => {
  const chamadas: Chamada[] = [];
  // record_talkx_recipient_delivered devolve true: o encadeamento do destinatario para
  // aqui, mas o item (registro distinto) precisa ser resolvido de qualquer forma.
  await handleMessagesUpdate(
    fakeSupabase(chamadas, { record_talkx_recipient_delivered: true }),
    "inst-1",
    { messages: [{ key: { id: "3EB0OK", fromMe: true }, status: "DELIVERY_ACK" }] },
    {},
  );

  assertEquals(
    chamadasDe(chamadas, "record_multiplix_item_delivered").length,
    1,
    "o item nao pode depender de o destinatario ter falhado",
  );
});
