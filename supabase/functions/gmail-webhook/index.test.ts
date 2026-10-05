// R2-API-011 — o gmail-webhook não pode mais varrer só uma página de
// messageAdded e gravar historyData.historyId no fim: ele delega ao pipeline
// incremental canônico (todas as páginas/tipos, cursor com compare-and-swap,
// 404 = resync marcado).
//
// OFFLINE: o client service_role e o veredito OIDC são injetados (o gate OIDC
// bloqueante com JWT RS256 real já é provado em
// _shared/__tests__/webhook-auth-gates.test.ts); a API do Gmail é um fetch
// roteado por URL. O fake Supabase tem filtros de verdade — o compare-and-swap
// do cursor é exercido, não simulado.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
//     supabase/functions/gmail-webhook/index.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleGmailWebhook } from "./index.ts";
import {
  gmailMessage,
  makeFakeSupabase,
  makeGmailFetch,
  withFetch,
} from "../_shared/__tests__/gmail-incremental-sync.test.ts";

const WEBHOOK_URL = "https://example.supabase.co/functions/v1/gmail-webhook";

const ACCOUNT = {
  id: "acc-wh",
  user_id: "user-1",
  email_address: "conta@example.com",
  is_active: true,
  sync_status: "synced",
  token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  history_id: "100",
};

function pubsubRequest(historyId = "150"): Request {
  const data = btoa(JSON.stringify({ emailAddress: "conta@example.com", historyId }));
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer oidc-jwt" },
    body: JSON.stringify({ message: { data } }),
  });
}

function webhookDeps(client: unknown) {
  return {
    supabase: client,
    verifyOidc: () => Promise.resolve({ ok: true as const, reason: "valid" as const, email: "sa@x.iam.gserviceaccount.com" }),
  };
}

Deno.test("gmail-webhook: push do Pub/Sub processa o histórico pelo pipeline canônico e avança o cursor", async () => {
  const { db, client } = makeFakeSupabase({ gmail_accounts: [{ ...ACCOUNT }] });
  const seen = { historyUrls: [] as string[] };
  const fetcher = makeGmailFetch({
    history: [
      { status: 200, body: { history: [{ messagesAdded: [{ message: { id: "m-w1" } }] }], historyId: "150", nextPageToken: "tok-p2" } },
      { status: 200, body: { history: [{ messagesAdded: [{ message: { id: "m-w2" } }] }], historyId: "200" } },
    ],
    messages: {
      "m-w1": { status: 200, body: gmailMessage("m-w1") },
      "m-w2": { status: 200, body: gmailMessage("m-w2") },
    },
  }, seen);

  await withFetch(fetcher, async () => {
    const res = await handleGmailWebhook(pubsubRequest(), webhookDeps(client));
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.acknowledged, true);
    assertEquals(body.processed, 2);
    assertEquals(seen.historyUrls.length, 2); // paginação real, não só a primeira página
    assertEquals(db.tables.email_messages.map((m) => m.gmail_message_id).sort(), ["m-w1", "m-w2"]);
    assertEquals(db.tables.gmail_accounts[0].history_id, "200");
  });
});

Deno.test("gmail-webhook: mensagem com GET falho NÃO deixa o cursor avançar", async () => {
  const { db, client } = makeFakeSupabase({ gmail_accounts: [{ ...ACCOUNT }] });
  const fetcher = makeGmailFetch({
    history: [{ status: 200, body: { history: [{ messagesAdded: [{ message: { id: "m-ruim" } }] }], historyId: "200" } }],
    messages: { "m-ruim": { status: 500, body: { error: "boom" } } },
  });

  await withFetch(fetcher, async () => {
    const res = await handleGmailWebhook(pubsubRequest(), webhookDeps(client));
    const body = await res.json();

    // Pub/Sub continua recebendo 200 (o cursor preservado é o ponto de retomada),
    // mas o history_id NÃO pode ter avançado.
    assertEquals(res.status, 200);
    assertEquals(body.acknowledged, true);
    assertEquals(body.cursor_advanced, false);
    assertEquals(db.tables.gmail_accounts[0].history_id, "100");
    assertEquals(db.tables.gmail_accounts[0].sync_status, "error");
  });
});

Deno.test("gmail-webhook: history 404 marca a conta para resync em vez de avançar para ponto inválido", async () => {
  const { db, client } = makeFakeSupabase({ gmail_accounts: [{ ...ACCOUNT }] });
  const fetcher = makeGmailFetch({ history: [{ status: 404, body: { error: "notFound" } }] });

  await withFetch(fetcher, async () => {
    const res = await handleGmailWebhook(pubsubRequest(), webhookDeps(client));
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.acknowledged, true);
    assertEquals(body.resync_needed, true);
    assertEquals(db.tables.gmail_accounts[0].history_id, null);
    assertEquals(db.tables.gmail_accounts[0].sync_status, "pending");
  });
});

Deno.test("gmail-webhook: sem history_id na conta responde acknowledged sem chamar o Gmail", async () => {
  const { client } = makeFakeSupabase({ gmail_accounts: [{ ...ACCOUNT, history_id: null }] });
  const seen = { historyUrls: [] as string[] };
  const fetcher = makeGmailFetch({}, seen);

  await withFetch(fetcher, async () => {
    const res = await handleGmailWebhook(pubsubRequest(), webhookDeps(client));
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.acknowledged, true);
    assertEquals(seen.historyUrls.length, 0);
  });
});

Deno.test("gmail-webhook: veredito OIDC de recusa continua bloqueando (401 antes de qualquer efeito)", async () => {
  const { db, client } = makeFakeSupabase({ gmail_accounts: [{ ...ACCOUNT }] });
  const deps = {
    supabase: client,
    verifyOidc: () => Promise.resolve({ ok: false as const, reason: "bad_email" as const }),
  };

  const res = await handleGmailWebhook(pubsubRequest(), deps);
  assertEquals(res.status, 401);
  assertEquals(db.tables.gmail_accounts[0].history_id, "100");
});
