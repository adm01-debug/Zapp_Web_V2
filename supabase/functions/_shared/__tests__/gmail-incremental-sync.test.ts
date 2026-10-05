// R2-API-011 — pipeline incremental canônico do Gmail (um só, por conta),
// consumido por gmail-webhook, gmail-cron-sync e gmail-sync (sync-incremental).
//
// O que estes testes provam contra o defeito auditado:
//  - TODAS as páginas do users.history.list são percorridas (nextPageToken) e
//    TODOS os tipos (messageAdded/messageDeleted/labelAdded/labelRemoved) viram
//    efeitos — não uma heurística de "caixa recente" limitada a 50.
//  - O cursor (gmail_accounts.history_id) só avança DEPOIS dos efeitos e com
//    compare-and-swap (update filtrado pelo history_id lido no início): uma
//    invocação concorrente/atrasada NÃO regride o cursor compartilhado.
//  - GET de mensagem falho, upsert falho e history 404 não avançam o cursor;
//    o 404 marca a conta para resync completo (sync_status pending + history_id
//    null) em vez de pular para um ponto inválido.
//  - O gmail-sync real (handler exportado) usa o MESMO pipeline e preserva o
//    contrato HTTP: 207 { success:false, synced, failed } na falha parcial e
//    200 { success:true, ... } no sucesso.
//
// OFFLINE: o client Supabase é um fake PostgREST em memória (filtros eq/in/ilike
// de verdade — o compare-and-swap é exercido, não simulado) e a API do Gmail é
// um globalThis.fetch roteado por URL.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
//     supabase/functions/_shared/__tests__/gmail-incremental-sync.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runGmailIncrementalSync } from "../gmail-helpers.ts";
import { handleGmailSync } from "../../gmail-sync/index.ts";
import { Logger } from "../validation.ts";

// ---------------------------------------------------------------------------
// Supabase falso (PostgREST em memória, com filtros e compare-and-swap reais)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Terminal = { data: unknown; error: unknown; count?: number | null };

interface FakeDbOptions {
  gmail_accounts?: Row[];
  email_threads?: Row[];
  email_messages?: Row[];
  email_attachments?: Row[];
  contacts?: Row[];
  /** "tabela:op" -> mensagem de erro devolvida na próxima operação dessa tabela */
  failOps?: Record<string, string>;
}

interface FakeDbState {
  tables: Record<string, Row[]>;
  failOps: Record<string, string>;
  nextId: number;
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
}

class FakeQuery {
  private mode: "select" | "update" | "upsert" | "delete" = "select";
  private filters: Array<(row: Row) => boolean> = [];
  private payload: Row[] = [];
  private conflictCols: string[] = [];
  private ordering: { col: string; asc: boolean } | null = null;
  private headOnly = false;
  private returnRows = false;
  private terminal: "list" | "single" | "maybeSingle" = "list";

  constructor(private db: FakeDbState, private table: string) {}

