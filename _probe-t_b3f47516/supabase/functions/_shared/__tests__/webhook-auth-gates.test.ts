// R2-API-021 — gates BLOQUEANTES de autenticidade dos webhooks públicos.
//
// Contraponto de `webhook-auth-shadow.test.ts`: aquele arquivo prova que o modo
// sombra nunca bloqueava — era exatamente o defeito reportado. Este prova o
// contrato novo: ausência de credencial, assinatura inválida e replay são
// REJEITADOS com 401 ANTES de qualquer efeito (o handler nem chega a criar o
// client Supabase — por isso os testes negativos rodam sem SUPABASE_URL).
//
// Sem rede real: o JWKS do Google é servido por um Deno.serve em 127.0.0.1 com
// uma chave RSA gerada no teste; o HMAC da Meta usa Web Crypto; o RPC
// get_instance_token do Supabase é simulado por outro servidor local.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1

import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  verifyMetaWebhookSignature,
  verifyGoogleOidcToken,
  type WebhookAuthFailureReason,
} from "../hmac-validation.ts";
import { handleWhatsappWebhook } from "../../whatsapp-webhook/index.ts";
import { handleGmailWebhook } from "../../gmail-webhook/index.ts";
import { handleEvolutionWebhook } from "../../evolution-webhook/index.ts";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const anteriores = new Map<string, string | undefined>();
  for (const [chave, valor] of Object.entries(vars)) {
    anteriores.set(chave, Deno.env.get(chave));
    if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
  }
  const restaurar = () => {
    for (const [chave, valor] of anteriores) {
      if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
    }
  };
  const resultado = fn();
  if (resultado instanceof Promise) return resultado.finally(restaurar);
  restaurar();
}

const encode = (s: string) => new TextEncoder().encode(s);

function b64url(data: Uint8Array): string {
  let binary = "";
  data.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const b64urlJson = (v: unknown) => b64url(encode(JSON.stringify(v)));

async function hmacSha256Hex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, encode(payload));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const metaSign = async (payload: string, secret: string) => `sha256=${await hmacSha256Hex(payload, secret)}`;

