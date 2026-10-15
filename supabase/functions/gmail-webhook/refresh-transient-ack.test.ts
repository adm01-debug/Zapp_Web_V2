// Teste de contrato — gmail-webhook: falha TRANSITÓRIA no refresh do token.
//
// O refresh devolve 503 com corpo JSON do Google. O webhook precisa confirmar
// o recebimento (acknowledged:true, HTTP 200 — o Pub/Sub não pode reentregar),
// mas o campo `error` do ACK NÃO pode carregar o corpo cru do Google.
//
// Como rodar:
//   deno test --config scripts/ci/deno.json \
//     --allow-env --allow-read --allow-net=127.0.0.1 \
//     supabase/functions/gmail-webhook/refresh-transient-ack.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleGmailWebhook } from "./index.ts";
import { GMAIL_REFRESH_TRANSIENT_MESSAGE } from "../_shared/gmail-helpers.ts";

const SUPABASE_URL = "https://supabase-teste.invalid";
const CONTA_ID = "conta-webhook-transient-1";
const EMAIL_CONTA = "caixa.webhook@empresa.com";
const AUDIENCE = "gmail-push-audience-teste";
const SERVICE_EMAIL = "gmail-push@projeto-teste.iam.gserviceaccount.com";
const KID = "chave-teste-webhook-transient";
const JWKS_PORTA = 18799;
const JWKS_URL = `http://127.0.0.1:${JWKS_PORTA}/jwks`;

function b64urlEntrada(dados: string): string {
  return btoa(dados).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function b64urlSaida(segmento: string): string {
  const base = segmento.replaceAll("-", "+").replaceAll("_", "/");
  return atob(base + "=".repeat((4 - (base.length % 4)) % 4));
}

async function emitirJwtTeste(chavePrivada: CryptoKey): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = b64urlEntrada(JSON.stringify({ alg: "RS256", kid: KID, typ: "JWT" }));
  const corpo = b64urlEntrada(JSON.stringify({
    iss: "https://accounts.google.com",
    aud: AUDIENCE,
    email: SERVICE_EMAIL,
    email_verified: true,
    exp: agora + 300,
    iat: agora,
  }));
  const assinatura = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    chavePrivada,
    new TextEncoder().encode(`${cabecalho}.${corpo}`),
  );
  const bytes = new Uint8Array(assinatura);
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return `${cabecalho}.${corpo}.${b64urlEntrada(binario)}`;
}

const CORPO_GOOGLE_503 = { error: "temporarily_unavailable", error_description: "backend GCP instavel" };

function contaLida() {
  return {
    id: CONTA_ID,
    email_address: EMAIL_CONTA,
    is_active: true,
    sync_status: "ok",
    token_expires_at: new Date(Date.now() - 60_000).toISOString(),
    error_count: 0,
    history_id: "9001",
    user_id: "usuario-webhook-transient",
  };
}

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

async function lerJsonOuTexto(res: Response): Promise<unknown> {
  const texto = await res.text();
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

Deno.test("webhook confirma o push mas troca o corpo cru do refresh 503 por texto generico", async () => {
  const par = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwkPublica = await crypto.subtle.exportKey("jwk", par.publicKey);
  const servidor = Deno.serve({ port: JWKS_PORTA, hostname: "127.0.0.1", onListen: () => {} }, () =>
    respostaJson(200, { keys: [{ ...jwkPublica, kid: KID, alg: "RS256", use: "sig" }] }),
  );

  const fetchOriginal = globalThis.fetch;
  const ambiente = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: "service-role-teste",
    SUPABASE_ANON_KEY: "anon-teste",
    GOOGLE_CLIENT_ID: "id-teste",
    GOOGLE_CLIENT_SECRET: "segredo-teste",
    GMAIL_OIDC_AUDIENCE: AUDIENCE,
    GMAIL_OIDC_EMAIL: SERVICE_EMAIL,
    GMAIL_OIDC_JWKS_URL: JWKS_URL,
  } as const;

  try {
    for (const [chave, valor] of Object.entries(ambiente)) Deno.env.set(chave, valor);

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      const metodo = (init?.method ?? "GET").toUpperCase();

      if (url.hostname === "127.0.0.1") return fetchOriginal(input, init);
      if (url.hostname === "oauth2.googleapis.com" && url.pathname === "/token") {
        return respostaJson(503, CORPO_GOOGLE_503);
      }
      if (url.hostname === "supabase-teste.invalid") {
        if (url.pathname === "/rest/v1/gmail_accounts" && metodo === "GET") return respostaJson(200, contaLida());
        if (url.pathname === "/rest/v1/rpc/get_gmail_tokens") {
          return respostaJson(200, [{
            access_token: "ya29.velho",
            refresh_token: "1//refresh-velho",
            expires_at: new Date(Date.now() - 120_000).toISOString(),
          }]);
        }
        return respostaJson(200, []);
      }
      throw new Error(`chamada fora do contrato: ${metodo} ${url.pathname}`);
    }) as typeof fetch;

    const push = { emailAddress: EMAIL_CONTA, historyId: 9002 };
    const jwt = await emitirJwtTeste(par.privateKey);
    const req = new Request(`${SUPABASE_URL}/functions/v1/gmail-webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ message: { data: b64urlEntrada(JSON.stringify(push)) } }),
    });

    const res = await handleGmailWebhook(req);
    const corpo = await lerJsonOuTexto(res) as { acknowledged?: boolean; error?: string };

    assertEquals(res.status, 200);
    assertEquals(corpo.acknowledged, true);
    assertEquals(corpo.error, GMAIL_REFRESH_TRANSIENT_MESSAGE);
    assertEquals(corpo.error?.includes("temporarily_unavailable"), false);
    assertEquals(corpo.error?.includes("backend GCP"), false);
  } finally {
    globalThis.fetch = fetchOriginal;
    servidor.shutdown();
    for (const chave of Object.keys(ambiente)) Deno.env.delete(chave);
  }
});
