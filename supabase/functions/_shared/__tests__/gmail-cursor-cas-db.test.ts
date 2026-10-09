/**
 * R2-API-011B — prova do CAS no avanço de cursor de `gmail-sync` e
 * `gmail-cron-sync` contra PostgREST/Postgres de verdade (banco local da
 * tarefa, subido com `zapp-db-local up <cópia>`).
 *
 * Chama o código REAL dos dois fluxos — `runGmailIncrementalSync` (exportada
 * por gmail-sync/index.ts) e `runGmailCronIncrementalSync` (exportada por
 * gmail-cron-sync/index.ts) — com um cliente supabase-js falando HTTP com o
 * PostgREST real por um proxy 127.0.0.1. Nenhum mock do cliente Supabase.
 * A API do Gmail é respondida por um fetch falso por URL (sem rede externa);
 * nos cenários de concorrência o próprio responder move o cursor de verdade
 * no banco entre a leitura e a escrita — o interleaving real do defeito.
 *
 * Liga com duas variáveis próprias (não SUPABASE_URL, para não brigar com
 * outros testes):
 *   GMAIL_CAS_POSTGREST_URL — base onde `/gmail_accounts` resolve (o REST_URL
 *                             do stack local, ex. http://127.0.0.1:<p>/rest/v1)
 *   GMAIL_CAS_JWT           — JWT service_role do banco local
 * Sem elas, registra UM teste ignorado e o CI segue verde.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { runGmailIncrementalSync } from "../../gmail-sync/index.ts";
import { runGmailCronIncrementalSync } from "../../gmail-cron-sync/index.ts";
import { Logger } from "../validation.ts";

const pgrest = Deno.env.get("GMAIL_CAS_POSTGREST_URL");
const jwt = Deno.env.get("GMAIL_CAS_JWT");
const enabled = Boolean(pgrest && jwt);

const ACCOUNT_ID = "4b000000-0000-4000-8000-0000000000b1";
const EMAIL = "gmail-cursor-cas-db@example.invalid";

const testLog = () => new Logger("gmail-cursor-cas-db-test");

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} — esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);
  }
}

async function assertRejects(fn: () => Promise<unknown>, match: string, message: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    assert(m.includes(match), `${message} — rejeitou com erro inesperado: ${m}`);
    return;
  }
  throw new Error(`${message} — a promessa resolveu em vez de rejeitar`);
}

// ---- cliente HTTP cru contra o PostgREST (fixtures e asserções) ------------
async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${pgrest}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: jwt as string,
      Authorization: `Bearer ${jwt}`,
      ...((init.headers as Record<string, string>) ?? {}),
    },
  });
}

async function accountRow(): Promise<{ history_id: string | null; sync_status: string; last_error: string | null }> {
  const res = await rest(`/gmail_accounts?id=eq.${ACCOUNT_ID}&select=history_id,sync_status,last_error`);
  if (!res.ok) throw new Error(`GET gmail_accounts respondeu ${res.status}: ${await res.text()}`);
  const rows = await res.json() as Array<{ history_id: string | null; sync_status: string; last_error: string | null }>;
  assert(rows.length === 1, `conta ${ACCOUNT_ID} não encontrada`);
  return rows[0];
}

/** gmail_accounts.user_id tem FK para auth.users — usa um usuário semeado real. */
async function anyUserId(): Promise<string> {
  const res = await rest("/profiles?select=user_id&limit=1");
  if (!res.ok) throw new Error(`GET profiles respondeu ${res.status}: ${await res.text()}`);
  const rows = await res.json() as Array<{ user_id: string }>;
  assert(rows.length > 0 && rows[0].user_id, "o banco local precisa de ao menos um profile semeado");
  return rows[0].user_id;
}

async function insertAccount(userId: string): Promise<void> {
  // Idempotente: limpa resto de uma corrida anterior antes de semear.
  await rest(`/gmail_accounts?id=eq.${ACCOUNT_ID}`, { method: "DELETE" });
  const res = await rest("/gmail_accounts", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id: ACCOUNT_ID,
      user_id: userId,
      email_address: EMAIL,
      is_active: true,
      sync_status: "synced",
      history_id: "100",
    }),
  });
  if (!res.ok) throw new Error(`INSERT gmail_accounts respondeu ${res.status}: ${await res.text()}`);
}

