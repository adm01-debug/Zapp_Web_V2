// Teste de contrato — gmail-sync: falha transitória no sync-inbox soma a
// contagem REAL da conta (error_count + 1), sem zerar a espera crescente
// acumulada pelo cron.
//
// Cenário: conta com error_count = 4; o Gmail devolve JSON inválido na lista
// de labels (falha transitória de upstream). O registro da falha precisa
// gravar error_count = 5 — nunca 1.
//
// Como rodar:
//   deno test --config scripts/ci/deno.json --allow-env \
//     supabase/functions/gmail-sync/error-count.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleGmailSync } from "./index.ts";

const SUPABASE_URL = "https://supabase-teste.invalid";
const USUARIO_ID = "usuario-sync-error-count";
const CONTA_ID = "11111111-2222-4333-8444-555555555555";
const TOKEN_VALIDO = "Bearer token-do-usuario-teste";
const ERRO_ATUAL = 4;

function resposta(codigo: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status: codigo,
    headers: { "Content-Type": "application/json" },
  });
}

function contaLida() {
  return {
    id: CONTA_ID,
    email_address: "caixa.sync@empresa.com",
    is_active: true,
    sync_status: "ok",
    token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    error_count: ERRO_ATUAL,
    history_id: null,
    user_id: USUARIO_ID,
  };
}

Deno.test("sync-inbox registra a falha com error_count + 1 e sem corpo cru", async () => {
  const fetchOriginal = globalThis.fetch;
  const patches: Array<{ url: string; corpo: Record<string, unknown> }> = [];
  const ambiente = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: "service-role-teste",
    SUPABASE_ANON_KEY: "anon-teste",
    GOOGLE_CLIENT_ID: "id-teste",
    GOOGLE_CLIENT_SECRET: "segredo-teste",
  } as const;

  try {
    for (const [chave, valor] of Object.entries(ambiente)) Deno.env.set(chave, valor);

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      const metodo = (init?.method ?? "GET").toUpperCase();

      if (url.hostname === "supabase-teste.invalid") {
        if (url.pathname === "/auth/v1/user") return resposta(200, { user: { id: USUARIO_ID } });
        if (url.pathname === "/rest/v1/gmail_accounts" && metodo === "GET") return resposta(200, contaLida());
        if (url.pathname === "/rest/v1/gmail_accounts" && metodo === "PATCH") {
          patches.push({ url: url.toString(), corpo: JSON.parse(String(init?.body ?? "{}")) });
          return resposta(200, [{}]);
        }
        if (url.pathname === "/rest/v1/rpc/get_gmail_tokens") {
          return resposta(200, [{
            access_token: "ya29.teste-sync",
            refresh_token: "1//refresh-sync",
            expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          }]);
        }
        if (url.pathname.startsWith("/rest/v1/email_labels")) return resposta(200, []);
        throw new Error(`chamada fora do contrato: ${metodo} ${url.pathname}`);
      }

      if (url.hostname === "gmail.googleapis.com" && url.pathname === "/gmail/v1/users/me/labels") {
        return new Response("nao-json{{quebrado", { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`chamada fora do contrato: ${metodo} ${url.host}${url.pathname}`);
    }) as typeof fetch;

    const req = new Request(`${SUPABASE_URL}/functions/v1/gmail-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: TOKEN_VALIDO },
      body: JSON.stringify({ action: "sync-inbox", account_id: CONTA_ID }),
    });

    const res = await handleGmailSync(req);
    assertEquals(res.status, 500);

    const registro = patches.find((p) => "error_count" in p.corpo);
    assertEquals(Boolean(registro), true);
    assertEquals(registro?.corpo.error_count, ERRO_ATUAL + 1);
    const lastError = String(registro?.corpo.last_error ?? "");
    assertEquals(lastError, `${ERRO_ATUAL + 1} tentativa(s) de sincronização falharam`);
    assertEquals(lastError.includes("nao-json"), false);
  } finally {
    globalThis.fetch = fetchOriginal;
    for (const chave of Object.keys(ambiente)) Deno.env.delete(chave);
  }
});