  select(_cols = "*", opts: { count?: string; head?: boolean } = {}) {
    if (this.mode === "select") {
      if (opts.head) this.headOnly = true;
    } else {
      this.returnRows = true;
    }
    return this;
  }
  update(fields: Row) { this.mode = "update"; this.payload = [fields]; return this; }
  upsert(rows: Row | Row[], opts: { onConflict?: string } = {}) {
    this.mode = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflictCols = (opts.onConflict ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return this;
  }
  insert(rows: Row | Row[]) { return this.upsert(rows); }
  delete() { this.mode = "delete"; return this; }
  eq(col: string, val: unknown) { this.filters.push((r) => r[col] === val); return this; }
  is(col: string, val: unknown) { this.filters.push((r) => (r[col] ?? null) === val); return this; }
  in(col: string, vals: unknown[]) { this.filters.push((r) => vals.includes(r[col])); return this; }
  ilike(col: string, val: string) {
    const want = val.replace(/%/g, "").toLowerCase();
    this.filters.push((r) => String(r[col] ?? "").toLowerCase() === want);
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.ordering = { col, asc: opts.ascending !== false };
    return this;
  }
  single() { this.terminal = "single"; return this.execPromise(); }
  maybeSingle() { this.terminal = "maybeSingle"; return this.execPromise(); }
  then<TResult1 = Terminal, TResult2 = never>(
    onOk?: ((v: Terminal) => TResult1 | PromiseLike<TResult1>) | null,
    onErr?: ((e: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.exec()).then(onOk, onErr);
  }

  private rows(): Row[] {
    const all: Row[] = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);
    const matched = all.filter((r) => this.filters.every((f) => f(r)));
    if (this.ordering) {
      const { col, asc } = this.ordering;
      matched.sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1) * (asc ? 1 : -1));
    }
    return matched;
  }

  private fail(op: string): Terminal | null {
    const msg = this.db.failOps?.[`${this.table}:${op}`];
    return msg ? { data: null, error: { message: msg, code: "FAKE" } } : null;
  }

  private exec(): Terminal {
    const fail = this.fail(this.mode);
    if (fail) return fail;
    const table: Row[] = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);

    if (this.mode === "select") {
      if (this.headOnly) return { data: null, error: null, count: this.rows().length };
      return { data: this.rows().map((r) => ({ ...r })), error: null };
    }
    if (this.mode === "update") {
      const touched: Row[] = [];
      for (const row of table) {
        if (this.filters.every((f) => f(row))) {
          Object.assign(row, this.payload[0]);
          touched.push({ ...row });
        }
      }
      return { data: this.returnRows ? touched : null, error: null };
    }
    if (this.mode === "upsert") {
      const written: Row[] = [];
      for (const row of this.payload) {
        const existing = this.conflictCols.length
          ? table.find((r) => this.conflictCols.every((c) => r[c] === row[c]))
          : undefined;
        if (existing) {
          Object.assign(existing, row);
          written.push({ ...existing });
        } else {
          const stored = { ...row };
          if (stored.id === undefined) stored.id = `gen-${this.db.nextId++}`;
          table.push(stored);
          written.push({ ...stored });
        }
      }
      return { data: this.returnRows ? written : written, error: null };
    }
    // delete
    const doomed = new Set(this.rows());
    this.db.tables[this.table] = table.filter((r) => !doomed.has(r));
    return { data: null, error: null };
  }

  private execPromise(): Promise<Terminal> {
    const res = this.exec();
    if (res.error) return Promise.resolve(res);
    const rows = Array.isArray(res.data) ? res.data : res.data == null ? [] : [res.data];
    if (this.terminal === "single") {
      return Promise.resolve(rows.length
        ? { data: rows[0], error: null }
        : { data: null, error: { message: "0 rows", code: "PGRST116" } });
    }
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }
}

/** Fake do client Supabase. `tables` é exposto para o teste inspecionar o estado. */
export function makeFakeSupabase(opts: FakeDbOptions = {}) {
  const db = {
    tables: {
      gmail_accounts: opts.gmail_accounts ?? [],
      email_threads: opts.email_threads ?? [],
      email_messages: opts.email_messages ?? [],
      email_attachments: opts.email_attachments ?? [],
      contacts: opts.contacts ?? [],
    } as Record<string, Row[]>,
    failOps: opts.failOps ?? {},
    nextId: 1,
    rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  };
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      db.rpcCalls.push({ fn, args });
      if (fn === "get_gmail_tokens") {
        return Promise.resolve({ data: [{ access_token: "ya29.fake", refresh_token: "rt.fake" }], error: null });
      }
      if (fn === "store_gmail_tokens") return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
    },
    from(table: string) { return new FakeQuery(db, table); },
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
  };
  return { db, client };
}

// ---------------------------------------------------------------------------
// API do Gmail falsa (globalThis.fetch roteado por URL)
// ---------------------------------------------------------------------------

interface GmailRouteSpec {
  /** respostas de /history em ordem (cada chamada consome uma) */
  history?: Array<{ status: number; body: unknown }>;
  /** /messages/<id>?format=full -> resposta por id */
  messages?: Record<string, { status: number; body: unknown }>;
  /** /messages?... -> lista de ids (full sync do cron) */
  list?: { status: number; body: unknown };
  /** /profile -> perfil com historyId */
  profile?: { status: number; body: unknown };
  /** token refresh */
  token?: { status: number; body: unknown };
}

