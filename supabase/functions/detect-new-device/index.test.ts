import {
  decodeJwtClaims,
  extractAuthSessionId,
  decideSessionUpsert,
  buildSessionInsert,
  handleDetectNewDevice,
} from "./index.ts";

// R2-AUTH-004 (item 6): contratos executáveis do inventário de sessão.
// Sem rede e sem banco: só os helpers puros. O que é provado aqui:
//   1. mesma sessão Auth → atualiza a linha existente (não duplica);
//   2. sessões Auth distintas → auth_session_id distintos (distinguíveis);
//   4. session_id vem SÓ do claim JWT validado (nunca do corpo) e nunca vaza token.

function fail(msg: string): never {
  throw new Error(msg);
}

const A = "00000000-0000-4000-8000-000000000001";
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";

function makeToken(sessionId: string | null): string {
  const header = btoa(JSON.stringify({ alg: "HS256" })).replace(/=+$/, "");
  const payload: Record<string, unknown> = { sub: A, role: "authenticated" };
  if (sessionId) payload.session_id = sessionId;
  const b64 = btoa(JSON.stringify(payload)).replace(/=+$/, "");
  return `${header}.${b64}.sig`;
}

// ─── Critério 4: session_id vem SÓ do JWT validado (nunca do corpo) ───

Deno.test("extractAuthSessionId extrai session_id do claim JWT", () => {
  const sid = extractAuthSessionId(makeToken(S1));
  if (sid !== S1) fail(`esperava ${S1}, veio ${sid}`);
});

Deno.test("extractAuthSessionId devolve null sem claim ou com token malformado", () => {
  if (extractAuthSessionId(makeToken(null)) !== null) fail("JWT sem session_id deveria devolver null");
  if (extractAuthSessionId("nao-e-jwt") !== null) fail("token malformado deveria devolver null");
  if (extractAuthSessionId("a.b") !== null) fail("jwt com 2 partes deveria devolver null");
  if (extractAuthSessionId("a.!!!não-base64.c") !== null) fail("payload inválido deveria devolver null");
});

Deno.test("extractAuthSessionId ignora session_id fora do claim (só o token conta)", () => {
  // O corpo da requisição não entra na função: a assinatura só aceita o token.
  // Um payload malformado no claim nunca é elevado a session_id confiável.
  const header = btoa(JSON.stringify({ alg: "HS256" })).replace(/=+$/, "");
  const payload = btoa(JSON.stringify({ sub: A, session_id: 12345 })).replace(/=+$/, "");
  const sid = extractAuthSessionId(`${header}.${payload}.sig`);
  if (sid !== null) fail("session_id não-string deveria ser descartado (fail-closed)");
});

// ─── Critério 1: duas chamadas da mesma sessão → atualiza, não duplica ───

Deno.test("decideSessionUpsert atualiza linha existente da mesma sessão Auth", () => {
  const d = decideSessionUpsert("row-id-1");
  if (d.kind !== "update") fail("linha existente deveria atualizar (não inserir de novo)");
  if (d.sessionId !== "row-id-1") fail(`update deveria apontar para a linha existente, veio ${d.sessionId}`);
});

Deno.test("decideSessionUpsert insere na primeira visita da sessão Auth", () => {
  const d = decideSessionUpsert(null);
  if (d.kind !== "insert") fail("sem linha existente deveria inserir");
});

// ─── Critério 2: sessões distintas distinguíveis por auth_session_id ───

Deno.test("buildSessionInsert carrega auth_session_id distinto por sessão", () => {
  const now = new Date("2026-10-04T15:00:00Z");
  const row1 = buildSessionInsert({ userId: A, deviceId: "d1", authSessionId: S1, ipAddress: "1.1.1.1", userAgent: "ua", now });
  const row2 = buildSessionInsert({ userId: A, deviceId: "d1", authSessionId: S2, ipAddress: "1.1.1.1", userAgent: "ua", now });
  if (row1.auth_session_id !== S1) fail("linha 1 deveria carregar o auth_session_id S1");
  if (row2.auth_session_id !== S2) fail("linha 2 deveria carregar o auth_session_id S2");
  // S1 != S2 (constantes), e cada linha carrega o seu: as sessões são distinguíveis.
});

