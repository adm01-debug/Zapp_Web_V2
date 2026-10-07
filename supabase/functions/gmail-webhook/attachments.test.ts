// R2-API-012 (P2) — o webhook do Gmail tem de PERSISTIR os metadados dos anexos.
//
// Defeito: `handleGmailWebhook` marcava `has_attachments` mas nunca gravava as
// linhas de `email_attachments`. O download sob demanda (`gmail-sync`
// `action=get-attachment`) exige essa linha — sem ela responde sempre
// `404 Attachment not found for this message`, mesmo com o anexo existindo.
//
// O que este teste trava:
//   1. A mensagem recebida por NOTIFICAÇÃO (history -> messageAdded) é persistida
//      em `email_messages` (prova que o handler chegou no caminho de gravação).
//   2. Cada anexo do payload vira uma linha em `email_attachments` com
//      `gmail_attachment_id`/`filename`/`mime_type`/`size_bytes` e o FK
//      `email_message_id` da mensagem.
//   3. `has_attachments` reflete o anexo ANINHADO (part dentro de part), não só
//      os filhos diretos do payload.
//
// Sem rede real: o JWKS do Google é servido por um Deno.serve em 127.0.0.1; o
// Gmail API e o PostgREST são interceptados por um `globalThis.fetch` roteado
// por host+path (mesmo padrão de `send-email/index.test.ts`). URL não roteada
// cai no fetch real, para o JWKS local funcionar.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/gmail-webhook/attachments.test.ts

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
// fetch roteado (PostgREST + Gmail API); registra método, path e corpo
// ---------------------------------------------------------------------------

type Route = { method: string; path: string; body: unknown; status?: number };
type Call = { method: string; path: string; body: unknown };

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
    calls.push({ method, path: alvo.pathname, body });
    return Promise.resolve(
      new Response(JSON.stringify(route.body), {
        status: route.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const post = (url: string, body: string, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

const GMAIL_URL = "http://localhost/functions/v1/gmail-webhook";
const ACCOUNT_ID = "acct-1";
const MSG_GMAIL_ID = "m1";

// Anexo ANINHADO: o payload misto traz text/plain + alternate com o anexo dentro.
const GMAIL_MESSAGE = {
  id: MSG_GMAIL_ID,
  threadId: "t1",
  labelIds: ["INBOX", "UNREAD"],
  snippet: "segue o relatorio",
  internalDate: String(Date.now()),
  payload: {
    mimeType: "multipart/mixed",
    headers: [
      { name: "Subject", value: "Com anexo" },
      { name: "From", value: "Ana <ana@externa.com>" },
      { name: "To", value: "conta@example.com" },
    ],
    parts: [
      {
        mimeType: "multipart/related",
        parts: [
          {
            mimeType: "multipart/alternative",
            parts: [
              { mimeType: "text/plain", body: { data: btoa("segue o relatorio"), size: 16 } },
            ],
          },
          { filename: "relatorio.pdf", mimeType: "application/pdf", body: { attachmentId: "ATT-1", size: 1234 } },
        ],
      },
    ],
  },
};

function routesBase(): Route[] {
  return [
    { method: "POST", path: "/rest/v1/rpc/get_gmail_tokens", body: [{ access_token: "tok-1", refresh_token: "ref-1" }] },
    {
      method: "GET",
      path: "/rest/v1/gmail_accounts",
      body: {
        id: ACCOUNT_ID,
        email_address: "conta@example.com",
        is_active: true,
        token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
        history_id: "1",
        user_id: "u1",
      },
    },
    { method: "GET", path: "/rest/v1/contacts", body: null },
    { method: "POST", path: "/rest/v1/email_threads", body: { id: "thread-local-1", contact_id: null } },
    { method: "POST", path: "/rest/v1/email_messages", body: { id: "msg-local-1" } },
    { method: "POST", path: "/rest/v1/email_attachments", body: {} },
    { method: "PATCH", path: "/rest/v1/email_threads", body: null },
    { method: "PATCH", path: "/rest/v1/gmail_accounts", body: null },
    {
      method: "GET",
      path: "/gmail/v1/users/me/history",
      body: { history: [{ messagesAdded: [{ message: { id: MSG_GMAIL_ID, labelIds: ["INBOX"] } }] }], historyId: "999" },
    },
    { method: "GET", path: `/gmail/v1/users/me/messages/${MSG_GMAIL_ID}`, body: GMAIL_MESSAGE },
  ];
}

Deno.test("gmail-webhook: persistir metadados dos anexos recebidos por notificação", async () => {
  const jwks = startJwksServer();
  const router = withFetch(routesBase());
  try {
    await withEnv(
      {
        GMAIL_OIDC_AUDIENCE: OIDC_AUD,
        GMAIL_OIDC_EMAIL: OIDC_EMAIL,
        GMAIL_OIDC_JWKS_URL: jwks.url,
        SUPABASE_URL: "https://stub.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "srk-de-teste",
      },
      async () => {
        const token = await mintJwt(validClaims());
        const res = await handleGmailWebhook(
          post(GMAIL_URL, JSON.stringify({
            message: { data: btoa(JSON.stringify({ emailAddress: "conta@example.com", historyId: "2" })) },
          }), { authorization: `Bearer ${token}` }),
        );
        assertEquals(res.status, 200);

        // 1. A mensagem foi persistida (o handler chegou no caminho de gravação).
        const msgCall = router.calls.find((c) => c.method === "POST" && c.path === "/rest/v1/email_messages");
        assert(msgCall, "email_messages não foi gravada — o handler não chegou no caminho de gravação");
        assertEquals((msgCall.body as { has_attachments: boolean }).has_attachments, true, "has_attachments deveria refletir o anexo aninhado");

        // 2. O anexo virou linha em email_attachments, com o FK da mensagem.
        const attCall = router.calls.find((c) => c.method === "POST" && c.path === "/rest/v1/email_attachments");
        assert(attCall, "email_attachments não foi gravada — o anexo notificado não fica baixável");
        assertEquals(attCall.body, {
          email_message_id: "msg-local-1",
          gmail_attachment_id: "ATT-1",
          filename: "relatorio.pdf",
          mime_type: "application/pdf",
          size_bytes: 1234,
        });

        // 3. Sem anexo, nenhuma linha espúria.
        assertEquals(
          router.calls.filter((c) => c.path === "/rest/v1/email_attachments").length,
          1,
          "deveria haver exatamente uma gravação de anexo para um anexo",
        );
      },
    );
  } finally {
    router.restore();
    await jwks.shutdown();
  }
});