export function makeGmailFetch(spec: GmailRouteSpec, seen: { historyUrls: string[] } = { historyUrls: [] }) {
  return (input: Request | URL | string, _init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const path = url.pathname;
    if (path.endsWith("/history")) {
      seen.historyUrls.push(url.toString());
      const next = spec.history?.length ? spec.history.shift()! : { status: 200, body: { history: [], historyId: "0" } };
      return Promise.resolve(new Response(JSON.stringify(next.body), { status: next.status }));
    }
    const msgMatch = path.match(/\/messages\/([^/?]+)$/);
    if (msgMatch) {
      const hit = spec.messages?.[decodeURIComponent(msgMatch[1])] ?? { status: 404, body: { error: "not found" } };
      return Promise.resolve(new Response(JSON.stringify(hit.body), { status: hit.status }));
    }
    if (path.endsWith("/messages")) {
      const list = spec.list ?? { status: 200, body: { messages: [] } };
      return Promise.resolve(new Response(JSON.stringify(list.body), { status: list.status }));
    }
    if (path.endsWith("/profile")) {
      const profile = spec.profile ?? { status: 200, body: { historyId: "999" } };
      return Promise.resolve(new Response(JSON.stringify(profile.body), { status: profile.status }));
    }
    if (url.hostname === "oauth2.googleapis.com") {
      const token = spec.token ?? { status: 200, body: { access_token: "ya29.refreshed", expires_in: 3600 } };
      return Promise.resolve(new Response(JSON.stringify(token.body), { status: token.status }));
    }
    return Promise.reject(new Error(`fetch não mockado: ${url}`));
  };
}

export function withFetch(fn: (input: Request | URL | string, init?: RequestInit) => Promise<Response>, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = fn as typeof fetch;
  return run().finally(() => { globalThis.fetch = original; });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export function gmailMessage(id: string, labelIds: string[] = ["INBOX"], threadId = `th-${id}`) {
  return {
    id,
    threadId,
    labelIds,
    snippet: `trecho ${id}`,
    historyId: "0",
    internalDate: "1730000000000",
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: "Remetente <remetente@example.com>" },
        { name: "To", value: "conta@example.com" },
        { name: "Subject", value: `assunto ${id}` },
      ],
      body: { size: 4, data: btoa("corpo").replace(/\+/g, "-").replace(/\//g, "_") },
    },
  };
}

const ACCOUNT = {
  id: "acc-1",
  user_id: "user-1",
  email_address: "conta@example.com",
  is_active: true,
  sync_status: "synced",
  token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  history_id: "100",
};

const log = new Logger("test");

const okHistory = (records: unknown[], historyId: string, nextPageToken?: string) => ({
  status: 200,
  body: { history: records, historyId, ...(nextPageToken ? { nextPageToken } : {}) },
});

// ---------------------------------------------------------------------------
// Pipeline canônico (runGmailIncrementalSync)
// ---------------------------------------------------------------------------

Deno.test("pipeline: percorre TODAS as páginas do history e sincroniza os IDs alterados", async () => {
  const { db, client } = makeFakeSupabase({ gmail_accounts: [{ ...ACCOUNT }] });
  const seen = { historyUrls: [] as string[] };
  const fetcher = makeGmailFetch({
    history: [
      okHistory([{ messagesAdded: [{ message: { id: "m-p1" } }] }], "150", "tok-p2"),
      okHistory([{ labelsAdded: [{ message: { id: "m-p2" }, labelIds: ["IMPORTANT"] }] }], "200"),
    ],
    messages: {
      "m-p1": { status: 200, body: gmailMessage("m-p1") },
      "m-p2": { status: 200, body: gmailMessage("m-p2", ["INBOX", "IMPORTANT"]) },
    },
  }, seen);

  await withFetch(fetcher, async () => {
    const result = await runGmailIncrementalSync(client as never, { id: "acc-1", history_id: "100" }, "ya29.fake", log);

    assertEquals(result.status, "synced");
    assertEquals(result.cursor_advanced, true);
    assertEquals(result.history_id, "200");
    assertEquals(result.synced, 2);
    assertEquals(seen.historyUrls.length, 2);
    assert(seen.historyUrls[1].includes("pageToken=tok-p2"), "segunda página tem de usar o nextPageToken");
    for (const expected of ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"]) {
      assert(seen.historyUrls[0].includes(`historyTypes=${expected}`), `historyType ${expected} ausente`);
    }
    assertEquals(db.tables.email_messages.map((m) => m.gmail_message_id).sort(), ["m-p1", "m-p2"]);
    assertEquals(db.tables.gmail_accounts[0].history_id, "200");
    assertEquals(db.tables.gmail_accounts[0].sync_status, "synced");
  });
});

