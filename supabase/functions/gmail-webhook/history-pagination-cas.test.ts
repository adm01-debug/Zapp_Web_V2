// QA-SWEEP (2 bugs no mesmo arquivo) — supabase/functions/gmail-webhook/index.ts
//
// Bug 1 (HIGH, paginação): `handleGmailWebhook` lia só a PRIMEIRA página de
// `users/me/history.list`. Quando a API do Gmail devolve `nextPageToken`
// (mais eventos do que cabem numa resposta), as mensagens das páginas
// seguintes eram perdidas SILENCIOSAMENTE — sem log de erro, sem retry. O
// teste 1 prova isto com DUAS páginas (cada uma com uma mensagem nova
// distinta) e verifica que AMBAS as mensagens são persistidas.
//
// Bug 2 (LOW, CAS ausente): a atualização final do `history_id` era um
// UPDATE cru filtrado só por `id`, sem compare-and-swap. Se o sync por cron
// corresse concorrente e já tivesse movido o cursor para um valor mais novo,
// este UPDATE sobrescrevia (retrocedia) o cursor, causando reprocessamento ou
// perda de eventos. O teste 2 simula esse cenário: entre a leitura da conta
// (history_id "100") e o UPDATE final, o cursor da linha já foi movido para
// "900" por outro fluxo; o UPDATE do webhook (que tentaria gravar "150") não
// pode vencer essa corrida.
//
// Mesmo arranjo das demais suítes do gmail-webhook: JWKS local via Deno.serve
// + `globalThis.fetch` roteado (ver history-404-cas.test.ts / attachments.test.ts).
// URL não roteada cai no fetch real, para o JWKS local funcionar.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/gmail-webhook/history-pagination-cas.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleGmailWebhook } from "./index.ts";

// ---------------------------------------------------------------------------
// helpers de OIDC (JWT RS256 + JWKS local) — idênticos ao gate real do webhook
// ---------------------------------------------------------------------------

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const anteriores = new Map<string, string | undefined>();
  for (const [chave, valor] of Object.entries(vars)) {
    anteriores.set(chave, Deno.env.get(chave));
    if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
  }
  return fn().finally(() => {
    for (const [chave, valor] of anteriores) {
      if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
    }
  });
}

const encode = (s: string) => new TextEncoder().encode(s);

function b64url(data: Uint8Array): string {
  let binary = "";
  data.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const b64urlJson = (v: unknown) => b64url(encode(JSON.stringify(v)));

const rsaKeyPair = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);
const rsaPublicJwk = await crypto.subtle.exportKey("jwk", rsaKeyPair.publicKey);

const OIDC_AUD = "https://zapp.example.com/functions/v1/gmail-webhook";
const OIDC_EMAIL = "service-123@gcp-sa-pubsub.iam.gserviceaccount.com";

function startJwksServer() {
  const server = Deno.serve(
    { port: 0, hostname: "127.0.0.1" },
    () => new Response(JSON.stringify({ keys: [{ ...rsaPublicJwk, kid: "kid-google-1", alg: "RS256", use: "sig" }] }), {
      headers: { "content-type": "application/json" },
    }),
  );
  const port = (server.addr as Deno.NetAddr).port;
  return { url: `http://127.0.0.1:${port}/jwks`, shutdown: () => server.shutdown() };
}

async function mintJwt(claims: Record<string, unknown>): Promise<string> {
  const header = b64urlJson({ alg: "RS256", typ: "JWT", kid: "kid-google-1" });
  const payload = b64urlJson(claims);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", rsaKeyPair.privateKey, encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

const validClaims = () => ({
  iss: "https://accounts.google.com",
  aud: OIDC_AUD,
  sub: "1234567890",
  email: OIDC_EMAIL,
  email_verified: true,
  iat: Math.floor(Date.now() / 1000) - 60,
  exp: Math.floor(Date.now() / 1000) + 3600,
});

// ---------------------------------------------------------------------------
// fetch roteado: suporta handler por URL (necessário para decidir a página do
// history.list pelo `pageToken` da query e para o mini-armazém do CAS)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Route = {
  method: string;
  path: string;
  status?: number;
  body?: unknown;
  handler?: (url: URL, body: unknown) => { status?: number; body: unknown };
};
type Call = { method: string; url: string; path: string; body: unknown };

