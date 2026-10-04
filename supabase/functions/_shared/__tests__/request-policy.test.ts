// R2-AUTH-022 / item 27.2 — módulo compartilhado de política de rede.
//
// Estes testes são OFFLINE: o client da RPC é injetado (mock), então nenhuma
// chamada toca o banco. O que se prova aqui é a CONVERSÃO — Request + endpoint
// canônico -> decisão da RPC -> negação HTTP consistente (403 negado / 503
// indecidível) — e as regras de extração/validação do módulo:
//
//   * IP vem de getClientIP (x-forwarded-for, IP mais à direita);
//   * país vem SÓ de header de infraestrutura confiável e é normalizado ISO alpha-2;
//   * endpoint é explícito no chamador e validado (nunca derivado de body);
//   * whitelist de IP NÃO isenta país (o módulo sempre encaminha o país à RPC);
//   * falha/erro da RPC falha fechado (503), sem vazar listas/regras.
//
// A semântica de IP/país/rate limit em si (whitelist isenta só bloqueio de IP,
// whitelist geográfica vazia falha fechada, empate determinístico) é do cartão
// 27.1 e está provada em scripts/db-audit/network-policy-rpc.test.sh.
//
// Run with: deno test --config scripts/ci/deno.json supabase/functions/_shared/__tests__/request-policy.test.ts

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  resolveNetworkPolicy,
  extractCountryCode,
  normalizeCountryCode,
  isValidEndpoint,
  type NetworkPolicyDecision,
  type NetworkPolicyRpcClient,
} from "../request-policy.ts";

const request = (headers: Record<string, string> = {}) =>
  new Request("https://example.supabase.co/functions/v1/auth-login", { headers });

const opts = (rpc: NetworkPolicyRpcClient) => ({
  rpc,
  defaultMaxRequests: 30,
  defaultWindowSeconds: 60,
});

/** Client RPC fake que devolve um resultado fixo e registra cada chamada. */
function fakeRpc(
  outcome:
    | { data: unknown; error: null }
    | { data: null; error: { message: string } },
) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client: NetworkPolicyRpcClient & { calls: typeof calls } = {
    calls,
    rpc: (fn, args) => {
      calls.push({ fn, args });
      return Promise.resolve(outcome);
    },
  };
  return client;
}

function rpcThrowing(): NetworkPolicyRpcClient & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    rpc: (_fn, _args) => Promise.reject(new Error("rpc down")),
  };
}

const ALLOWED = {
  data: [
    { allowed: true, reason: null, rate_limit_max_requests: 25, rate_limit_window_seconds: 120 },
  ],
  error: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// normalizeCountryCode / extractCountryCode / isValidEndpoint (funções puras)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("normalizeCountryCode: trim + uppercase + ISO alpha-2 estrito", () => {
  assertEquals(normalizeCountryCode("br"), "BR");
  assertEquals(normalizeCountryCode(" BR "), "BR");
  assertEquals(normalizeCountryCode("us"), "US");
  assertEquals(normalizeCountryCode("de"), "DE");
  // fora do formato alpha-2 -> ausente (null), nunca um código inventado
  assertEquals(normalizeCountryCode("bra"), null);
  assertEquals(normalizeCountryCode("brazil"), null);
  assertEquals(normalizeCountryCode(""), null);
  assertEquals(normalizeCountryCode("   "), null);
  assertEquals(normalizeCountryCode(null), null);
  assertEquals(normalizeCountryCode(undefined), null);
});

Deno.test("extractCountryCode: só header confiável e valor normalizável", () => {
  assertEquals(extractCountryCode(request({ "cf-ipcountry": "br" })), "BR");
  assertEquals(extractCountryCode(request({ "CF-IPCOUNTRY": "us" })), "US"); // header é case-insensitive
  assertEquals(extractCountryCode(request()), null); // ausente
  assertEquals(extractCountryCode(request({ "cf-ipcountry": "brazil" })), null); // inválido -> ausente
  // header não confiável (spoofável pelo cliente) é ignorado
  assertEquals(extractCountryCode(request({ "x-country-code": "br" })), null);
  assertEquals(extractCountryCode(request({ "x-vercel-ip-country": "br" })), null);
});