const post = (url: string, body: string, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

// ---------------------------------------------------------------------------
// whatsapp-webhook — x-hub-signature-256 (HMAC-SHA256 do corpo, WHATSAPP_APP_SECRET)
// ---------------------------------------------------------------------------

const WA_BODY = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
const WA_URL = "http://localhost/functions/v1/whatsapp-webhook";

Deno.test("whatsapp-webhook: POST sem assinatura -> 401 antes de qualquer efeito (sem SUPABASE_URL configurada)", async () => {
  await withEnv(
    { WHATSAPP_APP_SECRET: "app-secret", SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
    async () => {
      const res = await handleWhatsappWebhook(post(WA_URL, WA_BODY));
      assertEquals(res.status, 401);
    },
  );
});

Deno.test("whatsapp-webhook: assinatura HMAC inválida -> 401", async () => {
  await withEnv(
    { WHATSAPP_APP_SECRET: "app-secret", SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
    async () => {
      const assinaturaErrada = await metaSign(WA_BODY, "outro-secret");
      const res = await handleWhatsappWebhook(post(WA_URL, WA_BODY, { "x-hub-signature-256": assinaturaErrada }));
      assertEquals(res.status, 401);
    },
  );
});

Deno.test("whatsapp-webhook: replay — assinatura válida de OUTRO corpo -> 401", async () => {
  await withEnv(
    { WHATSAPP_APP_SECRET: "app-secret", SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
    async () => {
      // Atacante reenvia uma assinatura capturada de outro payload (replay/adulteração).
      const assinaturaDeOutroCorpo = await metaSign('{"object":"whatsapp_business_account","entry":[{"id":"x"}]}', "app-secret");
      const res = await handleWhatsappWebhook(post(WA_URL, WA_BODY, { "x-hub-signature-256": assinaturaDeOutroCorpo }));
      assertEquals(res.status, 401);
    },
  );
});

Deno.test("whatsapp-webhook: sem WHATSAPP_APP_SECRET configurado -> 401 (falha fechada, mesmo com header bem formado)", async () => {
  await withEnv(
    { WHATSAPP_APP_SECRET: undefined, SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
    async () => {
      const res = await handleWhatsappWebhook(post(WA_URL, WA_BODY, { "x-hub-signature-256": `sha256=${"a".repeat(64)}` }));
      assertEquals(res.status, 401);
    },
  );
});

Deno.test("whatsapp-webhook: assinatura válida -> processa (200, sem 401)", async () => {
  await withEnv(
    {
      WHATSAPP_APP_SECRET: "app-secret",
      SUPABASE_URL: "http://127.0.0.1:9", // inalcançável de propósito — entry:[] não consulta o banco
      SUPABASE_SERVICE_ROLE_KEY: "fake-service-role",
    },
    async () => {
      const assinatura = await metaSign(WA_BODY, "app-secret");
      const res = await handleWhatsappWebhook(post(WA_URL, WA_BODY, { "x-hub-signature-256": assinatura }));
      assertEquals(res.status, 200);
    },
  );
});

Deno.test("whatsapp-webhook: handshake GET (hub.mode=subscribe) NÃO usa HMAC e continua funcionando", async () => {
  await withEnv({ WHATSAPP_VERIFY_TOKEN: "verify-tok" }, async () => {
    const okRes = await handleWhatsappWebhook(new Request(`${WA_URL}?hub.mode=subscribe&hub.verify_token=verify-tok&hub.challenge=ch-123`, { method: "GET" }));
    assertEquals(okRes.status, 200);
    assertEquals(await okRes.text(), "ch-123");

    const badRes = await handleWhatsappWebhook(new Request(`${WA_URL}?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=ch-123`, { method: "GET" }));
    assertEquals(badRes.status, 403);
  });
});

Deno.test("verifyMetaWebhookSignature: vereditos do verificador bloqueante", async () => {
  assertEquals(await verifyMetaWebhookSignature(new Headers(), WA_BODY, "s"), { ok: false, reason: "missing_signature" });
  assertEquals(await verifyMetaWebhookSignature(new Headers(), WA_BODY, undefined), { ok: false, reason: "missing_secret" });
  assertEquals(await verifyMetaWebhookSignature(new Headers({ "x-hub-signature-256": "garbage" }), WA_BODY, "s"), { ok: false, reason: "malformed_signature" });
  const valida = await metaSign(WA_BODY, "s");
  assertEquals(await verifyMetaWebhookSignature(new Headers({ "x-hub-signature-256": valida }), WA_BODY, "s"), { ok: true, reason: "valid" });
});

// ---------------------------------------------------------------------------
// gmail-webhook — OIDC do Google Pub/Sub (JWT RS256 verificado contra JWKS)
// ---------------------------------------------------------------------------

const rsaKeyPair = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);
const rsaPublicJwk = await crypto.subtle.exportKey("jwk", rsaKeyPair.publicKey);

const otherKeyPair = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);

const OIDC_AUD = "https://zapp.example.com/functions/v1/gmail-webhook";
const OIDC_EMAIL = "service-123@gcp-sa-pubsub.iam.gserviceaccount.com";

function startJwksServer(keys: Array<Record<string, unknown>>) {
  const server = Deno.serve(
    { port: 0, hostname: "127.0.0.1" },
    () => new Response(JSON.stringify({ keys }), { headers: { "content-type": "application/json" } }),
  );
  const port = (server.addr as Deno.NetAddr).port;
  return { url: `http://127.0.0.1:${port}/jwks`, shutdown: () => server.shutdown() };
}

async function mintJwt(
  claims: Record<string, unknown>,
  key: CryptoKey = rsaKeyPair.privateKey,
  kid = "kid-google-1",
): Promise<string> {
  const header = b64urlJson({ alg: "RS256", typ: "JWT", kid });
  const payload = b64urlJson(claims);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

const validClaims = (over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: OIDC_AUD,
  sub: "1234567890",
  email: OIDC_EMAIL,
  email_verified: true,
  iat: Math.floor(Date.now() / 1000) - 60,
  exp: Math.floor(Date.now() / 1000) + 3600,
  ...over,
});

Deno.test("verifyGoogleOidcToken: JWT RS256 válido (assinatura + iss + aud + exp + email) -> ok", async () => {
  const jwks = startJwksServer([{ ...rsaPublicJwk, kid: "kid-google-1", alg: "RS256", use: "sig" }]);
  try {
    const token = await mintJwt(validClaims());
    const verdict = await verifyGoogleOidcToken(token, { audience: OIDC_AUD, expectedEmail: OIDC_EMAIL, jwksUrl: jwks.url });
    assertEquals(verdict.ok, true);
  } finally {
    await jwks.shutdown();
  }
});

Deno.test("verifyGoogleOidcToken: nenhuma entrada adversária produz ok=true", async () => {
  const jwks = startJwksServer([{ ...rsaPublicJwk, kid: "kid-google-1", alg: "RS256", use: "sig" }]);
  try {
    const casos: Array<[WebhookAuthFailureReason, string]> = [
      // [reason esperada, token]
      ["malformed_token", "isso-nao-e-jwt"],
      ["unknown_kid", await mintJwt(validClaims(), rsaKeyPair.privateKey, "kid-inexistente")],
      ["invalid_signature", await mintJwt(validClaims(), otherKeyPair.privateKey)],
      ["bad_issuer", await mintJwt(validClaims({ iss: "https://evil.example.com" }))],
      ["bad_audience", await mintJwt(validClaims({ aud: "https://outro-endpoint.example.com" }))],
      ["token_expired", await mintJwt(validClaims({ iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600 }))],
      ["bad_email", await mintJwt(validClaims({ email: "atacante@gmail.com" }))],
      ["bad_email", await mintJwt(validClaims({ email_verified: false }))],
    ];
    for (const [reason, token] of casos) {
      const verdict = await verifyGoogleOidcToken(token, { audience: OIDC_AUD, expectedEmail: OIDC_EMAIL, jwksUrl: jwks.url });
      assertEquals(verdict, { ok: false, reason }, `deveria recusar com ${reason}`);
    }
    // audience não configurada -> falha fechada mesmo com token perfeito
    const bom = await mintJwt(validClaims());
    assertEquals(await verifyGoogleOidcToken(bom, { audience: undefined, expectedEmail: OIDC_EMAIL, jwksUrl: jwks.url }), { ok: false, reason: "missing_audience" });
    // expectedEmail não configurado -> falha fechada: JWT válido sozinho não
    // prova a origem (qualquer service account emite token com aud arbitrária)
    assertEquals(await verifyGoogleOidcToken(bom, { audience: OIDC_AUD, jwksUrl: jwks.url }), { ok: false, reason: "missing_secret" });
  } finally {
    await jwks.shutdown();
  }
});

Deno.test("verifyGoogleOidcToken: expectedEmail configurado exige match exato", async () => {
  const jwks = startJwksServer([{ ...rsaPublicJwk, kid: "kid-google-1", alg: "RS256", use: "sig" }]);
  try {
    const outroSa = await mintJwt(validClaims({ email: "outro@projeto.iam.gserviceaccount.com" }));
    assertEquals(
      await verifyGoogleOidcToken(outroSa, { audience: OIDC_AUD, expectedEmail: OIDC_EMAIL, jwksUrl: jwks.url }),
      { ok: false, reason: "bad_email" },
    );
    const bom = await mintJwt(validClaims());
    assertEquals(
      (await verifyGoogleOidcToken(bom, { audience: OIDC_AUD, expectedEmail: OIDC_EMAIL, jwksUrl: jwks.url })).ok,
      true,
    );
  } finally {
    await jwks.shutdown();
  }
});

const GMAIL_URL = "http://localhost/functions/v1/gmail-webhook";
const GMAIL_BODY = JSON.stringify({
  message: { data: btoa(JSON.stringify({ emailAddress: "conta@example.com", historyId: "1" })) },
});

Deno.test("gmail-webhook: POST sem Authorization Bearer -> 401 antes de qualquer efeito (sem SUPABASE_URL)", async () => {
  await withEnv(
    { GMAIL_OIDC_AUDIENCE: OIDC_AUD, GMAIL_OIDC_EMAIL: OIDC_EMAIL, SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
    async () => {
      const res = await handleGmailWebhook(post(GMAIL_URL, GMAIL_BODY));
      assertEquals(res.status, 401);
    },
  );
});

Deno.test("gmail-webhook: Bearer malformado (não-JWT) -> 401", async () => {
  await withEnv(
    { GMAIL_OIDC_AUDIENCE: OIDC_AUD, GMAIL_OIDC_EMAIL: OIDC_EMAIL, SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
    async () => {
      const res = await handleGmailWebhook(post(GMAIL_URL, GMAIL_BODY, { authorization: "Bearer nao-e-jwt" }));
      assertEquals(res.status, 401);
    },
  );
});

Deno.test("gmail-webhook: JWT expirado (replay de token antigo) -> 401; JWT válido -> passa do gate", async () => {
  const jwks = startJwksServer([{ ...rsaPublicJwk, kid: "kid-google-1", alg: "RS256", use: "sig" }]);
  try {
    await withEnv(
      {
        GMAIL_OIDC_AUDIENCE: OIDC_AUD,
        GMAIL_OIDC_EMAIL: OIDC_EMAIL,
        GMAIL_OIDC_JWKS_URL: jwks.url,
        SUPABASE_URL: "http://127.0.0.1:9", // inalcançável — a conta não existe, o handler responde 200 acknowledged
        SUPABASE_SERVICE_ROLE_KEY: "fake-service-role",
      },
      async () => {
        const expirado = await mintJwt(validClaims({
          iat: Math.floor(Date.now() / 1000) - 7200,
          exp: Math.floor(Date.now() / 1000) - 3600,
        }));
        const resExp = await handleGmailWebhook(post(GMAIL_URL, GMAIL_BODY, { authorization: `Bearer ${expirado}` }));
        assertEquals(resExp.status, 401);

        const valido = await mintJwt(validClaims());
        const resOk = await handleGmailWebhook(post(GMAIL_URL, GMAIL_BODY, { authorization: `Bearer ${valido}` }));
        assertNotEquals(resOk.status, 401);
      },
    );
  } finally {
    await jwks.shutdown();
  }
});

Deno.test("gmail-webhook: sem GMAIL_OIDC_EMAIL configurado -> 401 mesmo com JWT perfeito (falha fechada)", async () => {
  // O gate falha fechado antes de consultar o JWKS: sem o e-mail exato do
  // service account esperado, um JWT Google válido não prova a origem.
  await withEnv(
    {
      GMAIL_OIDC_AUDIENCE: OIDC_AUD,
      GMAIL_OIDC_EMAIL: undefined,
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    },
    async () => {
      const valido = await mintJwt(validClaims());
      const res = await handleGmailWebhook(post(GMAIL_URL, GMAIL_BODY, { authorization: `Bearer ${valido}` }));
      assertEquals(res.status, 401);
    },
  );
});

Deno.test("gmail-webhook: JWT válido de OUTRA service account (outro projeto GCP) -> 401", async () => {
  const jwks = startJwksServer([{ ...rsaPublicJwk, kid: "kid-google-1", alg: "RS256", use: "sig" }]);
  try {
    await withEnv(
      {
        GMAIL_OIDC_AUDIENCE: OIDC_AUD,
        GMAIL_OIDC_EMAIL: OIDC_EMAIL,
        GMAIL_OIDC_JWKS_URL: jwks.url,
        SUPABASE_URL: "http://127.0.0.1:9",
        SUPABASE_SERVICE_ROLE_KEY: "fake-service-role",
      },
      async () => {
        // Assinatura, iss, aud e exp válidos — só o e-mail é de outra SA.
        const outraSa = await mintJwt(validClaims({ email: "outro@projeto.iam.gserviceaccount.com" }));
        const res = await handleGmailWebhook(post(GMAIL_URL, GMAIL_BODY, { authorization: `Bearer ${outraSa}` }));
        assertEquals(res.status, 401);
      },
    );
  } finally {
    await jwks.shutdown();
  }
});

// ---------------------------------------------------------------------------
// evolution-webhook — gate por instanceToken resolvido POR INSTÂNCIA
// (compatibilidade GO: a GO não assina HMAC; a credencial vai no corpo)
// ---------------------------------------------------------------------------

const EVO_URL = "http://localhost/functions/v1/evolution-webhook";
// evento que não toca o banco depois do gate (groups.upsert sem id/subject)
const evoBody = (extra: Record<string, unknown>) =>
  JSON.stringify({ event: "groups.upsert", instance: "INST-A", data: {}, ...extra });

Deno.test("evolution-webhook: POST sem instanceToken -> 401 por padrão (fail-closed) e sem tocar o banco", async () => {
  await withEnv(
    {
      EVOLUTION_WEBHOOK_ENFORCE: undefined, // padrão agora é enforcement
      EVOLUTION_INSTANCE_TOKEN: "tok-global",
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    },
    async () => {
      const res = await handleEvolutionWebhook(post(EVO_URL, evoBody({})));
      assertEquals(res.status, 401);
    },
  );
});

Deno.test("evolution-webhook: instanceToken divergente -> 401 (inclusive quando a resolução por instância falha fechado)", async () => {
  await withEnv(
    {
      EVOLUTION_INSTANCE_TOKEN: "tok-global",
      SUPABASE_URL: "http://127.0.0.1:9", // RPC get_instance_token recusada -> null -> 401
      SUPABASE_SERVICE_ROLE_KEY: "fake-service-role",
    },
    async () => {
      const res = await handleEvolutionWebhook(post(EVO_URL, evoBody({ instanceToken: "token-errado" })));
      assertEquals(res.status, 401);
    },
  );
});

Deno.test("evolution-webhook: instanceToken global correto -> processa (200, sem 401)", async () => {
  await withEnv(
    {
      EVOLUTION_INSTANCE_TOKEN: "tok-global",
      SUPABASE_URL: "http://127.0.0.1:9",
      SUPABASE_SERVICE_ROLE_KEY: "fake-service-role",
    },
    async () => {
      const res = await handleEvolutionWebhook(post(EVO_URL, evoBody({ instanceToken: "tok-global" })));
      assertEquals(res.status, 200);
    },
  );
});

Deno.test("evolution-webhook: credencial resolvida POR INSTÂNCIA via get_instance_token; token de outra instância (replay) -> 401", async () => {
  // Fake Supabase: responde o RPC get_instance_token com o token da instância B.
  const chamadas: string[] = [];
  const fakeDb = Deno.serve({ port: 0, hostname: "127.0.0.1" }, async (req) => {
    if (req.url.endsWith("/rpc/get_instance_token")) {
      const body = await req.json().catch(() => ({}));
      chamadas.push(String(body?.p_instance_id));
      const tokens: Record<string, string> = { "INST-B": "tok-da-instancia-b" };
      return new Response(JSON.stringify(tokens[String(body?.p_instance_id)] ?? null), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  });
  const port = (fakeDb.addr as Deno.NetAddr).port;

  try {
    await withEnv(
      {
        EVOLUTION_INSTANCE_TOKEN: "tok-global-que-nao-e-o-da-b",
        SUPABASE_URL: `http://127.0.0.1:${port}`,
        SUPABASE_SERVICE_ROLE_KEY: "fake-service-role",
      },
      async () => {
        // Token legítimo da INST-B, resolvido por instância -> passa.
        const ok = await handleEvolutionWebhook(post(EVO_URL, evoBody({ instance: "INST-B", instanceToken: "tok-da-instancia-b" })));
        assertEquals(ok.status, 200);
        assert(chamadas.includes("INST-B"));

        // Replay/cross-instance: o token de A apresentado para a instância B -> 401.
        const replay = await handleEvolutionWebhook(post(EVO_URL, evoBody({ instance: "INST-B", instanceToken: "tok-da-instancia-A" })));
        assertEquals(replay.status, 401);
      },
    );
  } finally {
    await fakeDb.shutdown();
  }
});

Deno.test("evolution-webhook: EVOLUTION_WEBHOOK_ENFORCE=shadow explícito continua disponível como rollback de operação", async () => {
  await withEnv(
    {
      EVOLUTION_WEBHOOK_ENFORCE: "shadow",
      EVOLUTION_INSTANCE_TOKEN: "tok-global",
      SUPABASE_URL: "http://127.0.0.1:9",
      SUPABASE_SERVICE_ROLE_KEY: "fake-service-role",
    },
    async () => {
      const res = await handleEvolutionWebhook(post(EVO_URL, evoBody({ instanceToken: "qualquer" })));
      assertNotEquals(res.status, 401);
    },
  );
});

// ---------------------------------------------------------------------------
// SL-061 / IA-004 L6 — regressão do DEFAULT: corpo SEM assinatura HMAC não é
// aceito. O caminho padrão nega (401); o único jeito de um corpo sem assinatura
// passar é `EVOLUTION_WEBHOOK_ENFORCE=shadow`, explícito (teste acima). Se
// alguém devolver o default para `shadow`, este teste fica vermelho.
// A Evolution GO não assina webhooks (só envia Content-Type), então a credencial
// dela é o `instanceToken` do corpo — e ele também é exigido no default.
// ---------------------------------------------------------------------------

Deno.test("evolution-webhook: corpo SEM assinatura HMAC não é aceito por padrão (IA-004 L6 / SL-061)", async () => {
  await withEnv(
    {
      EVOLUTION_WEBHOOK_ENFORCE: undefined, // default = enforcement
      EVOLUTION_WEBHOOK_SECRET: "secret-configurado-no-emissor", // mesmo COM secret, o default nega
      EVOLUTION_INSTANCE_TOKEN: "tok-global",
      SUPABASE_URL: undefined, // se o gate abrisse, getDb() estouraria -> 500, e o 401 abaixo não passaria
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    },
    async () => {
      // (1) sem header de assinatura (post() manda só content-type) e sem instanceToken -> 401.
      const semAssinatura = await handleEvolutionWebhook(post(EVO_URL, evoBody({})));
      assertEquals(semAssinatura.status, 401);
      assertEquals(await semAssinatura.text(), JSON.stringify({ error: "Unauthorized" }));

      // (2) assinatura presente porém inválida com instanceToken VÁLIDO -> 401 na assinatura
      //     (fail-closed: o token do corpo não substitui uma assinatura apresentada e inválida).
      const assinaturaInvalida = await handleEvolutionWebhook(
        post(EVO_URL, evoBody({ instanceToken: "tok-global" }), { "x-evolution-signature": "sha256=deadbeef" }),
      );
      assertEquals(assinaturaInvalida.status, 401);
      assertEquals(await assinaturaInvalida.text(), JSON.stringify({ error: "Invalid webhook signature" }));
    },
  );
});
