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

type MensagemFake = {
  id: string;
  status: string | null;
  external_id: string;
  sender: "agent" | "contact";
  whatsapp_connection_id: string;
};

type UpdateRegistrado = {
  tabela: string;
  filtros: Record<string, unknown>;
  payload: Record<string, unknown>;
};

type SupabaseFake = EvolutionDbClient & {
  updates: UpdateRegistrado[];
  upserts: Record<string, unknown>[];
};

/**
 * Mock chainable: `whatsapp_connections` devolve a conexão conn-1, `messages`
 * casa pelas linhas configuradas (cada `.eq` vira filtro conferido), `contacts`
 * devolve o contato configurado e o resto null. `update()`/`upsert()` ficam
 * registrados no `await` do encadeamento (o builder PostgREST é thenable).
 */
function fakeSupabase(
  chamadas: Chamada[],
  rpcRetorno: Record<string, unknown> = {},
  mensagens: MensagemFake[] = [],
  contatoId: string | null = null,
): SupabaseFake {
  const updates: UpdateRegistrado[] = [];
  const upserts: Record<string, unknown>[] = [];

  function novaQuery(tabela: string) {
    const filtros: Record<string, unknown> = {};
    let pendente: { tipo: "update" | "upsert"; payload: Record<string, unknown> } | null = null;
    const chain: Record<string, unknown> = {};
    const mesmo = () => chain;
    chain.select = mesmo;
    chain.in = mesmo;
    chain.not = mesmo;
    chain.gte = mesmo;
    chain.order = mesmo;
    chain.limit = mesmo;
    chain.delete = mesmo;
    chain.insert = mesmo;
    chain.eq = (campo: string, valor: unknown) => {
      filtros[campo] = valor;
      return chain;
    };
    chain.is = (campo: string, valor: unknown) => {
      filtros[campo] = valor;
      return chain;
    };
    chain.update = (payload: Record<string, unknown>) => {
      pendente = { tipo: "update", payload };
      return chain;
    };
    chain.upsert = (payload: Record<string, unknown>) => {
      pendente = { tipo: "upsert", payload };
      upserts.push(payload);
      return chain;
    };
    chain.maybeSingle = async () => {
      if (tabela === "whatsapp_connections") return { data: { id: "conn-1" }, error: null };
      if (tabela === "messages") {
        const linha = mensagens.find((m) =>
          Object.entries(filtros).every(
            ([campo, valor]) => (m as Record<string, unknown>)[campo] === valor,
          )
        );
        return { data: linha ?? null, error: null };
      }
      if (tabela === "contacts") {
        return { data: contatoId ? { id: contatoId } : null, error: null };
      }
      return { data: null, error: null };
    };
    chain.single = chain.maybeSingle;
    chain.then = (resolve: (v: unknown) => void) => {
      if (pendente?.tipo === "update") {
        updates.push({ tabela, filtros: { ...filtros }, payload: pendente.payload });
      }
      resolve({ data: null, error: null });
    };
    return chain;
  }

  const client = {
    from: (t: string) => novaQuery(t),
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      return { data: rpcRetorno[nome] ?? false, error: null };
    },
    updates,
    upserts,
  };
  return client as unknown as SupabaseFake;
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

// ─────────────────────────────────────────────────────────────────────────────
// t_4029f3b7 — recibo GO com Chat !== Sender (fromMe inferido falso) de mensagem
// NOSSA: a linha outbound existente com o external_id na conexão é a evidência
// canônica — atualiza o inbox e dispara as RPCs do Multiplix.
// ─────────────────────────────────────────────────────────────────────────────

function linhaOutbound(id: string, status: string | null, externalId: string, conn = "conn-1"): MensagemFake {
  return { id, status, external_id: externalId, sender: "agent", whatsapp_connection_id: conn };
}

Deno.test("GO-RECEIPT: delivered com Chat !== Sender atualiza a linha outbound no inbox", async () => {
  const chamadas: Chamada[] = [];
  const supabase = fakeSupabase(
    chamadas,
    {},
    [linhaOutbound("msg-out-1", "sent", "3EB0GO-OUT")],
    "ct-1",
  );
  const traduzido = translateGoPayload(goReceipt("delivered", "3EB0GO-OUT"));

  await handleMessagesUpdate(supabase, INSTANCE, traduzido.data, {});

  const escrita = supabase.updates.find((u) => u.tabela === "messages" && u.filtros.id === "msg-out-1");
  assertEquals(
    escrita?.payload.status,
    "delivered",
    "o recibo GO da nossa mensagem deve elevar a linha outbound para delivered",
  );
  assertEquals(
    supabase.upserts.length,
    0,
    "recibo de mensagem nossa nao pode virar stub inbound '[Mensagem recebida]'",
  );
});

