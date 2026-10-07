/**
 * R2-API-004 (item 188 do BACKLOG_VERIFICADO) — contrato executável do lookup de conexão.
 *
 * O defeito: `getConnectionByInstance` descartava o `error` do PostgREST e gravava
 * `data = null` no cache de 5 min. Uma falha TRANSITÓRIA do banco passava a responder
 * "esta instância não tem conexão" — e os handlers de mensagem só aplicam
 * `eq(whatsapp_connection_id, ...)` QUANDO a conexão existe. Sem ela, send/update/delete
 * caíam no escopo global por external_id.
 *
 * O que fica travado:
 *   1. erro de consulta é ERRO: propaga e NÃO entra no cache (a próxima tentativa relê);
 *   2. ausência confirmada (sem erro) é resultado estável — continua indo para o cache;
 *   3. sem conexão resolvida, send/update/delete não mutam NADA por external_id global.
 *
 * Sem a correção, os casos 1, 3, 4, 5 e 6 falham (o 2 é guarda de regressão do cache).
 */
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getConnectionByInstance, invalidateConnectionCache } from "../evolution-helpers.ts";
import {
  handleMessagesDelete,
  handleMessagesUpdate,
  handleSendMessage,
} from "../evolution-webhook-msg-handlers.ts";
import type { EvolutionDbClient, EvolutionDbError } from "../evolution-types.ts";

type ConnResult = { data: { id: string } | null; error: EvolutionDbError | null };

interface FakeDb {
  client: EvolutionDbClient;
  /** Quantas vezes `whatsapp_connections` foi consultada (global, não por teste). */
  consultas: () => number;
  /** Toda escrita (update/insert/upsert/delete) que o handler tentou fazer. */
  mutacoes: Array<{ tabela: string; op: string; valores: Record<string, unknown> }>;
}

/**
 * Client chainable mínimo. `lookups` é a fila de respostas de `whatsapp_connections`
 * (a última repete quando a fila acaba); `mensagem` é a linha devolvida por qualquer
 * SELECT em `messages` — é assim que um handler enganado por uma query sem escopo
 * encontra a linha de OUTRA conexão.
 */
