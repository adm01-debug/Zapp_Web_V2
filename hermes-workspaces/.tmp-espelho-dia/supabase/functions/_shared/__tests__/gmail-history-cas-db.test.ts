/**
 * R2-API-011A — prova do CAS do reset de history 404 contra PostgREST/Postgres
 * de verdade (banco local da tarefa, subido com `zapp-db-local up <cópia>`).
 *
 * O teste de handler (`gmail-webhook/history-404-cas.test.ts`) cobre o
 * contrato do webhook; aqui o helper REAL `resetGmailHistoryCursor` fala com
 * o PostgREST real por HTTP — nenhum mock de cliente Supabase.
 *
 * Liga com duas variáveis próprias (não SUPABASE_URL, para não brigar com
 * outros testes):
 *   GMAIL_CAS_POSTGREST_URL — base onde `/gmail_accounts` resolve (o REST_URL
 *                             do stack local, ex. http://127.0.0.1:<p>/rest/v1)
 *   GMAIL_CAS_JWT           — JWT service_role do banco local
 * Sem elas, registra UM teste ignorado e o CI segue verde.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { resetGmailHistoryCursor } from "../gmail-helpers.ts";

const pgrest = Deno.env.get("GMAIL_CAS_POSTGREST_URL");
const jwt = Deno.env.get("GMAIL_CAS_JWT");
const enabled = Boolean(pgrest && jwt);

const ACCOUNT_ID = "4a000000-0000-4000-8000-000000000001";
const EMAIL = "gmail-cas-db@example.invalid";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} — esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);
  }
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

async function moveCursor(historyId: string): Promise<void> {
  // Simula outro fluxo (ex.: sync incremental) movendo o cursor.
  const res = await rest(`/gmail_accounts?id=eq.${ACCOUNT_ID}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ history_id: historyId, sync_status: "synced", last_error: null }),
  });
  if (!res.ok) throw new Error(`PATCH gmail_accounts respondeu ${res.status}: ${await res.text()}`);
}

// ---- proxy: supabase-js fala `/rest/v1/*`; o PostgREST serve a raiz ---------
function startProxy(target: string): Deno.HttpServer {
  return Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    const u = new URL(req.url);
    if (!u.pathname.startsWith("/rest/v1")) {
      return new Response(JSON.stringify({ message: "proxy: rota não suportada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const restPath = u.pathname.slice("/rest/v1".length) || "/";
    const headers = new Headers(req.headers);
    headers.delete("host");
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const res = await fetch(`${target}${restPath}${u.search}`, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
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

if (!enabled) {
  Deno.test({
    name: "gmail-history-cas-db: ignorado sem GMAIL_CAS_POSTGREST_URL/GMAIL_CAS_JWT (rode contra o banco local: `zapp-db-local up <cópia>` + `zapp-db-local env <cópia>`)",
    ignore: true,
    fn() {},
  });
} else {
  Deno.test("resetGmailHistoryCursor: 404 atrasado não sobrescreve cursor movido por outro fluxo", async () => {
    const proxy = startProxy(pgrest as string);
    const client = createClient(proxyUrl(proxy), jwt as string);
    try {
      await insertAccount(await anyUserId());
      await moveCursor("200");

      // 404 atrasado: o cursor LIDO ("100") já não é o da linha ("200").
      const conflito = await resetGmailHistoryCursor(client, ACCOUNT_ID, "100");
      assertEqual(conflito, "conflict", "cursor divergente: o helper tem de devolver conflito");
      let row = await accountRow();
      assertEqual(row.history_id, "200", "o cursor novo sobrevive ao reset atrasado");
      assertEqual(row.sync_status, "synced", "a conta não volta para pending");
      assertEqual(row.last_error, null, "nenhum erro falso é gravado");

      // Casamento: com o cursor atual o reset acontece de verdade.
      const reset = await resetGmailHistoryCursor(client, ACCOUNT_ID, "200");
      assertEqual(reset, "reset", "cursor igual: o helper aplica o reset");
      row = await accountRow();
      assertEqual(row.history_id, null, "history_id é zerado");
      assertEqual(row.sync_status, "pending", "a conta é marcada para resync");
      assertEqual(row.last_error, "History ID expired - full resync needed", "last_error do reset");
    } finally {
      await rest(`/gmail_accounts?id=eq.${ACCOUNT_ID}`, { method: "DELETE" });
      await proxy.shutdown();
    }
  });
}