Deno.test("GO-RECEIPT: delivered com Chat !== Sender chama as RPCs Multiplix mesmo com Talk X sem casar", async () => {
  const chamadas: Chamada[] = [];
  const supabase = fakeSupabase(
    chamadas,
    { record_talkx_recipient_receipt: false },
    [linhaOutbound("msg-out-2", "sent", "3EB0GO-MULTI")],
  );
  const traduzido = translateGoPayload(goReceipt("delivered", "3EB0GO-MULTI"));

  await handleMessagesUpdate(supabase, INSTANCE, traduzido.data, {});

  const destinatarios = chamadas.filter((c) => c.nome === "record_multiplix_recipient_delivered");
  assertEquals(destinatarios.length, 1, "o destinatario Multiplix deve ser confirmado pelo external_id+conexao");
  assertEquals(destinatarios[0].args.p_external_id, "3EB0GO-MULTI");
  assertEquals(destinatarios[0].args.p_connection_id, "conn-1");

  const itens = chamadas.filter((c) => c.nome === "record_multiplix_item_delivered");
  assertEquals(itens.length, 1, "o item da fila Multiplix deve ser resolvido pelo mesmo recibo");
  assertEquals(itens[0].args.p_external_id, "3EB0GO-MULTI");
  assertEquals(itens[0].args.p_connection_id, "conn-1");
});

Deno.test("GO-RECEIPT: read com Chat !== Sender sobe a linha para read e carimba o item com p_event=read", async () => {
  const chamadas: Chamada[] = [];
  const supabase = fakeSupabase(
    chamadas,
    {},
    [linhaOutbound("msg-out-3", "delivered", "3EB0GO-READ")],
  );
  const traduzido = translateGoPayload(goReceipt("read", "3EB0GO-READ"));

  await handleMessagesUpdate(supabase, INSTANCE, traduzido.data, {});

  const escrita = supabase.updates.find((u) => u.tabela === "messages" && u.filtros.id === "msg-out-3");
  assertEquals(escrita?.payload.status, "read");
  const itens = chamadas.filter((c) => c.nome === "record_multiplix_item_delivered");
  assertEquals(itens.length, 1);
  assertEquals(itens[0].args.p_event, "read");
});

Deno.test("GO-RECEIPT: linha ja 'read' nao regride para delivered (RPC continua idempotente)", async () => {
  const chamadas: Chamada[] = [];
  const supabase = fakeSupabase(
    chamadas,
    {},
    [linhaOutbound("msg-out-4", "read", "3EB0GO-REG")],
  );
  const traduzido = translateGoPayload(goReceipt("delivered", "3EB0GO-REG"));

  await handleMessagesUpdate(supabase, INSTANCE, traduzido.data, {});

  assertEquals(supabase.updates.length, 0, "shouldUpdateStatus barra a regressao read->delivered");
  assertEquals(
    chamadas.filter((c) => c.nome === "record_multiplix_item_delivered").length,
    1,
    "o recibo continua sendo nosso: a RPC e chamada e deduplica no banco",
  );
});

Deno.test("GO-RECEIPT: delivered repetido reescreve uma unica vez (idempotencia no handler)", async () => {
  const chamadas: Chamada[] = [];
  const linha = linhaOutbound("msg-out-5", "sent", "3EB0GO-REP");
  const supabase = fakeSupabase(chamadas, {}, [linha]);
  const traduzido = translateGoPayload(goReceipt("delivered", "3EB0GO-REP"));

  await handleMessagesUpdate(supabase, INSTANCE, traduzido.data, {});
  linha.status = "delivered"; // a primeira escrita persistiu
  await handleMessagesUpdate(supabase, INSTANCE, traduzido.data, {});

  assertEquals(supabase.updates.length, 1, "segundo recibo identico nao reescreve a linha");
  assertEquals(
    chamadas.filter((c) => c.nome === "record_multiplix_recipient_delivered").length,
    2,
    "cada evento chama a RPC; a deduplicacao e dela",
  );
});

Deno.test("GO-RECEIPT: outro external_id ou outra conexao nao toca a linha nem chama o Multiplix", async () => {
  const chamadas: Chamada[] = [];
  const supabase = fakeSupabase(
    chamadas,
    {},
    [
      linhaOutbound("msg-x", "sent", "3EB0-OUTRO-ID"), // mesmo conn, external_id diferente
      linhaOutbound("msg-y", "sent", "3EB0GO-DELT", "conn-2"), // mesmo id, outra conexao
    ],
  );
  const traduzido = translateGoPayload(goReceipt("delivered", "3EB0GO-DELT"));

  await handleMessagesUpdate(supabase, INSTANCE, traduzido.data, {});

  assertEquals(supabase.updates.length, 0, "nenhuma linha desta conexao com esse id existe");
  assertEquals(chamadas.filter((c) => c.nome === "record_multiplix_recipient_delivered").length, 0);
  assertEquals(chamadas.filter((c) => c.nome === "record_multiplix_item_delivered").length, 0);
});

Deno.test("GO-RECEIPT: recibo da mensagem DO CONTATO segue inbound e nao chama o Multiplix", async () => {
  const chamadas: Chamada[] = [];
  const supabase = fakeSupabase(
    chamadas,
    {},
    [{ id: "msg-in-1", status: "received", external_id: "3EB0GO-IN", sender: "contact", whatsapp_connection_id: "conn-1" }],
  );
  const traduzido = translateGoPayload(goReceipt("delivered", "3EB0GO-IN"));

  await handleMessagesUpdate(supabase, INSTANCE, traduzido.data, {});

  const escrita = supabase.updates.find((u) => u.tabela === "messages" && u.filtros.id === "msg-in-1");
  assertEquals(escrita?.payload.status, "delivered", "o recibo inbound continua atualizando a linha do contato");
  assertEquals(chamadas.filter((c) => c.nome === "record_multiplix_recipient_delivered").length, 0);
  assertEquals(chamadas.filter((c) => c.nome === "record_multiplix_item_delivered").length, 0);
});