Deno.test("pipeline: messagesDeleted remove localmente e labelsRemoved ressincroniza a mensagem", async () => {
  const { db, client } = makeFakeSupabase({
    gmail_accounts: [{ ...ACCOUNT }],
    email_threads: [{ id: "t-del", gmail_account_id: "acc-1", gmail_thread_id: "th-m-del", message_count: 1 }],
    email_messages: [
      { id: "em-del", gmail_account_id: "acc-1", gmail_message_id: "m-del", thread_id: "t-del", label_ids: ["INBOX"], is_read: true, internal_date: "2025-01-01T00:00:00Z", from_name: "", from_address: "a@b.c", subject: "", snippet: "", is_starred: false },
      { id: "em-lab", gmail_account_id: "acc-1", gmail_message_id: "m-lab", thread_id: "t-lab", label_ids: ["INBOX", "UNREAD"], is_read: false, internal_date: "2025-01-01T00:00:00Z", from_name: "", from_address: "a@b.c", subject: "", snippet: "", is_starred: false },
    ],
  });
  const fetcher = makeGmailFetch({
    history: [
      okHistory([
        { messagesDeleted: [{ message: { id: "m-del" } }] },
        { labelsRemoved: [{ message: { id: "m-lab" }, labelIds: ["UNREAD"] }] },
      ], "200"),
    ],
    messages: { "m-lab": { status: 200, body: gmailMessage("m-lab", ["INBOX"]) } },
  });

  await withFetch(fetcher, async () => {
    const result = await runGmailIncrementalSync(client as never, { id: "acc-1", history_id: "100" }, "ya29.fake", log);

    assertEquals(result.status, "synced");
    assertEquals(result.deleted_messages, 1);
    assertEquals(db.tables.email_messages.some((m) => m.gmail_message_id === "m-del"), false);
    const relabeled = db.tables.email_messages.find((m) => m.gmail_message_id === "m-lab");
    assertEquals(relabeled?.label_ids, ["INBOX"]);
    assertEquals(relabeled?.is_read, true);
    assertEquals(db.tables.gmail_accounts[0].history_id, "200");
  });
});

Deno.test("pipeline: GET de mensagem falho NÃO avança o cursor e registra last_error", async () => {
  const { db, client } = makeFakeSupabase({ gmail_accounts: [{ ...ACCOUNT }] });
  const fetcher = makeGmailFetch({
    history: [okHistory([{ messagesAdded: [{ message: { id: "m-bad" } }] }], "200")],
    messages: { "m-bad": { status: 500, body: { error: "boom" } } },
  });

  await withFetch(fetcher, async () => {
    const result = await runGmailIncrementalSync(client as never, { id: "acc-1", history_id: "100" }, "ya29.fake", log);

    assertEquals(result.status, "partial_failure");
    assertEquals(result.cursor_advanced, false);
    assertEquals(result.failed, 1);
    assertEquals(db.tables.gmail_accounts[0].history_id, "100");
    assert(typeof db.tables.gmail_accounts[0].last_error === "string");
  });
});

Deno.test("pipeline: erro de upsert NÃO é tratado como sucesso — cursor preservado", async () => {
  const { db, client } = makeFakeSupabase({
    gmail_accounts: [{ ...ACCOUNT }],
    failOps: { "email_messages:upsert": "upsert falhou" },
  });
  const fetcher = makeGmailFetch({
    history: [okHistory([{ messagesAdded: [{ message: { id: "m-up" } }] }], "200")],
    messages: { "m-up": { status: 200, body: gmailMessage("m-up") } },
  });

  await withFetch(fetcher, async () => {
    const result = await runGmailIncrementalSync(client as never, { id: "acc-1", history_id: "100" }, "ya29.fake", log);

    assertEquals(result.status, "partial_failure");
    assertEquals(result.cursor_advanced, false);
    assertEquals(db.tables.gmail_accounts[0].history_id, "100");
  });
});

Deno.test("pipeline: duas invocações concorrentes — só uma avança o cursor (compare-and-swap)", async () => {
  const { db, client } = makeFakeSupabase({ gmail_accounts: [{ ...ACCOUNT }] });
  const fetcher = makeGmailFetch({
    history: [
      okHistory([{ messagesAdded: [{ message: { id: "m-a" } }] }], "200"),
      okHistory([{ messagesAdded: [{ message: { id: "m-a" } }] }], "200"),
    ],
    messages: { "m-a": { status: 200, body: gmailMessage("m-a") } },
  });

  await withFetch(fetcher, async () => {
    const [r1, r2] = await Promise.all([
      runGmailIncrementalSync(client as never, { id: "acc-1", history_id: "100" }, "ya29.fake", log),
      runGmailIncrementalSync(client as never, { id: "acc-1", history_id: "100" }, "ya29.fake", log),
    ]);
    const results = [r1, r2];
    assertEquals(results.filter((r) => r.cursor_advanced).length, 1);
    assertEquals(results.filter((r) => r.status === "cursor_conflict").length, 1);
    assertEquals(db.tables.gmail_accounts[0].history_id, "200");
  });
});

