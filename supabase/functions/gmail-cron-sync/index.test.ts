/**
 * t_f4041bd2 — o incremental do cron (`gmail-cron-sync`, roda a cada 5 min)
 * precisa refletir o que foi feito no Gmail DEPOIS do último cursor:
 *   - `messageAdded`         → mensagem nova entra (inclusive enviado pelo celular)
 *   - `labelAdded/labelRemoved` → a mensagem é re-sincronizada (a thread passa a
 *     refletir a pasta do Gmail: sair da Entrada, entrar em Enviados etc.)
 *   - `messageDeleted`       → a mensagem some do local (e a thread órfã é
 *     reconciliada), sem re-buscar o conteúdo no Gmail
 * Prova também o teto de páginas de histórico por rodada com o cursor (history_id)
 * persistido na última página processada: é o que respeita o limite de tempo da
 * Edge numa caixa grande — a rodada seguinte continua exatamente de onde parou.
 * Prova ainda que o full sync do cron usa o escopo Entrada+Enviados (12 meses).
 *
 * A API do Gmail é respondida por um `fetch` falso por URL (sem rede externa) e o
 * cliente Supabase é um fake em memória: nenhuma escrita real, nada sai da máquina.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Logger } from "../_shared/validation.ts";
import { GMAIL_CRON_HISTORY_MAX_PAGES_PER_RUN, GMAIL_CRON_SCOPE_QUERY, runGmailCronIncrementalSync, syncGmailCronAccount } from "./index.ts";

const EMAIL = "conta@exemplo.com";
const CONTa_ID = "conta-1";

type Chamada = { tabela: string; ops: Array<[string, unknown[]]> };
type Cenario = { deletedRows?: Array<{ id: string; thread_id: string; gmail_message_id: string }> };

function fakeSupabase(chamadas: Chamada[], cenario: Cenario = {}) {
  return {
    rpc: () => Promise.resolve({ data: [{ access_token: "token", refresh_token: "refresh" }], error: null }),
    from(tabela: string) {
      const chamada: Chamada = { tabela, ops: [] };
      chamadas.push(chamada);
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "upsert", "update", "delete", "ilike", "single", "maybeSingle", "order"]) {
        builder[op] = (...args: unknown[]) => { chamada.ops.push([op, args]); return builder; };
      }
      builder.then = (resolve: (v: unknown) => unknown) => {
        const nomes = chamada.ops.map(([op]) => op);
        const payload = (op: string) => chamada.ops.find(([nome]) => nome === op)?.[1][0] as Record<string, unknown>;
        let data: unknown = null;
        if (tabela === "gmail_accounts") {
          if (nomes.includes("single")) data = { email_address: EMAIL };
          else if (nomes.includes("update") && nomes.includes("select")) data = [{ id: CONTa_ID }];
        } else if (tabela === "email_threads" && nomes.includes("upsert")) {
          data = { id: "thread-local-1", contact_id: "c1" };
        } else if (tabela === "email_messages" && nomes.includes("upsert")) {
          data = { id: `msg-${payload("upsert").gmail_message_id}` };
        } else if (tabela === "email_messages" && nomes.includes("in") && !nomes.includes("order")) {
          data = cenario.deletedRows ?? [];
        } else if (tabela === "email_messages" && nomes.includes("order")) {
          data = [{ from_name: "Cliente", from_address: "cliente@exemplo.com", subject: "Assunto", snippet: "oi", internal_date: "2023-11-14T22:13:20.000Z", label_ids: ["INBOX"], is_read: true, is_starred: false }];
        }
        return Promise.resolve(resolve({ data, error: null, count: 1 }));
      };
      return builder;
    },
  };
}

function mensagemFake(id: string, labelIds: string[] = ["INBOX"]) {
  return {
    id, threadId: `T-${id}`, labelIds, snippet: "oi", historyId: "1", internalDate: "1700000000000",
    payload: { mimeType: "text/plain", headers: [{ name: "From", value: "Cliente <cliente@exemplo.com>" }], body: { data: "b2k", size: 2 } },
  };
}

type Rota = (url: string, n: number) => { status?: number; body: unknown };

function comFetchFake(rota: Rota) {
  const fetchOriginal = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const resposta = rota(url, urls.length);
    return Promise.resolve(new Response(JSON.stringify(resposta.body), { status: resposta.status ?? 200 }));
  }) as typeof fetch;
  return { urls, restore: () => { globalThis.fetch = fetchOriginal; } };
}

const supabaseArg = (chamadas: Chamada[], cenario: Cenario = {}) =>
  fakeSupabase(chamadas, cenario) as unknown as Parameters<typeof runGmailCronIncrementalSync>[0];

function upsertsDe(chamadas: Chamada[]): Array<Record<string, unknown>> {
  return chamadas
    .filter(c => c.tabela === "email_messages")
    .flatMap(c => c.ops.filter(([op]) => op === "upsert").map(([, args]) => args[0] as Record<string, unknown>));
}

function cursorsGravados(chamadas: Chamada[]): Array<Record<string, unknown>> {
  return chamadas
    .filter(c => c.tabela === "gmail_accounts")
    .flatMap(c => c.ops.filter(([op]) => op === "update").map(([, args]) => args[0] as Record<string, unknown>));
}

function apagadosDe(chamadas: Chamada[]): number {
  return chamadas
    .filter(c => c.tabela === "email_messages")
    .flatMap(c => c.ops.filter(([op]) => op === "delete"))
    .length;
}

// ── 1. Exclusão e mudança de rótulo feitas no Gmail chegam ao local ──────────
Deno.test("incremental do cron: exclusão e mudança de rótulo do Gmail chegam ao local", async () => {
  const chamadas: Chamada[] = [];
  const { urls, restore } = comFetchFake((url) => {
    if (url.includes("/history?")) {
      return {
        body: {
          historyId: "150",
          history: [{
            messagesAdded: [{ message: { id: "s1" } }],
            labelsAdded: [{ message: { id: "m-rot" } }],
            labelsRemoved: [{ message: { id: "m-sem" } }],
            messagesDeleted: [{ message: { id: "m-del" } }],
          }],
        },
      };
    }
    if (url.includes("/messages/s1")) return { body: mensagemFake("s1", ["SENT"]) };
    return { body: mensagemFake(url.split("/messages/")[1].split("?")[0]) };
  });
  try {
    const r = await runGmailCronIncrementalSync(
      supabaseArg(chamadas, { deletedRows: [{ id: "local-m-del", thread_id: "thread-del", gmail_message_id: "m-del" }] }),
      { id: CONTa_ID, history_id: "100" },
      "token",
      new Logger("test"),
    );

    // os 4 tipos de histórico são pedidos ao Gmail
    const historico = urls.find(u => u.includes("/history?"));
    const tipos = new URL(historico!).searchParams.getAll("historyTypes");
    assertEquals(tipos, ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"]);
    assertEquals(new URL(historico!).searchParams.get("startHistoryId"), "100");

    // mensagem nova e mensagem que mudou de rótulo são re-sincronizadas
    for (const id of ["s1", "m-rot", "m-sem"]) {
      assertEquals(urls.some(u => u.includes(`/messages/${id}?`)), true, `${id} deveria ser re-buscado`);
    }
    assertEquals(upsertsDe(chamadas).find(m => m.gmail_message_id === "s1")?.label_ids, ["SENT"]);
    assertEquals(r.synced, 3);

    // mensagem excluída no Gmail NÃO é re-buscada: é apagada do local
    assertEquals(urls.some(u => u.includes("/messages/m-del?")), false);
    assertEquals(apagadosDe(chamadas), 1);
    assertEquals(r.deleted, 1);

    // cursor avança só no fim e via CAS, com o historyId da resposta
    assertEquals(r.cursor_advanced, true);
    assertEquals(cursorsGravados(chamadas)[cursorsGravados(chamadas).length - 1]?.history_id, "150");
    assertEquals(r.history_pages, 1);
    assertEquals(r.history_truncated, false);
  } finally { restore(); }
});

// ── 2. Borda do teto: histórico que cabe exatamente no teto NÃO trunca ───────
Deno.test("incremental do cron: histórico de tamanho exato ao teto não trunca", async () => {
  const chamadas: Chamada[] = [];
  const { urls, restore } = comFetchFake((_url, n) => ({
    body: { historyId: `h-${n}`, history: [], ...(n < GMAIL_CRON_HISTORY_MAX_PAGES_PER_RUN ? { nextPageToken: `tok-${n + 1}` } : {}) },
  }));
  let r: Awaited<ReturnType<typeof runGmailCronIncrementalSync>>;
  try {
    r = await runGmailCronIncrementalSync(supabaseArg(chamadas), { id: CONTa_ID, history_id: "h-0" }, "token", new Logger("test"));
  } finally { restore(); }
  assertEquals(urls.filter(u => u.includes("/history?")).length, GMAIL_CRON_HISTORY_MAX_PAGES_PER_RUN);
  assertEquals(r.history_pages, GMAIL_CRON_HISTORY_MAX_PAGES_PER_RUN);
  assertEquals(r.history_truncated, false);
  assertEquals(cursorsGravados(chamadas)[cursorsGravados(chamadas).length - 1]?.history_id, `h-${GMAIL_CRON_HISTORY_MAX_PAGES_PER_RUN}`);
});

// ── 3. Caixa grande: para no teto e a rodada seguinte continua do cursor ─────
Deno.test("incremental do cron: caixa grande para no teto e a rodada seguinte continua do cursor persistido", async () => {
  const chamadas1: Chamada[] = [];
  const urls1: string[] = [];
  const f1 = comFetchFake((url, n) => {
    urls1.push(url);
    return { body: { historyId: `h-${n}`, history: [], nextPageToken: `tok-${n + 1}` } };
  });
  let r1: Awaited<ReturnType<typeof runGmailCronIncrementalSync>>;
  try {
    r1 = await runGmailCronIncrementalSync(supabaseArg(chamadas1), { id: CONTa_ID, history_id: "h-0" }, "token", new Logger("test"));
  } finally { f1.restore(); }

  assertEquals(urls1.filter(u => u.includes("/history?")).length, GMAIL_CRON_HISTORY_MAX_PAGES_PER_RUN);
  assertEquals(r1.history_pages, GMAIL_CRON_HISTORY_MAX_PAGES_PER_RUN);
  assertEquals(r1.history_truncated, true);
  assertEquals(r1.cursor_advanced, true);
  const cursor1 = cursorsGravados(chamadas1)[cursorsGravados(chamadas1).length - 1]?.history_id as string;
  assertEquals(cursor1, `h-${GMAIL_CRON_HISTORY_MAX_PAGES_PER_RUN}`);

  const chamadas2: Chamada[] = [];
  const urls2: string[] = [];
  const f2 = comFetchFake((url, n) => {
    urls2.push(url);
    return { body: { historyId: `k-${n}`, history: [], nextPageToken: `tok-${n + 1}` } };
  });
  try {
    await runGmailCronIncrementalSync(supabaseArg(chamadas2), { id: CONTa_ID, history_id: cursor1 }, "token", new Logger("test"));
  } finally { f2.restore(); }

  const primeira = urls2.find(u => u.includes("/history?"));
  assertEquals(new URL(primeira!).searchParams.get("startHistoryId"), cursor1);
});

// ── 4. Full sync do cron usa o escopo Entrada+Enviados (12 meses) ────────────
Deno.test("full sync do cron: conta sem cursor usa o escopo Entrada+Enviados (12 meses)", async () => {
  const chamadas: Chamada[] = [];
  const { urls, restore } = comFetchFake((url) => {
    if (url.includes("/messages?")) return { body: { messages: [{ id: "s1" }] } };
    if (url.includes("/messages/s1")) return { body: mensagemFake("s1", ["SENT"]) };
    if (url.includes("/profile")) return { body: { historyId: "999" } };
    return { body: {} };
  });
  try {
    const r = await syncGmailCronAccount(
      supabaseArg(chamadas),
      { id: CONTa_ID, token_expires_at: new Date(Date.now() + 3_600_000).toISOString(), history_id: null },
      new Logger("test"),
    );

    const listagem = urls.find(u => u.includes("/messages?"));
    assertEquals(new URL(listagem!).searchParams.get("q"), GMAIL_CRON_SCOPE_QUERY);
    assertEquals(GMAIL_CRON_SCOPE_QUERY.includes("in:inbox"), true);
    assertEquals(GMAIL_CRON_SCOPE_QUERY.includes("in:sent"), true);
    assertEquals(GMAIL_CRON_SCOPE_QUERY.includes("newer_than:365d"), true);
    assertEquals(r.synced, 1);
    // o enviado do Gmail entra no local com o rótulo SENT
    assertEquals(upsertsDe(chamadas)[0].label_ids, ["SENT"]);
  } finally { restore(); }
});