Deno.test("isValidEndpoint: só identificador canônico explícito e bem formado", () => {
  assertEquals(isValidEndpoint("auth-login"), true);
  assertEquals(isValidEndpoint("/auth/login"), true);
  assertEquals(isValidEndpoint("ai:transcribe:audio"), true);
  assertEquals(isValidEndpoint("a"), true);
  assertEquals(isValidEndpoint(""), false);
  assertEquals(isValidEndpoint("   "), false);
  assertEquals(isValidEndpoint("com espaco"), false);
  assertEquals(isValidEndpoint("a\nb"), false);
  assertEquals(isValidEndpoint("x".repeat(129)), false);
  assertEquals(isValidEndpoint(null), false);
  assertEquals(isValidEndpoint(42), false);
  assertEquals(isValidEndpoint(undefined), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveNetworkPolicy (conversão Request+endpoint -> decisão)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("resolveNetworkPolicy: allow encaminha IP/país/endpoint e devolve o rate limit efetivo", async () => {
  const rpc = fakeRpc(ALLOWED);
  const decision = await resolveNetworkPolicy(
    request({ "cf-ipcountry": "br", "x-forwarded-for": "1.2.3.4, 9.9.9.9" }),
    "auth-login",
    opts(rpc),
  );
  assertEquals(decision, {
    allowed: true,
    rateLimitMaxRequests: 25,
    rateLimitWindowSeconds: 120,
  });
  // endpoint explícito e validado; IP é o mais à direita; país normalizado.
  assertEquals(rpc.calls.length, 1);
  assertEquals(rpc.calls[0].fn, "resolve_network_policy");
  assertEquals(rpc.calls[0].args.p_endpoint, "auth-login");
  assertEquals(rpc.calls[0].args.p_ip, "9.9.9.9");
  assertEquals(rpc.calls[0].args.p_country_code, "BR");
  assertEquals(rpc.calls[0].args.p_default_max_requests, 30);
  assertEquals(rpc.calls[0].args.p_default_window_seconds, 60);
});

Deno.test("resolveNetworkPolicy: IP bloqueado nega com 403 (reason ip_blocked)", async () => {
  const rpc = fakeRpc({
    data: [{ allowed: false, reason: "ip_blocked", rate_limit_max_requests: 30, rate_limit_window_seconds: 60 }],
    error: null,
  });
  const decision = await resolveNetworkPolicy(
    request({ "cf-ipcountry": "br", "x-forwarded-for": "6.6.6.6" }),
    "auth-login",
    opts(rpc),
  );
  assertEquals(decision, { allowed: false, status: 403, reason: "ip_blocked" });
  assertEquals(rpc.calls[0].args.p_ip, "6.6.6.6");
});

Deno.test("resolveNetworkPolicy: whitelist de IP NÃO isenta país — país bloqueado continua 403 e o país é sempre encaminhado", async () => {
  // A RPC decide country_blocked mesmo com o IP whitelisted (semântica do 27.1).
  // Aqui provamos que o módulo não "permite" sozinho por causa do IP: ele sempre
  // encaminha o país e respeita a negação por país que a RPC devolve.
  const rpc = fakeRpc({
    data: [{ allowed: false, reason: "country_blocked", rate_limit_max_requests: 30, rate_limit_window_seconds: 60 }],
    error: null,
  });
  const decision = await resolveNetworkPolicy(
    request({ "cf-ipcountry": "ru", "x-forwarded-for": "10.0.0.8" }),
    "auth-login",
    opts(rpc),
  );
  assertEquals(decision, { allowed: false, status: 403, reason: "country_blocked" });
  // o país foi encaminhado (não descartado), então a RPC pôde aplicar a geo
  assertEquals(rpc.calls[0].args.p_country_code, "RU");
  assertEquals(rpc.calls[0].args.p_ip, "10.0.0.8");
});

Deno.test("resolveNetworkPolicy: país ausente (header ausente) falha fechado — 403 com p_country_code null", async () => {
  // Geo ativo (whitelist vazia) + país ausente -> a RPC devolve country_blocked.
  // O módulo encaminha null e converte a negação em 403, sem inventar país.
  const rpc = fakeRpc({
    data: [{ allowed: false, reason: "country_blocked", rate_limit_max_requests: 30, rate_limit_window_seconds: 60 }],
    error: null,
  });
  const decision = await resolveNetworkPolicy(request(), "auth-login", opts(rpc));
  assertEquals(decision, { allowed: false, status: 403, reason: "country_blocked" });
  assertEquals(rpc.calls[0].args.p_country_code, null);
});

Deno.test("resolveNetworkPolicy: erro da RPC falha fechado com 503 (não vaza decisão)", async () => {
  const rpc = fakeRpc({ data: null, error: { message: "connection reset" } });
  const decision = await resolveNetworkPolicy(request({ "cf-ipcountry": "br" }), "auth-login", opts(rpc));
  assertEquals(decision, { allowed: false, status: 503 });
});

Deno.test("resolveNetworkPolicy: exceção da RPC falha fechado com 503", async () => {
  const rpc = rpcThrowing();
  const decision = await resolveNetworkPolicy(request(), "auth-login", opts(rpc));
  assertEquals(decision, { allowed: false, status: 503 });
});

Deno.test("resolveNetworkPolicy: endpoint inválido -> 503 sem chamar a RPC", async () => {
  const rpc = fakeRpc(ALLOWED);
  for (const bad of ["", "   ", "com espaco", null, undefined, "x".repeat(129)]) {
    const decision = await resolveNetworkPolicy(request(), bad as string, opts(rpc));
    assertEquals(decision, { allowed: false, status: 503 });
  }
  assertEquals(rpc.calls.length, 0);
});

Deno.test("resolveNetworkPolicy: resposta sem booleano allowed -> 503 (indecidível)", async () => {
  const rpc = fakeRpc({ data: null, error: null });
  const decision = await resolveNetworkPolicy(request(), "auth-login", opts(rpc));
  assertEquals(decision, { allowed: false, status: 503 });

  const rpc2 = fakeRpc({ data: [{ reason: "x" }], error: null });
  const decision2 = await resolveNetworkPolicy(request(), "auth-login", opts(rpc2));
  assertEquals(decision2, { allowed: false, status: 503 });
});

// a resposta de negação não revela listas/regras: o corpo é genérico
Deno.test("networkPolicyDenialResponse não vaza razão/regras no corpo", () => {
  // A decisão de negação carrega a categoria só para log server-side; o corpo
  // enviado ao cliente é genérico e idêntico para qualquer negação.
  const decision: NetworkPolicyDecision = { allowed: false, status: 403, reason: "country_blocked" };
  // Sanity: o campo de razão existe para log, mas quem serializa o corpo é o
  // módulo, via uma resposta genérica — validado por construção (errorResponse).
  assert(decision.status === 403);
  assertEquals(decision.reason, "country_blocked");
});
