/**
 * Eco/recibo na LINHA PENDENTE CERTA — contrato executável.
 *
 * O defeito (12/10/2026): o casamento do eco (send.message) e do recibo
 * (messages.update) pegava QUALQUER linha `sender='agent'`, mesmo tipo,
 * `external_id` nulo, dentro de uma janela de 60s/300s, ordenava por
 * `created_at ASC` e adotava a primeira. Consequências:
 *
 *   1. duas mensagens seguidas -> o eco da segunda caía na PRIMEIRA linha
 *      (recibo na linha errada);
 *   2. mensagem digitada no celular adotava uma linha 'failed' (o único filtro
 *      era `external_id` nulo) — ressuscitava envio que tinha falhado;
 *   3. na corrida envio x webhook o `external_id` era estampado ANTES do
 *      `complete_outbound_message`, que então conflitava (502 "Erro ao enviar"
 *      numa mensagem que o provedor já tinha entregue);
 *   4. recibo `delivered/read` que chegava antes do `external_id` era
 *      DESCARTADO (log "skipping stub") — ou virava stub do contato carregando
 *      o NOSSO external_id;
 *   5. `failed` regredia `delivered/read` (`shouldUpdateStatus`).
 *
 * O que fica travado aqui:
 *   - só adota linha `sending` com CLAIM DE ENTREGA VIVO e `external_id` nulo;
 *   - para texto, o CONTEÚDO tem de bater (duas seguidas não se confundem);
 *   - sem conteúdo (recibo) só com candidato ÚNICO — ambíguo, não adota;
 *   - a adoção limpa o claim e o guarda em `delivery_last_claim_token` (é o que
 *     torna o `complete_outbound_message` idempotente em vez de conflito);
 *   - o recibo da corrida grava status + external_id na linha adotada;
 *   - `shouldUpdateStatus` não deixa mais `failed` apagar `delivered/read`.
 *
 * Só SQL falso em memória: nenhum banco real, nenhuma rede.
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  findPendingOutboundClaim,
  invalidateConnectionCache,
  shouldUpdateStatus,
  type PendingOutboundClaim,
} from "../evolution-helpers.ts";
import {
  handleMessagesUpdate,
  handleSendMessage,
} from "../evolution-webhook-msg-handlers.ts";
import type { EvolutionDbClient, EvolutionRow } from "../evolution-types.ts";

const JID = "5511988887777@s.whatsapp.net";
const CONEXAO = "conn-1";
const CONTATO = "c-1";
const FUTURO = new Date(Date.now() + 60_000).toISOString();
const PASSADO = new Date(Date.now() - 60_000).toISOString();

interface Mutacao {
  tabela: string;
  op: string;
  valores: Record<string, unknown>;
  filtros: Array<{ col: string; op: string; val: unknown }>;
}

interface FakeDb {
  client: EvolutionDbClient;
  mutacoes: Mutacao[];
}

/** Corrente mínima do PostgREST falso: cada método devolve a própria corrente. */
interface QueryChain {
  select: () => QueryChain;
  update: (valores: Record<string, unknown>) => QueryChain;
  insert: (valores: Record<string, unknown>) => QueryChain;
  upsert: (valores: Record<string, unknown>) => QueryChain;
  delete: () => QueryChain;
  eq: (col: string, val: unknown) => QueryChain;
  in: (col: string, val: unknown) => QueryChain;
  is: (col: string, val: unknown) => QueryChain;
  not: (col: string, val: unknown) => QueryChain;
  gte: (col: string, val: unknown) => QueryChain;
  like: () => QueryChain;
  match: () => QueryChain;
  filter: () => QueryChain;
  order: () => QueryChain;
  limit: () => QueryChain;
  single: () => Promise<unknown>;
  maybeSingle: () => Promise<unknown>;
  then: (resolve: (v: unknown) => unknown) => unknown;
}

/**
 * PostgREST falso que APLICA os filtros `eq/is/gte` sobre a lista de pendentes —
 * sem isso um teste de "não adota linha failed" passaria sem provar nada (o
 * filtro vive na query, não no fake).
 */