/** Simula outro fluxo (ex.: webhook) movendo o cursor compartilhado. */
async function moveCursor(historyId: string, fields: Record<string, unknown> = {}): Promise<void> {
  const res = await rest(`/gmail_accounts?id=eq.${ACCOUNT_ID}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ history_id: historyId, sync_status: "synced", ...fields }),
  });
  if (!res.ok) throw new Error(`PATCH gmail_accounts respondeu ${res.status}: ${await res.text()}`);
}

// ---- proxy: supabase-js fala `/rest/v1/*`; o PostgREST serve a raiz ---------
// failCursorPatch responde 500 a todo PATCH de gmail_accounts que carregue
// history_id no corpo: é a "segunda escrita" falhando de verdade.
function startProxy(target: string, opts: { failCursorPatch?: boolean } = {}): Deno.HttpServer {
  return Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    const u = new URL(req.url);
    if (!u.pathname.startsWith("/rest/v1")) {
      return new Response(JSON.stringify({ message: "proxy: rota não suportada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const restPath = u.pathname.slice("/rest/v1".length) || "/";
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const body = hasBody ? await req.arrayBuffer() : undefined;
    if (
      opts.failCursorPatch && req.method === "PATCH" && restPath === "/gmail_accounts" &&
      body && new TextDecoder().decode(body).includes('"history_id"')
    ) {
      return new Response(JSON.stringify({ message: "proxy: falha injetada na escrita do cursor" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const headers = new Headers(req.headers);
    headers.delete("host");
    const res = await fetch(`${target}${restPath}${u.search}`, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });
    const out = new Headers(res.headers);
    out.delete("content-encoding");
    out.delete("content-length");
    return new Response(res.body, { status: res.status, headers: out });
  });
}

function proxyUrl(server: Deno.HttpServer): string {
  const addr = server.addr;
  if (addr.transport !== "tcp") throw new Error("proxy: esperado listener TCP");
  return `http://127.0.0.1:${addr.port}`;
}

// ---- fetch falso: só a API do Gmail; o resto (PostgREST) segue real ---------
type GmailResponder = (url: string) => Promise<unknown> | unknown;

async function withGmailFetch<T>(responder: GmailResponder, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://gmail.googleapis.com/")) {
      const payload = await responder(url);
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return original(input, init);
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

async function cleanup(): Promise<void> {
  await rest(`/gmail_accounts?id=eq.${ACCOUNT_ID}`, { method: "DELETE" });
}

if (!enabled) {
  Deno.test({
    name: "gmail-cursor-cas-db: ignorado sem GMAIL_CAS_POSTGREST_URL/GMAIL_CAS_JWT (rode contra o banco local: `zapp-db-local up <cópia>` + `zapp-db-local env <cópia>`)",
    ignore: true,
    fn() {},
  });
} else {
  Deno.test("gmail-sync: concorrência — outro fluxo move o cursor durante o sync e o CAS não sobrescreve", async () => {
    const proxy = startProxy(pgrest as string);
    const client = createClient(proxyUrl(proxy), jwt as string);
    try {
      await insertAccount(await anyUserId()); // cursor lido para a tentativa: "100"
      const outcome = await withGmailFetch(async () => {
        // Interleaving real: entre a leitura do cursor e a escrita, outro fluxo
        // move a linha para "200".
        await moveCursor("200", { last_error: "cursor de outro fluxo" });
        return { history: [], historyId: "150" };
      }, () => runGmailIncrementalSync(client, { id: ACCOUNT_ID, history_id: "100" }, "token-teste", testLog()));

      assertEqual(outcome.status, 200, "o sync conclui; só o cursor não avança");
      assertEqual(outcome.payload.success, true, "o trabalho do sync foi concluído");
      assertEqual(outcome.payload.cursor_advanced, false, "o conflito do CAS tem de ser visível na resposta");
      const row = await accountRow();
      assertEqual(row.history_id, "200", "o cursor movido por outro fluxo não é sobrescrito");
      assertEqual(row.last_error, "cursor de outro fluxo", "nenhum campo da linha é reescrito");
    } finally {
      await cleanup();
      await proxy.shutdown();
    }
  });

  Deno.test("gmail-sync: lista vazia com historyId avança o cursor (e só via CAS)", async () => {
    const proxy = startProxy(pgrest as string);
    const client = createClient(proxyUrl(proxy), jwt as string);
    try {
      await insertAccount(await anyUserId());
      const outcome = await withGmailFetch(
        () => ({ history: [], historyId: "150" }),
        () => runGmailIncrementalSync(client, { id: ACCOUNT_ID, history_id: "100" }, "token-teste", testLog()),
      );

      assertEqual(outcome.status, 200, "lista vazia não é erro");
      assertEqual(outcome.payload.cursor_advanced, true, "sem concorrência o cursor avança");
      assertEqual(outcome.payload.changed_messages, 0, "nada a sincronizar");
      const row = await accountRow();
      assertEqual(row.history_id, "150", "o cursor recebe o historyId da resposta");
      assertEqual(row.sync_status, "synced", "a conta é marcada como sincronizada");
      assertEqual(row.last_error, null, "last_error é limpo");
    } finally {
      await cleanup();
      await proxy.shutdown();
    }
  });

  Deno.test("gmail-sync: próxima página — o cursor final é o historyId da última página, com CAS sobre o cursor lido", async () => {
    const proxy = startProxy(pgrest as string);
    const client = createClient(proxyUrl(proxy), jwt as string);
    try {
      await insertAccount(await anyUserId());
      const urls: string[] = [];
      const outcome = await withGmailFetch((url) => {
        urls.push(url);
        if (url.includes("pageToken=tok-2")) return { history: [], historyId: "160" };
        return {
          history: [{ messagesDeleted: [{ message: { id: "m-del-1" } }] }],
          historyId: "140",
          nextPageToken: "tok-2",
        };
      }, () => runGmailIncrementalSync(client, { id: ACCOUNT_ID, history_id: "100" }, "token-teste", testLog()));

      assertEqual(urls.length, 2, "a paginação real fez duas chamadas ao /history");
      assert(urls[1].includes("pageToken=tok-2"), "a segunda página usa o nextPageToken");
      assertEqual(outcome.status, 200, "duas páginas concluem com sucesso");
      assertEqual(outcome.payload.history_pages, 2, "history_pages conta as duas páginas");
      assertEqual(outcome.payload.deleted_messages, 1, "a exclusão da primeira página é contabilizada");
      assertEqual(outcome.payload.cursor_advanced, true, "o cursor avança pelo CAS");
      const row = await accountRow();
      assertEqual(row.history_id, "160", "o cursor final é o historyId da ÚLTIMA página, não da primeira");
    } finally {
      await cleanup();
      await proxy.shutdown();
    }
  });

  Deno.test("gmail-sync: erro na segunda escrita (PATCH do cursor) propaga — o fluxo não declara sucesso", async () => {
    const proxy = startProxy(pgrest as string, { failCursorPatch: true });
    const client = createClient(proxyUrl(proxy), jwt as string);
    try {
      await insertAccount(await anyUserId());
      await withGmailFetch(
        () => ({ history: [], historyId: "150" }),
        () =>
          assertRejects(
            () => runGmailIncrementalSync(client, { id: ACCOUNT_ID, history_id: "100" }, "token-teste", testLog()),
            "Failed to persist Gmail history cursor",
            "o error do UPDATE do cursor não pode ser engolido",
          ),
      );
      const row = await accountRow();
      assertEqual(row.history_id, "100", "a escrita falhou de verdade e o cursor não avançou");
    } finally {
      await cleanup();
      await proxy.shutdown();
    }
  });

  Deno.test("gmail-cron-sync: concorrência — outro fluxo move o cursor e o CAS não sobrescreve nem marca erro", async () => {
    const proxy = startProxy(pgrest as string);
    const client = createClient(proxyUrl(proxy), jwt as string);
    try {
      await insertAccount(await anyUserId());
      const result = await withGmailFetch(async () => {
        await moveCursor("200", { last_error: "cursor de outro fluxo" });
        return { history: [], historyId: "150" };
      }, () => runGmailCronIncrementalSync(client, { id: ACCOUNT_ID, history_id: "100" }, "token-teste", testLog()));

      assertEqual(result.cursor_advanced, false, "o conflito do CAS aparece no resultado da conta");
      assertEqual(result.synced, 0, "nada a sincronizar");
      const row = await accountRow();
      assertEqual(row.history_id, "200", "o cursor movido por outro fluxo não é sobrescrito");
      assertEqual(row.last_error, "cursor de outro fluxo", "conflito não escreve last_error nem marca a conta como erro");
    } finally {
      await cleanup();
      await proxy.shutdown();
    }
  });

  Deno.test("gmail-cron-sync: lista vazia com historyId avança o cursor via CAS", async () => {
    const proxy = startProxy(pgrest as string);
    const client = createClient(proxyUrl(proxy), jwt as string);
    try {
      await insertAccount(await anyUserId());
      const result = await withGmailFetch(
        () => ({ history: [], historyId: "150" }),
        () => runGmailCronIncrementalSync(client, { id: ACCOUNT_ID, history_id: "100" }, "token-teste", testLog()),
      );

      assertEqual(result.cursor_advanced, true, "sem concorrência o cursor avança");
      assertEqual(result.synced, 0, "lista vazia não sincroniza nada");
      const row = await accountRow();
      assertEqual(row.history_id, "150", "o cursor recebe o historyId da resposta");
      assertEqual(row.last_error, null, "last_error é limpo");
    } finally {
      await cleanup();
      await proxy.shutdown();
    }
  });

  Deno.test("gmail-cron-sync: erro na segunda escrita (PATCH do cursor) propaga — a conta não sai como sincronizada", async () => {
    const proxy = startProxy(pgrest as string, { failCursorPatch: true });
    const client = createClient(proxyUrl(proxy), jwt as string);
    try {
      await insertAccount(await anyUserId());
      await withGmailFetch(
        () => ({ history: [], historyId: "150" }),
        () =>
          assertRejects(
            () => runGmailCronIncrementalSync(client, { id: ACCOUNT_ID, history_id: "100" }, "token-teste", testLog()),
            "Failed to persist Gmail history cursor",
            "o error do UPDATE do cursor não pode ser engolido",
          ),
      );
      const row = await accountRow();
      assertEqual(row.history_id, "100", "a escrita falhou de verdade e o cursor não avançou");
    } finally {
      await cleanup();
      await proxy.shutdown();
    }
  });
}