// ─── Nunca persiste token/secret ───

Deno.test("buildSessionInsert nunca persiste token ou secret", () => {
  const row = buildSessionInsert({
    userId: A, deviceId: "d1", authSessionId: S1,
    ipAddress: "1.1.1.1", userAgent: "ua", now: new Date(),
  });
  const keys = Object.keys(row).map((k) => k.toLowerCase());
  const forbidden = ["token", "access_token", "refresh_token", "jwt", "authorization", "password", "secret", "api_key"];
  for (const f of forbidden) {
    if (keys.some((k) => k.includes(f))) fail(`payload não deveria conter ${f}`);
  }
  if (row.auth_session_id !== S1) fail("payload deveria conter só o UUID auth_session_id");
});

Deno.test("decodeJwtClaims devolve {} para entrada malformada (não lança nem vaza)", () => {
  if (Object.keys(decodeJwtClaims("nao-e-jwt")).length !== 0) fail("token malformado deveria devolver {}");
  if (Object.keys(decodeJwtClaims("a.!!!não-base64.c")).length !== 0) fail("payload inválido deveria devolver {}");
});

// ─── handleDetectNewDevice: escapeHtml no email e rate limit 429 ───

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Route = { match: string; body: unknown; status?: number; method?: string; throws?: string };

function withFetch(routes: Route[]) {
  const original = globalThis.fetch;
  const seen: string[] = [];
  const bodies: Record<string, string> = {};
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    const alvo = new URL(url);
    const hostComPath = `${alvo.hostname}${alvo.pathname}`;
    const method = (init?.method || "GET").toUpperCase();
    const route = routes.find((r) => {
      if (r.match !== hostComPath && r.match !== alvo.pathname) return false;
      if (r.method && r.method.toUpperCase() !== method) return false;
      return true;
    });
    if (route?.throws) {
      seen.push(url);
      throw new Error(route.throws);
    }
    if (!route) {
      seen.push(`SEM_STUB ${method} ${url}`);
      return Promise.resolve(new Response("nao stubado", { status: 599 }));
    }
    seen.push(url);
    if (init?.body !== undefined) {
      bodies[url] = typeof init.body === "string" ? init.body : String(init.body);
    }
    return Promise.resolve(
      new Response(JSON.stringify(route.body), {
        status: route.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  return { seen, bodies, restore: () => { globalThis.fetch = original; } };
}

const ENV_KEYS_DETECT = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"] as const;

function withEnvDetect(values: Partial<Record<(typeof ENV_KEYS_DETECT)[number], string>>, fn: () => Promise<void>) {
  const saved = ENV_KEYS_DETECT.map((k) => [k, Deno.env.get(k)] as const);
  for (const key of ENV_KEYS_DETECT) {
    const value = values[key];
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  return fn().finally(() => {
    for (const [key, value] of saved) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  });
}

const ENV_OK_DETECT = {
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-de-teste",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-de-teste",
  RESEND_API_KEY: "re_key_de_teste",
};

const USER_DETECT = "30000000-0000-3000-3000-00000000000b";
const FINGERPRINT = "fp-teste-123";
const DEVICE_NAME_HTML = "<b>iPhone Hacker</b>";

function makeDetectRequest(body: unknown, ip = "203.0.113.50"): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": "Bearer token-de-teste",
    "x-forwarded-for": ip,
  };
  return new Request("https://stub.supabase.co/functions/v1/detect-new-device", {
    method: "POST", headers, body: JSON.stringify(body),
  });
}

const ROTA_AUTH = { match: "/auth/v1/user", body: { id: USER_DETECT, email: "test@promobrindes.com.br", aud: "authenticated" } };
const ROTA_DEVICE_NULL = { match: "/rest/v1/user_devices", body: [], method: "GET" };
const ROTA_DEVICE_INSERT = { match: "/rest/v1/user_devices", body: [{ id: "device-123", user_id: USER_DETECT, device_fingerprint: FINGERPRINT }], method: "POST" };
const ROTA_RATE_LIMIT_ALLOWED = { match: "/rest/v1/rpc/consume_rate_limit", body: [{ allowed: true, remaining: 4 }] };
const ROTA_RATE_LIMIT_DENIED = { match: "/rest/v1/rpc/consume_rate_limit", body: [{ allowed: false, remaining: 0 }] };
const ROTA_SECURITY_ALERT = { match: "/rest/v1/security_alerts", body: [{ id: "alert-123" }], method: "POST" };
const ROTA_SESSION_NULL = { match: "/rest/v1/user_sessions", body: [], method: "GET" };
const ROTA_SESSION_INSERT = { match: "/rest/v1/user_sessions", body: [{ id: "session-123" }], method: "POST" };

const semResend = (seen: string[]) => seen.filter((u) => {
  try { return new URL(u).hostname === "api.resend.com"; } catch { return false; }
});

Deno.test("handleDetectNewDevice: device_name com <b> é escapado como &lt;b&gt; no corpo do email Resend", async () => {
  await withEnvDetect(ENV_OK_DETECT, async () => {
    const stub = withFetch([
      ROTA_AUTH,
      ROTA_DEVICE_NULL,
      ROTA_DEVICE_INSERT,
      ROTA_RATE_LIMIT_ALLOWED,
      { match: "api.resend.com/emails", body: { id: "resend-1" }, method: "POST" },
      ROTA_SECURITY_ALERT,
      ROTA_SESSION_NULL,
      ROTA_SESSION_INSERT,
    ]);
    try {
      const res = await handleDetectNewDevice(makeDetectRequest({
        device_fingerprint: FINGERPRINT,
        browser: "Safari",
        os: "iOS",
        device_name: DEVICE_NAME_HTML,
      }));
      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const resendBodies = Object.entries(stub.bodies).filter(([url]) => {
        try { return new URL(url).hostname === "api.resend.com"; } catch { return false; }
      });
      assert(resendBodies.length === 1, `esperado 1 chamada ao Resend, veio ${resendBodies.length}. stub.seen: ${stub.seen.join(" | ")}`);
      const body = JSON.parse(resendBodies[0][1]);
      assert(body.html.includes("&lt;b&gt;"), `device_name deveria estar escapado no HTML: ${body.html}`);
      assert(!body.html.includes("<b>"), `device_name não deveria aparecer cru no HTML`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("handleDetectNewDevice: rate limit excedido devolve 429 antes de qualquer escrita (sem device, alerta ou Resend)", async () => {
  await withEnvDetect(ENV_OK_DETECT, async () => {
    const stub = withFetch([
      ROTA_AUTH,
      ROTA_RATE_LIMIT_DENIED,
      ROTA_DEVICE_NULL,
      ROTA_DEVICE_INSERT,
      ROTA_SECURITY_ALERT,
    ]);
    try {
      const res = await handleDetectNewDevice(makeDetectRequest({
        device_fingerprint: FINGERPRINT,
        browser: "Safari",
        os: "iOS",
        device_name: "iPhone normal",
      }));
      assert(res.status === 429, `esperado 429, veio ${res.status}. stub.seen: ${stub.seen.join(" | ")}`);
      const resendCalls = semResend(stub.seen);
      assert(resendCalls.length === 0, `não deveria chamar o Resend quando rate limited: ${stub.seen.join(",")}`);
      const alertCalls = stub.seen.filter((u) => {
        try { return new URL(u).pathname === "/rest/v1/security_alerts"; } catch { return false; }
      });
      assert(alertCalls.length === 0, `não deveria criar alerta de segurança quando rate limited: ${stub.seen.join(",")}`);
      const deviceCalls = stub.seen.filter((u) => {
        try { return new URL(u).pathname === "/rest/v1/user_devices"; } catch { return false; }
      });
      assert(deviceCalls.length === 0, `rate limit no topo: não deveria tocar user_devices quando rate limited: ${stub.seen.join(",")}`);
      const rlCalls = stub.seen.filter((u) => {
        try { return new URL(u).pathname === "/rest/v1/rpc/consume_rate_limit"; } catch { return false; }
      });
      assert(rlCalls.length === 1, `rate limit deveria ser consumido 1x no topo: ${stub.seen.join(",")}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("handleDetectNewDevice: Resend 500 só registra e segue (200 + security_alerts criado, sem log de sucesso)", async () => {
  await withEnvDetect(ENV_OK_DETECT, async () => {
    const stub = withFetch([
      ROTA_AUTH,
      ROTA_RATE_LIMIT_ALLOWED,
      ROTA_DEVICE_NULL,
      ROTA_DEVICE_INSERT,
      { match: "api.resend.com/emails", body: { error: "internal" }, method: "POST", status: 500 },
      ROTA_SECURITY_ALERT,
      ROTA_SESSION_NULL,
      ROTA_SESSION_INSERT,
    ]);
    const logs: string[] = [];
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    console.log = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
    console.warn = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
    console.error = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
    try {
      const res = await handleDetectNewDevice(makeDetectRequest({
        device_fingerprint: FINGERPRINT,
        browser: "Safari",
        os: "iOS",
        device_name: "iPhone normal",
      }, "203.0.113.51"));
      assert(res.status === 200, `Resend 500 deveria seguir com 200, veio ${res.status}. stub.seen: ${stub.seen.join(" | ")}`);
      const alertCalls = stub.seen.filter((u) => {
        try { return new URL(u).pathname === "/rest/v1/security_alerts"; } catch { return false; }
      });
      assert(alertCalls.length === 1, `security_alerts deveria ser criado mesmo com Resend 500: ${stub.seen.join(",")}`);
      const joined = logs.join("\n");
      assert(!joined.includes("Security email sent"), `Resend 500 não deveria logar sucesso: ${joined}`);
      assert(joined.includes("Error sending email"), `Resend 500 deveria registrar erro em log: ${joined}`);
    } finally {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
      stub.restore();
    }
  });
});

Deno.test("handleDetectNewDevice: exceção do Resend não aborta security_alerts (200 + alerta criado)", async () => {
  await withEnvDetect(ENV_OK_DETECT, async () => {
    const stub = withFetch([
      ROTA_AUTH,
      ROTA_RATE_LIMIT_ALLOWED,
      ROTA_DEVICE_NULL,
      ROTA_DEVICE_INSERT,
      { match: "api.resend.com/emails", body: {}, method: "POST", throws: "rede caiu" },
      ROTA_SECURITY_ALERT,
      ROTA_SESSION_NULL,
      ROTA_SESSION_INSERT,
    ]);
    try {
      const res = await handleDetectNewDevice(makeDetectRequest({
        device_fingerprint: FINGERPRINT,
        browser: "Safari",
        os: "iOS",
        device_name: "iPhone normal",
      }, "203.0.113.52"));
      assert(res.status === 200, `exceção do Resend deveria seguir com 200, veio ${res.status}. stub.seen: ${stub.seen.join(" | ")}`);
      const alertCalls = stub.seen.filter((u) => {
        try { return new URL(u).pathname === "/rest/v1/security_alerts"; } catch { return false; }
      });
      assert(alertCalls.length === 1, `security_alerts deveria ser criado mesmo com exceção do Resend: ${stub.seen.join(",")}`);
    } finally {
      stub.restore();
    }
  });
});