function fakeDb(opts: { pendentes?: EvolutionRow[]; erroNoSelect?: boolean }): FakeDb {
  const pendentes = opts.pendentes ?? [];
  const mutacoes: Mutacao[] = [];

  const casa = (row: EvolutionRow, filtros: Mutacao["filtros"]) =>
    filtros.every((f) => {
      const v = row[f.col];
      if (f.op === "is") return f.val === null ? v === null || v === undefined : v === f.val;
      if (f.op === "gte") return typeof v === "string" && v >= (f.val as string);
      return v === f.val;
    });

  const chainFor = (tabela: string) => {
    let op = "select";
    let valores: Record<string, unknown> = {};
    let itemUnico = false;
    let lista = false;
    const filtros: Mutacao["filtros"] = [];

    const settle = () => {
      if (op !== "select") {
        mutacoes.push({ tabela, op, valores, filtros: [...filtros] });
        return { data: null, error: null };
      }
      if (tabela === "whatsapp_connections") {
        return { data: { id: CONEXAO }, error: null };
      }
      if (tabela === "contacts") {
        return { data: { id: CONTATO, avatar_url: null, assigned_to: null, name: "Contato Sintético" }, error: null };
      }
      if (tabela === "messages") {
        if (opts.erroNoSelect) return { data: null, error: { message: "timeout", code: "57014" } };
        const linhas = pendentes.filter((row) => casa(row, filtros));
        if (itemUnico) return { data: linhas[0] ?? null, error: null };
        if (lista) return { data: linhas, error: null };
        return { data: null, error: null };
      }
      return { data: null, error: null };
    };

    const chain: QueryChain = {
      select: () => chain,
      update: (v: Record<string, unknown>) => { op = "update"; valores = v; return chain; },
      insert: (v: Record<string, unknown>) => { op = "insert"; valores = v; return chain; },
      upsert: (v: Record<string, unknown>) => { op = "upsert"; valores = v; return chain; },
      delete: () => { op = "delete"; return chain; },
      eq: (col: string, val: unknown) => { filtros.push({ col, op: "eq", val }); return chain; },
      in: (col: string, val: unknown) => { filtros.push({ col, op: "in", val }); return chain; },
      is: (col: string, val: unknown) => { filtros.push({ col, op: "is", val }); return chain; },
      not: (col: string, val: unknown) => { filtros.push({ col, op: "not", val }); return chain; },
      gte: (col: string, val: unknown) => { filtros.push({ col, op: "gte", val }); return chain; },
      like: () => chain,
      match: () => chain,
      filter: () => chain,
      order: () => chain,
      limit: () => { lista = true; return chain; },
      single: () => { itemUnico = true; lista = false; return Promise.resolve(settle()); },
      maybeSingle: () => { itemUnico = true; lista = false; return Promise.resolve(settle()); },
      then: (resolve: (v: unknown) => unknown) => resolve(settle()),
    };
    return chain;
  };

  const client = {
    from: (t: string) => chainFor(t),
    rpc: () => Promise.resolve({ data: false, error: null }),
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
    channel: () => ({ send: () => Promise.resolve(null) }),
    removeChannel: () => {},
  } as unknown as EvolutionDbClient;

  return { client, mutacoes };
}

/** Linha pendente padrão: em envio, com claim vivo. */
function pendente(id: string, content: string, claim: string): EvolutionRow {
  return {
    id, content, message_type: "text", status: "sending",
    sender: "agent", contact_id: CONTATO, whatsapp_connection_id: CONEXAO,
    external_id: null, delivery_claim_token: claim,
    delivery_claim_expires_at: FUTURO, created_at: new Date().toISOString(),
  };
}

const updates = (db: FakeDb) => db.mutacoes.filter((m) => m.tabela === "messages" && m.op === "update");

// ---------------------------------------------------------------------------
// 1) O eco adota a linha CERTA entre duas seguidas
// ---------------------------------------------------------------------------

