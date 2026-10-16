// Cartão t_6a08446c — gravar `rate_limit_logs` quando uma requisição é negada
// (403 de política de rede) ou limitada (429). Offline: nenhum teste toca rede,
// banco ou env — o client de INSERT, o client da RPC e o `writer` são injetados.
//
// Run with: deno test --config scripts/ci/deno.json supabase/functions/_shared/__tests__/rate-limit-log.test.ts

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildRateLimitLogRow,
  insertRateLimitLog,
  maskIpForLog,
  scheduleRateLimitDenial,
  truncateUserAgent,
  USER_AGENT_MAX_LENGTH,
  type RateLimitLogClient,
  type RateLimitLogEntry,
  type RateLimitLogRow,
} from "../rate-limit-log.ts";
import {
  resolveNetworkPolicy,
  type NetworkPolicyRpcClient,
} from "../request-policy.ts";
import {
  checkRateLimit,
  enforceRateLimit,
  type EnforceRateLimitContext,
} from "../validation.ts";

const ENTRY: RateLimitLogEntry = {
  ip: "203.0.113.9",
  endpoint: "auth-login",
  country: "BR",
  userAgent: "curl/8",
  requestCount: 1,
  blocked: true,
};

/** Client de INSERT fake que registra as linhas gravadas. */
function fakeInsertClient(outcome: { error?: unknown } = {}) {
  const rows: RateLimitLogRow[] = [];
  const client: RateLimitLogClient = {
    from(table: string) {
      assertEquals(table, "rate_limit_logs");
      return {
        insert(row: RateLimitLogRow) {
          rows.push(row);
          return Promise.resolve(outcome);
        },
      };
    },
  };
  return { client, rows };
}

/** Request com IP/país/user-agent, rota de Edge Function. */
const request = (headers: Record<string, string> = {}) =>
  new Request("https://example.supabase.co/functions/v1/auth-login", { headers });

const policyRpc = (
  data: unknown,
  error: unknown = null,
): NetworkPolicyRpcClient => ({ rpc: () => Promise.resolve({ data, error }) });

const opts = (
  rpc: NetworkPolicyRpcClient,
  recordDenial?: (entry: RateLimitLogEntry) => void | Promise<void>,
) => ({ rpc, defaultMaxRequests: 30, defaultWindowSeconds: 60, recordDenial });

// ─────────────────────────────────────────────────────────────────────────────
// Montagem da linha (pura)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("buildRateLimitLogRow: só IP/endpoint/contagem/blocked/país/user_agent, com defaults", () => {
  assertEquals(buildRateLimitLogRow({ ip: "1.2.3.4", endpoint: "fn" }), {
    ip_address: "1.2.3.4",
    endpoint: "fn",
    request_count: 1,
    blocked: true,
  });
  // campos opcionais só entram quando presentes (não grava chave vazia)
  assertEquals(
    Object.keys(buildRateLimitLogRow({ ip: "1.2.3.4", endpoint: "fn", country: null, userAgent: "" })).sort(),
    ["blocked", "endpoint", "ip_address", "request_count"],
  );
  // request_count inválido cai para 1; explícito é respeitado
  assertEquals(buildRateLimitLogRow({ ip: "1.2.3.4", endpoint: "fn", requestCount: 0 }).request_count, 1);
  assertEquals(buildRateLimitLogRow({ ip: "1.2.3.4", endpoint: "fn", requestCount: 7 }).request_count, 7);
});

Deno.test("truncateUserAgent: corta em 200 e some com vazio", () => {
  assertEquals(truncateUserAgent("x".repeat(300))?.length, USER_AGENT_MAX_LENGTH);
  assertEquals(truncateUserAgent("  curl/8  "), "curl/8");
  assertEquals(truncateUserAgent(""), null);
  assertEquals(truncateUserAgent("   "), null);
  assertEquals(truncateUserAgent(null), null);
  assertEquals(truncateUserAgent(42), null);
});

Deno.test("maskIpForLog: nunca devolve o IP completo", () => {
  assertEquals(maskIpForLog("203.0.113.9"), "203.0.113.x");
  assertEquals(maskIpForLog("fe80::1"), "ipv6");
  assertEquals(maskIpForLog(""), "?");
  assertEquals(maskIpForLog("unknown"), "?");
  assert(!maskIpForLog("203.0.113.9").includes(".9"));
});