Deno.test("pipeline: cursor lido ficou velho (invocação atrasada) não regride o cursor", async () => {
  const { db, client } = makeFakeSupabase({ gmail_accounts: [{ ...ACCOUNT, history_id: "200" }] });
  const fetcher = makeGmailFetch({
    history: [okHistory([{ messagesAdded: [{ message: { id: "m-x" } }] }], "150")],
    messages: { "m-x": { status: 200, body: gmailMessage("m-x") } },
  });

  await withFetch(fetcher, async () => {
    // Invocação que leu history_id=100, mas outro processo já avançou para 200:
    // o update CAS filtra pelo cursor lido e não encontra linha -> conflito,
    // NUNCA reescreve 150 por cima de 200.
    const result = await runGmailIncrementalSync(client as never, { id: "acc-1", history_id: "100" }, "ya29.fake", log);
    assertEquals(result.status, "cursor_conflict");
    assertEquals(result.cursor_advanced, false);
    assertEquals(db.tables.gmail_accounts[0].history_id, "200");
  });
});

Deno.test("pipeline: history 404 (startHistoryId expirado) marca resync sem avançar cursor inválido", async () => {
  const { db, client } = makeFakeSupabase({ gmail_accounts: [{ ...ACCOUNT }] });
  const fetcher = makeGmailFetch({ history: [{ status: 404, body: { error: "notFound" } }] });

  await withFetch(fetcher, async () => {
    const result = await runGmailIncrementalSync(client as never, { id: "acc-1", history_id: "100" }, "ya29.fake", log);

    assertEquals(result.status, "history_expired");
    assertEquals(result.cursor_advanced, false);
    assertEquals(db.tables.gmail_accounts[0].history_id, null);
    assertEquals(db.tables.gmail_accounts[0].sync_status, "pending");
    assert(typeof db.tables.gmail_accounts[0].last_error === "string");
  });
});

// ---------------------------------------------------------------------------
// gmail-sync real: action=sync-incremental usa o MESMO pipeline e preserva o
// contrato HTTP (207 parcial / 200 sucesso) que o hook useGmail consome.
// ---------------------------------------------------------------------------

const SYNC_URL = "https://example.supabase.co/functions/v1/gmail-sync";
const SYNC_ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function syncRequest(body: unknown): Request {
  return new Request(SYNC_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer user-jwt" },
    body: JSON.stringify(body),
  });
}

function syncDeps(client: unknown) {
  return {
    supabase: client,
    getUser: () => Promise.resolve({ user: { id: "user-1" }, error: null }),
  };
}

Deno.test("gmail-sync sync-incremental: falha parcial responde 207 e preserva o cursor", async () => {
  const { db, client } = makeFakeSupabase({ gmail_accounts: [{ ...ACCOUNT, id: SYNC_ACCOUNT_ID }] });
  const fetcher = makeGmailFetch({
    history: [
      okHistory([
        { messagesAdded: [{ message: { id: "m-ok" } }] },
        { messagesAdded: [{ message: { id: "m-ruim" } }] },
      ], "200"),
    ],
    messages: {
      "m-ok": { status: 200, body: gmailMessage("m-ok") },
      "m-ruim": { status: 500, body: { error: "boom" } },
    },
  });

  await withFetch(fetcher, async () => {
    const res = await handleGmailSync(syncRequest({ action: "sync-incremental", account_id: SYNC_ACCOUNT_ID }), syncDeps(client));
    const body = await res.json();

    assertEquals(res.status, 207);
    assertEquals(body.success, false);
    assertEquals(body.cursor_advanced, false);
    assertEquals(body.failed, 1);
    assertEquals(db.tables.gmail_accounts[0].history_id, "100");
  });
});

Deno.test("gmail-sync sync-incremental: sucesso responde 200 com cursor avançado", async () => {
  const { db, client } = makeFakeSupabase({ gmail_accounts: [{ ...ACCOUNT, id: SYNC_ACCOUNT_ID }] });
  const fetcher = makeGmailFetch({
    history: [okHistory([{ messagesAdded: [{ message: { id: "m-ok" } }] }], "200")],
    messages: { "m-ok": { status: 200, body: gmailMessage("m-ok") } },
  });

  await withFetch(fetcher, async () => {
    const res = await handleGmailSync(syncRequest({ action: "sync-incremental", account_id: SYNC_ACCOUNT_ID }), syncDeps(client));
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.success, true);
    assertEquals(body.cursor_advanced, true);
    assertEquals(body.synced, 1);
    assertEquals(db.tables.gmail_accounts[0].history_id, "200");
  });
});