Deno.test("eco de duas mensagens seguidas adota a linha com o MESMO conteudo (não a primeira)", async () => {
  invalidateConnectionCache();
  const db = fakeDb({ pendentes: [pendente("m1", "linha um", "claim-1"), pendente("m2", "linha dois", "claim-2")] });

  await handleSendMessage(
    db.client,
    "inst-eco-1",
    { messages: [{ key: { id: "3EB0ECHO2", remoteJid: JID, fromMe: true }, message: { conversation: "linha dois" } }] },
    {},
  );

  const feitos = updates(db);
  assertEquals(feitos.length, 1, "o eco tem de adotar exatamente uma linha");
  assertEquals(feitos[0].filtros.find((f) => f.col === "id")?.val, "m2", "o eco da segunda tem de cair na segunda linha");
  assertEquals(feitos[0].valores.external_id, "3EB0ECHO2");
  assertEquals(feitos[0].valores.status, "sent");
  assertEquals(feitos[0].valores.delivery_claim_token, null, "o claim tem de ser limpo na adoção");
  assertEquals(
    feitos[0].valores.delivery_last_claim_token,
    "claim-2",
    "o claim tem de ser guardado para o complete_outbound_message ficar idempotente",
  );
});

Deno.test("eco sem candidato com o mesmo conteudo não adota linha nenhuma", async () => {
  invalidateConnectionCache();
  const db = fakeDb({ pendentes: [pendente("m1", "linha um", "claim-1")] });

  await handleSendMessage(
    db.client,
    "inst-eco-2",
    { messages: [{ key: { id: "3EB0ECHO9", remoteJid: JID, fromMe: true }, message: { conversation: "outra coisa" } }] },
    {},
  );

  assertEquals(updates(db).length, 0, "conteudo diferente não pode adotar a linha pendente");
});

// ---------------------------------------------------------------------------
// 2) Mensagem digitada no celular NÃO ressuscita linha 'failed' nem linha sem claim
// ---------------------------------------------------------------------------

Deno.test("mensagem digitada no celular não adota linha 'failed' (mesmo com claim vivo)", async () => {
  invalidateConnectionCache();
  const linha = pendente("mf", "mandei isso", "claim-f");
  linha.status = "failed";
  const db = fakeDb({ pendentes: [linha] });

  await handleSendMessage(
    db.client,
    "inst-eco-3",
    { messages: [{ key: { id: "3EB0PHONE", remoteJid: JID, fromMe: true }, message: { conversation: "mandei isso" } }] },
    {},
  );

  assertEquals(updates(db).length, 0, "linha 'failed' nunca pode ser promovida a 'sent' pelo eco");
});

Deno.test("mensagem digitada no celular não adota linha pendente SEM claim vivo", async () => {
  invalidateConnectionCache();
  const linha = pendente("m3", "oi", "claim-3");
  linha.delivery_claim_token = null;
  linha.delivery_claim_expires_at = null;
  const db = fakeDb({ pendentes: [linha] });

  await handleSendMessage(
    db.client,
    "inst-eco-4",
    { messages: [{ key: { id: "3EB0PHONE2", remoteJid: JID, fromMe: true }, message: { conversation: "oi" } }] },
    {},
  );

  assertEquals(updates(db).length, 0, "sem claim vivo não há linha nossa em envio para adotar");
});

Deno.test("claim vencido (expires_at no passado) não adota", async () => {
  invalidateConnectionCache();
  const linha = pendente("m4", "oi", "claim-4");
  linha.delivery_claim_expires_at = PASSADO;
  const db = fakeDb({ pendentes: [linha] });

  await handleSendMessage(
    db.client,
    "inst-eco-5",
    { messages: [{ key: { id: "3EB0PHONE3", remoteJid: JID, fromMe: true }, message: { conversation: "oi" } }] },
    {},
  );

  assertEquals(updates(db).length, 0);
});

// ---------------------------------------------------------------------------
// 3) O recibo (delivered/read) que chega ANTES do external_id não é descartado
// ---------------------------------------------------------------------------