// ─────────────────────────────────────────────────────────────────────────────
// INSERT (núcleo do writer)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("insertRateLimitLog: grava exatamente a linha esperada (sem PII além de IP/endpoint)", async () => {
  const { client, rows } = fakeInsertClient();
  await insertRateLimitLog(client, {
    ip: "203.0.113.9",
    endpoint: "auth-login",
    country: "BR",
    userAgent: "x".repeat(300),
    requestCount: 3,
    blocked: true,
  });
  assertEquals(rows.length, 1);
  assertEquals(rows[0], {
    ip_address: "203.0.113.9",
    endpoint: "auth-login",
    request_count: 3,
    blocked: true,
    country: "BR",
    user_agent: "x".repeat(USER_AGENT_MAX_LENGTH),
  });
  // nenhuma coluna além das permitidas
  assertEquals(
    Object.keys(rows[0]).sort(),
    ["blocked", "country", "endpoint", "ip_address", "request_count", "user_agent"],
  );
});

Deno.test("insertRateLimitLog: erro do PostgREST ou exceção do client não lança", async () => {
  const { client } = fakeInsertClient({ error: { message: "permission denied" } });
  await insertRateLimitLog(client, ENTRY);

  const throwing: RateLimitLogClient = {
    from() {
      return { insert: () => { throw new Error("client down"); } };
    },
  };
  await insertRateLimitLog(throwing, ENTRY);
});

// ─────────────────────────────────────────────────────────────────────────────
// Disparo fire-and-forget
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("scheduleRateLimitDenial: engole throw síncrono e rejeição do writer", async () => {
  scheduleRateLimitDenial(() => {
    throw new Error("sync boom");
  }, ENTRY);
  scheduleRateLimitDenial(() => Promise.reject(new Error("async boom")), ENTRY);
  // deixa a microtask da rejeição rodar: se escapasse, o teste falharia por unhandled rejection
  await Promise.resolve();
});

// ─────────────────────────────────────────────────────────────────────────────
// Negação de política de rede (403) — resolveNetworkPolicy
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("resolveNetworkPolicy 403 (IP bloqueado): grava a linha com IP/endpoint/país/user_agent", async () => {
  const recorded: RateLimitLogEntry[] = [];
  const decision = await resolveNetworkPolicy(
    request({ "x-forwarded-for": "6.6.6.6", "cf-ipcountry": "br", "user-agent": "curl/8.0" }),
    "auth-login",
    opts(policyRpc([{ allowed: false, reason: "ip_blocked" }]), (entry) => { recorded.push(entry); }),
  );
  assertEquals(decision, { allowed: false, status: 403, reason: "ip_blocked" });
  assertEquals(recorded.length, 1);
  assertEquals(recorded[0], {
    ip: "6.6.6.6",
    endpoint: "auth-login",
    country: "BR",
    userAgent: "curl/8.0",
    requestCount: 1,
    blocked: true,
  });
});

Deno.test("resolveNetworkPolicy 403 (país bloqueado) grava ATÉ o user_agent em 200 via INSERT real", async () => {
  const { client, rows } = fakeInsertClient();
  const decision = await resolveNetworkPolicy(
    request({ "x-forwarded-for": "7.7.7.7", "user-agent": "y".repeat(500) }),
    "ai:transcribe:audio",
    opts(policyRpc([{ allowed: false, reason: "country_blocked" }]), (entry) => insertRateLimitLog(client, entry)),
  );
  assertEquals(decision, { allowed: false, status: 403, reason: "country_blocked" });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].ip_address, "7.7.7.7");
  assertEquals(rows[0].endpoint, "ai:transcribe:audio");
  assertEquals(rows[0].blocked, true);
  assertEquals(rows[0].user_agent?.length, USER_AGENT_MAX_LENGTH);
});

Deno.test("resolveNetworkPolicy: allow e 503 NÃO gravam (só a negação gera linha)", async () => {
  let calls = 0;
  const writer = () => { calls++; };
  await resolveNetworkPolicy(request(), "auth-login", opts(policyRpc([{ allowed: true }]), writer));
  await resolveNetworkPolicy(request(), "auth-login", opts(policyRpc(null, { message: "down" }), writer));
  await resolveNetworkPolicy(request(), "auth-login", opts(policyRpc([{ reason: "x" }]), writer)); // indecidível
  assertEquals(calls, 0);
});

