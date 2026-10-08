// R2-API-011A (P1) — o reset por history 404 tem de ser COMPARE-AND-SWAP.
//
// Defeito: ao receber 404 de `users/me/history`, `handleGmailWebhook` limpava
// `history_id` e marcava `sync_status=pending` com um `update` cru filtrado só
// por `id`. Se outro fluxo (ex.: um incremental que correu depois da leitura)
// já tinha movido o cursor, o 404 ATRASADO sobrescrevia o cursor novo —
// a conta voltava a `pending` e perdia o history_id mais recente.
//
// O que este teste trava, nos DOIS cenários, chamando o handler REAL:
//   (a) cursor da linha == cursor lido ("100") → o PATCH do reset casa
//       (`id=eq.<conta>&history_id=eq.100`), a linha termina com
//       `history_id: null` e `sync_status: "pending"` e a resposta é
//       `resync_needed: true`.
//   (b) cursor da linha já foi movido por outro fluxo ("200") → o PATCH CAS
//       devolve `[]`, nenhuma escrita limpa/retrocede o cursor, a linha fica
//       `history_id: "200"` intacta e a resposta traz o ramo explícito de
//       conflito (e continua 200: o Pub/Sub precisa do ack).
//
// O PATCH cai num mini-armazém em memória que aplica de verdade os filtros
// `col=eq.valor` da query sobre a linha semeada — então o CAS é provado pelo
// efeito, não por um array fixo. O roteador grava a URL COMPLETA (com query),
// porque o CAS mora no `history_id=eq.<lido>`.
//
// Sem rede real: JWKS local via Deno.serve + `globalThis.fetch` roteado
// (mesmo arranjo de attachments.test.ts). URL não roteada cai no fetch real,
// para o JWKS local funcionar.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/gmail-webhook/history-404-cas.test.ts

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
// fetch roteado: grava URL COMPLETA (o CAS mora na query) + mini-armazém do
// gmail_accounts que aplica os filtros `eq.` do PATCH sobre a linha semeada
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
const ACCOUNT_ID = "4a000000-0000-4000-8000-000000000001";
const EMAIL = "conta@example.com";
const CURSOR_LIDO = "100"; // history_id devolvido pela leitura da conta

// O que o handler leu da conta (snapshot no instante da leitura).
function contaLida() {
  return {
    id: ACCOUNT_ID,
    email_address: EMAIL,
    is_active: true,
    token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    history_id: CURSOR_LIDO,
    user_id: "4a000000-0000-4000-8000-0000000000ff",
  };
}

function pubSubRequest(jwt: string) {
  return post(GMAIL_URL, JSON.stringify({
    message: { data: btoa(JSON.stringify({ emailAddress: EMAIL, historyId: "2" })) },
  }), { authorization: `Bearer ${jwt}` });
}

function routesBase(store: ReturnType<typeof gmailAccountsStore>): Route[] {
  return [
    { method: "POST", path: "/rest/v1/rpc/get_gmail_tokens", body: [{ access_token: "tok-1", refresh_token: "ref-1" }] },
    { method: "GET", path: "/rest/v1/gmail_accounts", body: contaLida() },
    { method: "PATCH", path: "/rest/v1/gmail_accounts", handler: store.handlePatch },
    // O defeito coberto: o history do Gmail responde 404 (cursor expirado).
    { method: "GET", path: "/gmail/v1/users/me/history", status: 404, body: { error: { code: 404 } } },
  ];
}

const ambiente = (jwksUrl: string) => ({
  GMAIL_OIDC_AUDIENCE: OIDC_AUD,
  GMAIL_OIDC_EMAIL: OIDC_EMAIL,
  GMAIL_OIDC_JWKS_URL: jwksUrl,
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "srk-de-teste",
});

Deno.test("gmail-webhook history 404: cursor igual ao lido aplica o reset (CAS casa)", async () => {
  const jwks = startJwksServer();
  const store = gmailAccountsStore({ ...contaLida(), sync_status: "synced" });
  const router = withFetch(routesBase(store));
  try {
    await withEnv(ambiente(jwks.url), async () => {
      const res = await handleGmailWebhook(pubSubRequest(await mintJwt(validClaims())));
      assertEquals(res.status, 200, "o Pub/Sub precisa do ack");
      const corpo = await res.json();
      assertEquals(corpo.acknowledged, true);
      assertEquals(corpo.resync_needed, true, "cursor lido intacto → reset aplicado");

      const patch = router.calls.find((c) => c.method === "PATCH" && c.path === "/rest/v1/gmail_accounts");
      assert(patch, "o reset deveria ter virado um PATCH em gmail_accounts");
      const params = new URL(patch.url).searchParams;
      assertEquals(params.get("id"), `eq.${ACCOUNT_ID}`);
      assertEquals(params.get("history_id"), `eq.${CURSOR_LIDO}`, "o CAS precisa filtrar pelo cursor LIDO");

      assertEquals(store.row.history_id, null, "linha casada: history_id é zerado");
      assertEquals(store.row.sync_status, "pending", "linha casada: conta marcada para resync");
    });
  } finally {
    router.restore();
    await jwks.shutdown();
  }
});

Deno.test("gmail-webhook history 404 atrasado: cursor já movido não é sobrescrito (CAS não casa)", async () => {
  const jwks = startJwksServer();
  // Entre a leitura (history_id "100") e este 404 atrasado, outro fluxo moveu
  // o cursor para "200" e concluiu a sincronização.
  const store = gmailAccountsStore({ ...contaLida(), history_id: "200", sync_status: "synced" });
  const router = withFetch(routesBase(store));
  try {
    await withEnv(ambiente(jwks.url), async () => {
      const res = await handleGmailWebhook(pubSubRequest(await mintJwt(validClaims())));
      assertEquals(res.status, 200, "mesmo em conflito o Pub/Sub precisa do ack");
      const corpo = await res.json();
      assertEquals(corpo.acknowledged, true);
      assertEquals(corpo.conflict, true, "0 linhas no CAS → ramo explícito de conflito");
      assertEquals(corpo.resync_needed, false, "cursor movido por outro fluxo não pede resync");

      // Toda escrita em gmail_accounts tem de ser o PATCH protegido por CAS —
      // nenhuma pode limpar/retroceder o cursor novo.
      const escritas = router.calls.filter(
        (c) => (c.method === "PATCH" || c.method === "POST") && c.path === "/rest/v1/gmail_accounts",
      );
      assertEquals(escritas.length, 1, "só o PATCH do CAS pode tocar gmail_accounts");
      const params = new URL(escritas[0].url).searchParams;
      assertEquals(params.get("history_id"), `eq.${CURSOR_LIDO}`, "o CAS filtra pelo cursor LIDO, não pelo atual");

      assertEquals(store.row.history_id, "200", "o cursor novo sobrevive ao 404 atrasado");
      assertEquals(store.row.sync_status, "synced", "a conta não volta para pending");
    });
  } finally {
    router.restore();
    await jwks.shutdown();
  }
});