Deno.test("recibo delivered antes do external_id adota a linha com claim vivo e guarda o status", async () => {
  invalidateConnectionCache();
  const db = fakeDb({ pendentes: [pendente("m9", "mensagem entregue", "claim-9")] });

  await handleMessagesUpdate(
    db.client,
    "inst-rcv-1",
    { messages: [{ key: { id: "3EB0RCV", remoteJid: JID, fromMe: false }, status: "DELIVERY_ACK" }] },
    {},
  );

  const feitos = updates(db);
  assertEquals(feitos.length, 1, "o recibo tem de gravar a linha adotada (não descartar)");
  assertEquals(feitos[0].filtros.find((f) => f.col === "id")?.val, "m9");
  assertEquals(feitos[0].valores.status, "delivered");
  assertEquals(feitos[0].valores.external_id, "3EB0RCV");
  assertEquals(feitos[0].valores.delivery_last_claim_token, "claim-9");
  assertEquals(feitos[0].valores.delivery_claim_token, null);
  assertEquals(
    db.mutacoes.filter((m) => m.tabela === "messages" && m.op === "upsert").length,
    0,
    "não pode virar stub '[Mensagem recebida]' do contato carregando o external_id da nossa mensagem",
  );
});

Deno.test("recibo sem claim vivo não adota nem cria stub de contato", async () => {
  invalidateConnectionCache();
  const linha = pendente("m10", "x", "claim-10");
  linha.delivery_claim_expires_at = null;
  linha.delivery_claim_token = null;
  linha.status = "failed";
  const db = fakeDb({ pendentes: [linha] });

  await handleMessagesUpdate(
    db.client,
    "inst-rcv-2",
    { messages: [{ key: { id: "3EB0RCV2", remoteJid: JID, fromMe: true }, status: "READ" }] },
    {},
  );

  assertEquals(updates(db).length, 0);
  assertEquals(db.mutacoes.filter((m) => m.op === "upsert").length, 0);
});

// ---------------------------------------------------------------------------
// 4) O helper: única origem da regra (ambíguo = não adota; erro = não adota)
// ---------------------------------------------------------------------------

Deno.test("findPendingOutboundClaim: sem conteudo e com 2 candidatos é ambíguo — não adota", async () => {
  invalidateConnectionCache();
  const db = fakeDb({ pendentes: [pendente("m1", "a", "claim-1"), pendente("m2", "b", "claim-2")] });

  const achado: PendingOutboundClaim | null = await findPendingOutboundClaim(db.client, {
    contactId: CONTATO,
    connectionId: CONEXAO,
  });

  assertEquals(achado, null, "dois candidatos sem conteudo para desempatar: fail-closed");
});

Deno.test("findPendingOutboundClaim: candidato único é adotado e devolve o claim token", async () => {
  invalidateConnectionCache();
  const db = fakeDb({ pendentes: [pendente("m7", "a", "claim-7")] });

  const achado = await findPendingOutboundClaim(db.client, { contactId: CONTATO, connectionId: CONEXAO });

  assertEquals(achado, { id: "m7", claimToken: "claim-7" });
});

Deno.test("findPendingOutboundClaim: erro de consulta não adota nada (fail-closed)", async () => {
  invalidateConnectionCache();
  const db = fakeDb({ pendentes: [pendente("m8", "a", "claim-8")], erroNoSelect: true });

  const achado = await findPendingOutboundClaim(db.client, { contactId: CONTATO, connectionId: CONEXAO });

  assertEquals(achado, null);
});

// ---------------------------------------------------------------------------
// 5) Status monotônico: 'failed' não apaga entrega confirmada
// ---------------------------------------------------------------------------

Deno.test("shouldUpdateStatus: failed não regride delivered/read, mas ainda vale de sending", () => {
  assertEquals(shouldUpdateStatus("delivered", "failed"), false, "ERROR tardio não pode apagar a entrega");
  assertEquals(shouldUpdateStatus("read", "failed"), false);
  assertEquals(shouldUpdateStatus("sent", "failed"), false);
  assertEquals(shouldUpdateStatus("sending", "failed"), true, "o erro ainda importa enquanto o envio não confirmou");
  assert(shouldUpdateStatus("sending", "delivered"), "recibo continua elevando");
});