Deno.test("falha de gravação na negação de política NÃO quebra a requisição (segue 403)", async () => {
  const decision = await resolveNetworkPolicy(
    request({ "x-forwarded-for": "8.8.8.8" }),
    "auth-login",
    opts(policyRpc([{ allowed: false, reason: "ip_blocked" }]), () => Promise.reject(new Error("db down"))),
  );
  assertEquals(decision, { allowed: false, status: 403, reason: "ip_blocked" });
  await Promise.resolve();
});

// ─────────────────────────────────────────────────────────────────────────────
// Rate limit 429 — enforceRateLimit
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("enforceRateLimit 429 (contador local): grava a linha com contexto do req", async () => {
  const key = `rl-local-${crypto.randomUUID()}`;
  // Exaure o contador local sem passar pelo client persistente...
  checkRateLimit(key, 1, 60_000);
  const recorded: RateLimitLogEntry[] = [];
  const ctx: EnforceRateLimitContext = {
    req: request({ "x-forwarded-for": "9.9.9.9", "cf-ipcountry": "us", "user-agent": "ua-1" }),
    writer: (entry) => { recorded.push(entry); },
  };
  const result = await enforceRateLimit(key, 1, 60_000, ctx);
  assertEquals(result.allowed, false);
  assertEquals(recorded.length, 1);
  assertEquals(recorded[0], {
    ip: "9.9.9.9",
    endpoint: "auth-login",
    country: "US",
    userAgent: "ua-1",
    requestCount: 1,
    blocked: true,
  });
});

Deno.test("enforceRateLimit 429 persistente (consume_rate_limit negou): grava a linha", async () => {
  const recorded: RateLimitLogEntry[] = [];
  const result = await enforceRateLimit(`rl-persist-${crypto.randomUUID()}`, 5, 60_000, {
    req: request({ "x-forwarded-for": "10.0.0.1" }),
    consumeRpc: { rpc: () => Promise.resolve({ data: [{ allowed: false, remaining: 0 }], error: null }) },
    writer: (entry) => { recorded.push(entry); },
  });
  assertEquals(result.allowed, false);
  assertEquals(result.persistent, true);
  assertEquals(recorded.length, 1);
  assertEquals(recorded[0].ip, "10.0.0.1");
  assertEquals(recorded[0].endpoint, "auth-login");
  assertEquals(recorded[0].requestCount, 5);
});

Deno.test("enforceRateLimit sem req: deriva endpoint do prefixo da chave e ip unknown", async () => {
  const recorded: RateLimitLogEntry[] = [];
  await enforceRateLimit(`detect-new-device:${crypto.randomUUID()}`, 1, 60_000, {
    consumeRpc: { rpc: () => Promise.resolve({ data: [{ allowed: false, remaining: 0 }], error: null }) },
    writer: (entry) => { recorded.push(entry); },
  });
  assertEquals(recorded.length, 1);
  assertEquals(recorded[0].endpoint, "detect-new-device");
  assertEquals(recorded[0].ip, "unknown");
});

Deno.test("enforceRateLimit permitido NÃO grava (e o ramo persistente indisponível também não)", async () => {
  const recorded: RateLimitLogEntry[] = [];
  const writer = (entry: RateLimitLogEntry) => { recorded.push(entry); };
  await enforceRateLimit(`rl-ok-${crypto.randomUUID()}`, 5, 60_000, {
    consumeRpc: { rpc: () => Promise.resolve({ data: [{ allowed: true, remaining: 4 }], error: null }) },
    writer,
  });
  await enforceRateLimit(`rl-err-${crypto.randomUUID()}`, 5, 60_000, {
    consumeRpc: { rpc: () => Promise.resolve({ data: null, error: { message: "down" } }) },
    writer,
  });
  assertEquals(recorded.length, 0);
});

Deno.test("falha de gravação no 429 NÃO quebra a requisição (segue allowed:false)", async () => {
  const result = await enforceRateLimit(`rl-fail-${crypto.randomUUID()}`, 1, 60_000, {
    consumeRpc: { rpc: () => Promise.resolve({ data: [{ allowed: false, remaining: 0 }], error: null }) },
    writer: () => Promise.reject(new Error("db down")),
  });
  assertEquals(result.allowed, false);
  await Promise.resolve();
});
