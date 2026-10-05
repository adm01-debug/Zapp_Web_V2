// R2-API-011 — o gmail-cron-sync não pode mais consultar uma página de
// messageAdded, montar os IDs alterados e DESCARTÁ-LOS para sincronizar "a
// caixa recente (50)". Ele usa o MESMO pipeline incremental canônico do
// webhook e do gmail-sync; o x-cron-secret em tempo constante é preservado.
//
// OFFLINE: client service_role injetado (fake PostgREST com filtros de
// verdade — o compare-and-swap do cursor é exercido) e Gmail API via fetch
// roteado. `handleGmailCronSync` é o handler exportado (import não sobe o
// servidor graças ao `if (import.meta.main)`).
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
//     supabase/functions/gmail-cron-sync/index.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleGmailCronSync } from "./index.ts";
import {
  gmailMessage,
  makeFakeSupabase,
  makeGmailFetch,
  withFetch,
} from "../_shared/__tests__/gmail-incremental-sync.test.ts";

const CRON_URL = "https://example.supabase.co/functions/v1/gmail-cron-sync";
const SECRET = "cron-secret-de-teste";

const ACCOUNT = {
  id: "acc-cron",
  user_id: "user-1",
  email_address: "conta@example.com",
  is_active: true,
  sync_status: "synced",
  token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  history_id: "100",
};

function cronRequest(secret?: string): Request {
  return new Request(CRON_URL, {
    method: "POST",
    headers: secret === undefined ? {} : { "x-cron-secret": secret },
  });
}

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, Deno.env.get(key));
    if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value);
  }
  return fn().finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value);
    }
  });
}

Deno.test("gmail-cron-sync: x-cron-secret errado ou ausente -> 403 (comparação em tempo constante preservada)", async () => {
  await withEnv({ CRON_SECRET: SECRET }, async () => {
    assertEquals((await handleGmailCronSync(cronRequest("errado"))).status, 403);
    assertEquals((await handleGmailCronSync(cronRequest())).status, 403);
    assertEquals((await handleGmailCronSync(cronRequest(SECRET + "-sufixo"))).status, 403);
  });
});

Deno.test("gmail-cron-sync: sem CRON_SECRET configurado -> 403 (falha fechada)", async () => {
  await withEnv({ CRON_SECRET: undefined }, async () => {
    assertEquals((await handleGmailCronSync(cronRequest(SECRET))).status, 403);
  });
});

Deno.test("gmail-cron-sync: conta com history_id roda o pipeline incremental real (todas as páginas/tipos)", async () => {
  const { db, client } = makeFakeSupabase({ gmail_accounts: [{ ...ACCOUNT }] });
  const seen = { historyUrls: [] as string[] };
  const fetcher = makeGmailFetch({
    history: [
      { status: 200, body: { history: [{ messagesAdded: [{ message: { id: "m-c1" } }] }], historyId: "150", nextPageToken: "tok-p2" } },
      { status: 200, body: { history: [{ labelsRemoved: [{ message: { id: "m-c2" }, labelIds: ["INBOX"] }] }], historyId: "200" } },
    ],
    messages: {
      "m-c1": { status: 200, body: gmailMessage("m-c1") },
      "m-c2": { status: 200, body: gmailMessage("m-c2", ["CATEGORY_UPDATES"]) },
    },
  }, seen);

  await withEnv({ CRON_SECRET: SECRET }, async () => {
    await withFetch(fetcher, async () => {
      const res = await handleGmailCronSync(cronRequest(SECRET), { supabase: client });
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.success, true);
      assertEquals(body.results, [{ id: "acc-cron", synced: 2, failed: 0, cursor_advanced: true, status: "synced" }]);
      // O defeito auditado era sincronizar "caixa recente limitada a 50" e
      // descartar os IDs do history: aqui a 2ª página e o labelRemoved foram
      // realmente aplicados, e o cursor avançou pelo compare-and-swap.
      assertEquals(seen.historyUrls.length, 2);
      assert(db.tables.email_messages.some((m) => m.gmail_message_id === "m-c2"));
      assertEquals(db.tables.gmail_accounts[0].history_id, "200");
    });
  });
});

Deno.test("gmail-cron-sync: falha parcial preserva o cursor e reporta erro por conta", async () => {
  const { db, client } = makeFakeSupabase({ gmail_accounts: [{ ...ACCOUNT }] });
  const fetcher = makeGmailFetch({
    history: [{ status: 200, body: { history: [{ messagesAdded: [{ message: { id: "m-ruim" } }] }], historyId: "200" } }],
    messages: { "m-ruim": { status: 500, body: { error: "boom" } } },
  });

  await withEnv({ CRON_SECRET: SECRET }, async () => {
    await withFetch(fetcher, async () => {
      const res = await handleGmailCronSync(cronRequest(SECRET), { supabase: client });
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.success, true);
      assertEquals(body.results[0].cursor_advanced, false);
      assertEquals(body.results[0].status, "partial_failure");
      assertEquals(db.tables.gmail_accounts[0].history_id, "100");
    });
  });
});

Deno.test("gmail-cron-sync: conta sem history_id continua no full sync (ancora o cursor no profile)", async () => {
  const { db, client } = makeFakeSupabase({ gmail_accounts: [{ ...ACCOUNT, history_id: null }] });
  const fetcher = makeGmailFetch({
    list: { status: 200, body: { messages: [{ id: "m-full" }] } },
    messages: { "m-full": { status: 200, body: gmailMessage("m-full") } },
    profile: { status: 200, body: { historyId: "999" } },
  });

  await withEnv({ CRON_SECRET: SECRET }, async () => {
    await withFetch(fetcher, async () => {
      const res = await handleGmailCronSync(cronRequest(SECRET), { supabase: client });
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.success, true);
      assertEquals(body.results[0].synced, 1);
      assertEquals(db.tables.gmail_accounts[0].history_id, "999");
      assertEquals(db.tables.gmail_accounts[0].sync_status, "synced");
    });
  });
});
