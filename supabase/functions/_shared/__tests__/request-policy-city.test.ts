// Bloqueio de login por CIDADE (paridade Promo Gifts V4) — fronteira R2-AUTH-022.
//
// OFFLINE: o client service_role, o client anônimo e o rate limit são injetados no
// handler REAL (`handleLogin` de auth-login). Prova que:
//   * a cidade vem SÓ do header confiável `cf-ipcity`, normalizada (UTF-8 lido como
//     latin1 é recuperado) e chega à RPC como `p_city`; ausente/inválida vira null;
//   * a negação `city_blocked` da RPC vira 403 genérico, idêntico ao de país, e o
//     handler para antes de body/credenciais/efeitos;
//   * a semântica de lista/toggle em si é provada em Postgres real por
//     scripts/db-audit/city-whitelist-network-policy.test.sh.
//
// Run with: deno test --config scripts/ci/deno.json supabase/functions/_shared/__tests__/request-policy-city.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleLogin } from "../../auth-login/index.ts";
import { extractCity, normalizeCity } from "../request-policy.ts";

const URL = "https://example.supabase.co/functions/v1/auth-login";
const IP = "9.9.9.9";
const BODY = JSON.stringify({ email: "a@b.com", password: "secret" });

const post = (headers: Record<string, string> = {}) =>
  new Request(URL, {
    method: "POST",
    headers: { "x-forwarded-for": IP, "content-type": "application/json", ...headers },
    body: BODY,
  });

function fakeAdmin(policy: { data: unknown; error: unknown }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === "resolve_network_policy") return Promise.resolve(policy);
      if (fn === "is_account_locked") return Promise.resolve({ data: [{ is_locked: false, locked_until: null, attempts: 0 }], error: null });
      if (fn === "clear_login_attempts") return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
    },
  };
}

function fakeAnon() {
  const calls: Array<{ email: string; password: string }> = [];
  return {
    calls,
    auth: {
      signInWithPassword(creds: { email: string; password: string }) {
        calls.push(creds);
        return Promise.resolve({
          data: {
            session: { access_token: "t", refresh_token: "r", expires_in: 3600, expires_at: null, token_type: "bearer" },
            user: { id: "u1" },
          },
          error: null,
        });
      },
    },
  };
}

const rateLimit = () => {
  const calls: unknown[] = [];
  return { calls, enforceRateLimit: (...a: unknown[]) => { calls.push(a); return Promise.resolve({ allowed: true }); } };
};

const ALLOW = { data: [{ allowed: true, reason: null, rate_limit_max_requests: 10, rate_limit_window_seconds: 60 }], error: null };
const DENY_CITY = { data: [{ allowed: false, reason: "city_blocked", rate_limit_max_requests: 10, rate_limit_window_seconds: 60 }], error: null };
const DENY_COUNTRY = { data: [{ allowed: false, reason: "country_blocked", rate_limit_max_requests: 10, rate_limit_window_seconds: 60 }], error: null };

Deno.test("handler real encaminha cf-ipcity à RPC como p_city (UTF-8 recuperado)", async () => {
  const admin = fakeAdmin(ALLOW);
  const rl = rateLimit();
  // O runtime entrega bytes UTF-8 de "São Paulo" como latin1: "SÃ£o Paulo".
  const res = await handleLogin(post({ "cf-ipcountry": "br", "cf-ipcity": "SÃ£o  Paulo" }), {
    admin,
    anon: fakeAnon(),
    enforceRateLimit: rl.enforceRateLimit,
  });
  assertEquals(res.status, 200);
  const policyCall = admin.calls.find((c) => c.fn === "resolve_network_policy")!;
  assertEquals(policyCall.args.p_city, "São Paulo");
  assertEquals(policyCall.args.p_country_code, "BR");
});

Deno.test("sem cf-ipcity a RPC recebe p_city null (a RPC falha fechado com a lista ativa)", async () => {
  const admin = fakeAdmin(ALLOW);
  await handleLogin(post({ "cf-ipcountry": "br" }), { admin, anon: fakeAnon(), enforceRateLimit: rateLimit().enforceRateLimit });
  assertEquals(admin.calls.find((c) => c.fn === "resolve_network_policy")!.args.p_city, null);
});

Deno.test("cidade enviada no body ou em header não confiável é ignorada", async () => {
  const admin = fakeAdmin(ALLOW);
  const req = new Request(URL, {
    method: "POST",
    headers: { "x-forwarded-for": IP, "x-city": "Curitiba", "x-vercel-ip-city": "Curitiba" },
    body: JSON.stringify({ email: "a@b.com", password: "secret", city: "Curitiba" }),
  });
  await handleLogin(req, { admin, anon: fakeAnon(), enforceRateLimit: rateLimit().enforceRateLimit });
  assertEquals(admin.calls.find((c) => c.fn === "resolve_network_policy")!.args.p_city, null);
});

Deno.test("city_blocked: 403 genérico igual ao de país, sem efeitos colaterais", async () => {
  const run = async (policy: typeof DENY_CITY) => {
    const admin = fakeAdmin(policy);
    const anon = fakeAnon();
    const rl = rateLimit();
    const res = await handleLogin(post({ "cf-ipcountry": "br", "cf-ipcity": "Manaus" }), {
      admin,
      anon,
      enforceRateLimit: rl.enforceRateLimit,
    });
    assertEquals(admin.calls.map((c) => c.fn), ["resolve_network_policy"]);
    assertEquals(anon.calls.length, 0);
    assertEquals(rl.calls.length, 0);
    return { status: res.status, body: await res.text() };
  };
  const city = await run(DENY_CITY);
  const country = await run(DENY_COUNTRY);
  assertEquals(city.status, 403);
  assertEquals(city, country); // cliente não distingue cidade de país
});

Deno.test("normalizeCity: UTF-8 como latin1, espaços, vazio, controle e tamanho", () => {
  assertEquals(normalizeCity("SÃ£o Paulo"), "São Paulo");
  assertEquals(normalizeCity("São Paulo"), "São Paulo"); // já correto: não re-decodifica
  assertEquals(normalizeCity("  Rio   de  Janeiro "), "Rio de Janeiro");
  assertEquals(normalizeCity("São"), "São"); // latin1 que não é UTF-8 válido: mantém
  assertEquals(normalizeCity(""), null);
  assertEquals(normalizeCity("   "), null);
  assertEquals(normalizeCity(null), null);
  assertEquals(normalizeCity(undefined), null);
  assertEquals(normalizeCity("Cur\u0007itiba"), null);
  assertEquals(normalizeCity("a".repeat(128)), "a".repeat(128));
  assertEquals(normalizeCity("a".repeat(129)), null);
});

Deno.test("extractCity: só cf-ipcity; header inválido vira null", () => {
  const req = (h: Record<string, string>) => new Request(URL, { headers: h });
  assertEquals(extractCity(req({ "cf-ipcity": "Belo Horizonte" })), "Belo Horizonte");
  assertEquals(extractCity(req({ "cf-ipcity": "  " })), null);
  assertEquals(extractCity(req({ "x-city": "Belo Horizonte" })), null);
  assertEquals(extractCity(req({})), null);
});