function fakeDb(opts: { lookups: ConnResult[]; mensagem?: Record<string, unknown> | null }): FakeDb {
  const mensagem = opts.mensagem ?? null;
  const mutacoes: FakeDb["mutacoes"] = [];
  const contador = { consultas: 0 };
  let lookupCount = 0;

  const chainFor = (tabela: string) => {
    let op = "select";
    let valores: Record<string, unknown> = {};

    const settle = () => {
      if (op !== "select") {
        mutacoes.push({ tabela, op, valores });
        return { data: null, error: null };
      }
      if (tabela === "whatsapp_connections") {
        contador.consultas++;
        const r = opts.lookups[Math.min(lookupCount, opts.lookups.length - 1)] ??
          { data: null, error: null };
        lookupCount++;
        return { data: (r.data as { id: string } | null), error: r.error };
      }
      return { data: mensagem, error: null };
    };

    // deno-lint-ignore no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: () => chain,
      update: (v: Record<string, unknown>) => { op = "update"; valores = v; return chain; },
      insert: (v: Record<string, unknown>) => { op = "insert"; valores = v; return chain; },
      upsert: (v: Record<string, unknown>) => { op = "upsert"; valores = v; return chain; },
      delete: () => { op = "delete"; return chain; },
      eq: () => chain,
      in: () => chain,
      is: () => chain,
      not: () => chain,
      gte: () => chain,
      like: () => chain,
      match: () => chain,
      filter: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => Promise.resolve(settle()),
      maybeSingle: () => Promise.resolve(settle()),
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

  return { client, consultas: () => contador.consultas, mutacoes };
}

Deno.test("R2-API-004: erro de lookup não vira cache negativo — a próxima tentativa relê o banco", async () => {
  invalidateConnectionCache();
  const db = fakeDb({
    lookups: [
      { data: null, error: { message: "conexão derrubada no pooler", code: "08006" } },
      { data: { id: "conn-1" }, error: null },
    ],
  });

  await assertRejects(
    () => getConnectionByInstance(db.client, "inst-erro"),
    Error,
    "Falha ao resolver conexão",
  );

  const segunda = await getConnectionByInstance(db.client, "inst-erro");
  assertEquals(segunda?.id, "conn-1", "o banco voltou: a segunda tentativa tem de reler e achar a conexão");
  assertEquals(db.consultas(), 2, "o erro não pode ser memorizado como 'sem conexão' pelos 5 min do TTL");
});

Deno.test("R2-API-004: erro e ausência confirmada são coisas distintas — ausência pode ficar no cache", async () => {
  invalidateConnectionCache();
  const db = fakeDb({
    lookups: [
      { data: null, error: null },
      { data: { id: "conn-9" }, error: null },
    ],
  });

  assertEquals(await getConnectionByInstance(db.client, "inst-sem-conexao"), null);
  assertEquals(await getConnectionByInstance(db.client, "inst-sem-conexao"), null);
  assertEquals(db.consultas(), 1, "ausência confirmada (sem erro) é estável: o cache segue valendo");

  invalidateConnectionCache("inst-sem-conexao");
  const aposRecuperacao = await getConnectionByInstance(db.client, "inst-sem-conexao");
  assertEquals(aposRecuperacao?.id, "conn-9", "com o cache invalidado o lookup volta a valer");
  assertEquals(db.consultas(), 2);
});

Deno.test("R2-API-004: messages.delete sem conexão resolvida não apaga por external_id global", async () => {
  invalidateConnectionCache();
  const db = fakeDb({ lookups: [{ data: null, error: null }] });

  await handleMessagesDelete(db.client, "inst-orfa", { messages: [{ key: { id: "3EB0DEL" } }] }, {});

  assertEquals(
    db.mutacoes.filter((m) => m.tabela === "messages").length,
    0,
    "sem conexão não há escopo por whatsapp_connection_id — então nenhuma linha pode ser apagada",
  );
});

Deno.test("R2-API-004: messages.update sem conexão resolvida não estampa recibo em linha de outra conexão", async () => {
  invalidateConnectionCache();
  const db = fakeDb({
    lookups: [{ data: null, error: null }],
    mensagem: { id: "msg-de-outra-conexao", status: "sent", sender: "agent", contact_id: "c-1" },
  });

  await handleMessagesUpdate(
    db.client,
    "inst-orfa",
    { messages: [{ key: { id: "3EB0UPD", fromMe: true }, status: "DELIVERY_ACK" }] },
    {},
  );

  assertEquals(db.mutacoes.length, 0, "o recibo não pode atingir a linha homônima de outra conexão");
});

Deno.test("R2-API-004: send.message sem conexão resolvida não confirma o envio de outra conexão", async () => {
  invalidateConnectionCache();
  const db = fakeDb({
    lookups: [{ data: null, error: null }],
    mensagem: { id: "msg-de-outra-conexao", status: "sending" },
  });

  await handleSendMessage(db.client, "inst-orfa", { messages: [{ key: { id: "3EB0SND", fromMe: true } }] }, {});

  assertEquals(db.mutacoes.length, 0, "o eco de envio não pode promover a 'sent' a mensagem de outra conexão");
});

Deno.test("R2-API-004: erro de lookup dentro do handler propaga e não muta", async () => {
  invalidateConnectionCache();
  const db = fakeDb({ lookups: [{ data: null, error: { message: "statement timeout", code: "57014" } }] });

  await assertRejects(
    () => handleMessagesDelete(db.client, "inst-erro", { messages: [{ key: { id: "3EB0ERR" } }] }, {}),
    Error,
    "Falha ao resolver conexão",
  );
  assertEquals(db.mutacoes.length, 0, "o ramo de erro não pode seguir para a mutação");
});
