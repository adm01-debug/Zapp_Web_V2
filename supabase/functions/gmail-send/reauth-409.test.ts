// Prova que o ENVIO devolve HTTP 409 com code 'reauth_required' quando o
// refresh do token é recusado pelo Google (invalid_grant) — em vez de 500
// genérico — e que a conta fica marcada com sync_status='reauth_required' para
// o app abrir a reconexão. Roda a rota real (handleGmailSend) com fetch roteado.
//
// Rodar: deno test --config scripts/ci/deno.json --allow-env \
//   supabase/functions/gmail-send/reauth-409.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleGmailSend } from "./index.ts";

const SUPABASE_URL = "https://projeto-de-teste.invalid";
const SERVICE_KEY = "service-role-key-teste";
const ANON_KEY = "anon-key-teste";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const CONTA_ID = "00000000-0000-4000-8000-0000000000aa";
const TOKEN_VALIDO = "Bearer token-do-usuario-teste";

const PASSADO = new Date(Date.now() - 60 * 60 * 1000).toISOString();

interface Captura { method: string; url: string; body: unknown }

function resposta(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function roteador(capturas: Captura[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input as RequestInfo, init);
    const url = new URL(req.url);
    const metodo = req.method.toUpperCase();
    let corpo: unknown;
    try { corpo = await req.clone().json(); } catch { corpo = undefined; }
    capturas.push({ method: metodo, url: req.url, body: corpo });

    if (url.pathname.endsWith("/auth/v1/user")) return resposta({ id: USER_ID, email: "usuario@teste.invalid" });
    if (url.pathname.endsWith("/rest/v1/gmail_accounts") && metodo === "GET") {
      return resposta({ id: CONTA_ID, email_address: "conta@teste.invalid", is_active: true, token_expires_at: PASSADO, user_id: USER_ID });
    }
    if (url.pathname.endsWith("/rest/v1/gmail_accounts") && metodo === "PATCH") return resposta([{ id: CONTA_ID }]);
    if (url.pathname.endsWith("/rest/v1/rpc/get_gmail_tokens")) {
      return resposta([{ access_token: "access-antigo", refresh_token: "refresh-revogado" }]);
    }
    if (url.hostname === "oauth2.googleapis.com") {
      // Google recusa o refresh: a conta precisa ser reconectada.
      return resposta({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400);
    }
    if (url.hostname === "gmail.googleapis.com") {
      return resposta({ id: "msg-1", threadId: "thread-1" });
    }
    throw new Error(`fetch não roteado no teste: ${metodo} ${req.url}`);
  }) as typeof fetch;
}

Deno.test("envio com token revogado devolve 409 reauth_required e marca a conta", async () => {
  const capturas: Captura[] = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = roteador(capturas);
  Deno.env.set("SUPABASE_URL", SUPABASE_URL);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  Deno.env.set("SUPABASE_ANON_KEY", ANON_KEY);
  Deno.env.set("GOOGLE_CLIENT_ID", "client-id-teste");
  Deno.env.set("GOOGLE_CLIENT_SECRET", "client-secret-teste");

  try {
    const res = await handleGmailSend(new Request(`${SUPABASE_URL}/functions/v1/gmail-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: TOKEN_VALIDO },
      body: JSON.stringify({ action: "send", account_id: CONTA_ID, to: "destino@teste.invalid", subject: "Oi" }),
    }));

    const body = await res.json();
    assertEquals(res.status, 409);
    assertEquals(body.code, "reauth_required");

    // A conta é marcada para o app abrir a reconexão.
    const patch = capturas.find((c) => c.method === "PATCH" && new URL(c.url).pathname.endsWith("/rest/v1/gmail_accounts"));
    assertEquals((patch?.body as Record<string, unknown>)?.sync_status, "reauth_required");

    // E, crucially, o envio NÃO é tentado com o token velho.
    assertEquals(capturas.filter((c) => c.url.includes("/messages/send")).length, 0);
  } finally {
    globalThis.fetch = fetchOriginal;
    for (const chave of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) {
      Deno.env.delete(chave);
    }
  }
});