function withFetch(routes: Route[]) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    const alvo = new URL(url);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const route = routes.find((r) => r.method === method && r.path === alvo.pathname);
    if (!route) return original(input as RequestInfo, init);
    let body: unknown = null;
    if (typeof init?.body === "string") {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    calls.push({ method, url: alvo.toString(), path: alvo.pathname, body });
    const out = route.handler ? route.handler(alvo, body) : { status: route.status ?? 200, body: route.body };
    return Promise.resolve(
      new Response(JSON.stringify(out.body), {
        status: out.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

/** Mini-armazém de UMA linha: o PATCH só atualiza se TODOS os `eq.` casarem. */
function gmailAccountsStore(seed: Row) {
  const row = { ...seed };
  const handlePatch = (url: URL, body: unknown) => {
    const filtros = [...url.searchParams.entries()]
      .filter(([col, val]) => col !== "select" && val.startsWith("eq."));
    const casou = filtros.every(([col, val]) => String(row[col] ?? "") === val.slice(3));
    if (!casou) return { body: [] as Row[] };
    Object.assign(row, body as Row);
    return { body: [{ id: row.id }] };
  };
  return { row, handlePatch };
}

const post = (url: string, body: string, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

const GMAIL_URL = "http://localhost/functions/v1/gmail-webhook";
const ACCOUNT_ID = "4b000000-0000-4000-8000-000000000001";
const EMAIL = "conta@example.com";
const CURSOR_LIDO = "100"; // history_id devolvido pela leitura da conta

function contaLida() {
  return {
    id: ACCOUNT_ID,
    email_address: EMAIL,
    is_active: true,
    token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    history_id: CURSOR_LIDO,
    user_id: "4b000000-0000-4000-8000-0000000000ff",
  };
}

function pubSubRequest(jwt: string) {
  return post(GMAIL_URL, JSON.stringify({
    message: { data: btoa(JSON.stringify({ emailAddress: EMAIL, historyId: "150" })) },
  }), { authorization: `Bearer ${jwt}` });
}

const ambiente = (jwksUrl: string) => ({
  GMAIL_OIDC_AUDIENCE: OIDC_AUD,
  GMAIL_OIDC_EMAIL: OIDC_EMAIL,
  GMAIL_OIDC_JWKS_URL: jwksUrl,
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "srk-de-teste",
});

function gmailMessage(id: string) {
  return {
    id,
    threadId: `t-${id}`,
    labelIds: ["INBOX"],
    snippet: `mensagem ${id}`,
    internalDate: String(Date.now()),
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "Subject", value: `Assunto ${id}` },
        { name: "From", value: "Ana <ana@externa.com>" },
        { name: "To", value: EMAIL },
      ],
      body: { data: btoa(`corpo ${id}`) },
    },
  };
}

Deno.test("gmail-webhook history.list paginado: mensagem da SEGUNDA página não é perdida", async () => {
  const jwks = startJwksServer();
  const store = gmailAccountsStore({ ...contaLida(), sync_status: "synced" });

  // Primeira página (sem pageToken): traz m1 e um nextPageToken.
  // Segunda página (pageToken=tok-2): traz m2, sem nextPageToken.
  const historyHandler = (url: URL) => {
    const pageToken = url.searchParams.get("pageToken");
    if (!pageToken) {
      return {
        body: {
          history: [{ messagesAdded: [{ message: { id: "m1", labelIds: ["INBOX"] } }] }],
          nextPageToken: "tok-2",
          historyId: "150",
        },
      };
    }
    assertEquals(pageToken, "tok-2", "só existe uma segunda página neste cenário");
    return {
      body: {
        history: [{ messagesAdded: [{ message: { id: "m2", labelIds: ["INBOX"] } }] }],
        historyId: "150",
      },
    };
  };

  const routes: Route[] = [
    { method: "POST", path: "/rest/v1/rpc/get_gmail_tokens", body: [{ access_token: "tok-1", refresh_token: "ref-1" }] },
    { method: "GET", path: "/rest/v1/gmail_accounts", body: contaLida() },
    { method: "PATCH", path: "/rest/v1/gmail_accounts", handler: store.handlePatch },
    { method: "GET", path: "/rest/v1/contacts", body: null },
    { method: "POST", path: "/rest/v1/email_threads", body: { id: "thread-local-1", contact_id: null } },
    { method: "POST", path: "/rest/v1/email_messages", body: { id: "msg-local-1" } },
    { method: "PATCH", path: "/rest/v1/email_threads", body: null },
    { method: "GET", path: "/gmail/v1/users/me/history", handler: historyHandler },
    { method: "GET", path: "/gmail/v1/users/me/messages/m1", body: gmailMessage("m1") },
    { method: "GET", path: "/gmail/v1/users/me/messages/m2", body: gmailMessage("m2") },
  ];
  const router = withFetch(routes);

  try {
    await withEnv(ambiente(jwks.url), async () => {
      const res = await handleGmailWebhook(pubSubRequest(await mintJwt(validClaims())));
      assertEquals(res.status, 200);
      const corpo = await res.json();
      assertEquals(corpo.acknowledged, true);
      assertEquals(corpo.processed, 2, "as DUAS páginas de history.list precisam ser seguidas até esgotar");

      const historyCalls = router.calls.filter((c) => c.method === "GET" && c.path === "/gmail/v1/users/me/history");
      assertEquals(historyCalls.length, 2, "a segunda página só é buscada se o nextPageToken for seguido");

      const gmailMessageIds = router.calls
        .filter((c) => c.method === "POST" && c.path === "/rest/v1/email_messages")
        .map((c) => (c.body as { gmail_message_id: string }).gmail_message_id);
      assertEquals(new Set(gmailMessageIds), new Set(["m1", "m2"]), "m2 (só existe na 2ª página) tem de ser persistida");
    });
  } finally {
    router.restore();
    await jwks.shutdown();
  }
});

Deno.test("gmail-webhook update final do history_id: CAS impede retroceder cursor movido por outro fluxo", async () => {
  const jwks = startJwksServer();
  // Entre a leitura da conta (history_id "100") e o UPDATE final deste
  // webhook, um sync por cron concorrente já moveu o cursor para "900" — um
  // valor MAIS NOVO que o "150" que este webhook tentaria gravar.
  const store = gmailAccountsStore({ ...contaLida(), history_id: "900", sync_status: "synced" });

  const routes: Route[] = [
    { method: "POST", path: "/rest/v1/rpc/get_gmail_tokens", body: [{ access_token: "tok-1", refresh_token: "ref-1" }] },
    { method: "GET", path: "/rest/v1/gmail_accounts", body: contaLida() },
    { method: "PATCH", path: "/rest/v1/gmail_accounts", handler: store.handlePatch },
    // Nenhuma mensagem nova neste cenário — só interessa o update final.
    { method: "GET", path: "/gmail/v1/users/me/history", body: { history: [], historyId: "150" } },
  ];
  const router = withFetch(routes);

  try {
    await withEnv(ambiente(jwks.url), async () => {
      const res = await handleGmailWebhook(pubSubRequest(await mintJwt(validClaims())));
      assertEquals(res.status, 200, "o Pub/Sub precisa do ack mesmo em conflito de cursor");

      const historyPatch = router.calls.find((c) => c.method === "PATCH" && c.path === "/rest/v1/gmail_accounts");
      assert(historyPatch, "o update final do history_id deveria ter virado um PATCH em gmail_accounts");
      const params = new URL(historyPatch.url).searchParams;
      assertEquals(params.get("history_id"), `eq.${CURSOR_LIDO}`, "o UPDATE final precisa de CAS pelo cursor LIDO, não um update cru por id");

      assertEquals(store.row.history_id, "900", "o cursor mais novo (movido por outro fluxo) não pode ser retrocedido para 150");
    });
  } finally {
    router.restore();
    await jwks.shutdown();
  }
});
