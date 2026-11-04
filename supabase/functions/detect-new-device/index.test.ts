import {
  decodeJwtClaims,
  extractAuthSessionId,
  decideSessionUpsert,
  buildSessionInsert,
  handleDetectNewDevice,
  buildDeviceAlertEmail,
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
// Token com claim session_id (S1): exercita o inventário de sessão (R2-AUTH-004).
const DETECT_AUTH_TOKEN = makeToken(S1);

function makeDetectRequest(body: unknown, ip = "203.0.113.50"): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${DETECT_AUTH_TOKEN}`,
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

Deno.test("handleDetectNewDevice: rate limit por usuário excedido devolve 429 sem enviar e-mail, mas mantém device, alerta e inventário de sessão (R2-AUTH-004)", async () => {
  await withEnvDetect(ENV_OK_DETECT, async () => {
    const stub = withFetch([
      ROTA_AUTH,
      ROTA_RATE_LIMIT_DENIED,
      ROTA_DEVICE_NULL,
      ROTA_DEVICE_INSERT,
      ROTA_SECURITY_ALERT,
      ROTA_SESSION_NULL,
      ROTA_SESSION_INSERT,
    ]);
    const pathname = (u: string) => { try { return new URL(u).pathname; } catch { return ""; } };
    try {
      const res = await handleDetectNewDevice(makeDetectRequest({
        device_fingerprint: FINGERPRINT,
        browser: "Safari",
        os: "iOS",
        device_name: "iPhone normal",
      }));
      assert(res.status === 429, `esperado 429, veio ${res.status}. stub.seen: ${stub.seen.join(" | ")}`);
      // O limite governa SÓ o envio do e-mail.
      assert(semResend(stub.seen).length === 0, `não deveria chamar o Resend quando rate limited: ${stub.seen.join(",")}`);
      // O 429 não pode pular o inventário de sessão nem o alerta (ponto 4).
      const alertCalls = stub.seen.filter((u) => pathname(u) === "/rest/v1/security_alerts");
      assert(alertCalls.length === 1, `security_alerts deveria ser criado mesmo rate limited: ${stub.seen.join(",")}`);
      const sessionCalls = stub.seen.filter((u) => pathname(u) === "/rest/v1/user_sessions");
      assert(sessionCalls.length === 2, `inventário de sessão (GET+POST) deveria acontecer mesmo rate limited, veio ${sessionCalls.length}: ${stub.seen.join(",")}`);
      const deviceCalls = stub.seen.filter((u) => pathname(u) === "/rest/v1/user_devices");
      assert(deviceCalls.length === 2, `o dispositivo deveria ser lido e inserido (GET+POST), veio ${deviceCalls.length}: ${stub.seen.join(",")}`);
      const rlCalls = stub.seen.filter((u) => pathname(u) === "/rest/v1/rpc/consume_rate_limit");
      assert(rlCalls.length === 1, `rate limit deveria ser consumido 1x: ${stub.seen.join(",")}`);
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

// ─── Hardening: campos do e-mail escapados (injeção de HTML) ───

Deno.test("buildDeviceAlertEmail escapa os campos vindos do chamador", () => {
  const html = buildDeviceAlertEmail({
    deviceName: '<script>alert(1)</script>',
    browser: 'Mozilla & "Co"',
    os: "<b>Linux</b>",
    clientIp: '1.2.3.4"><img src=x onerror=alert(1)>',
    whenLabel: "10/10/2026 20:00",
  });
  if (html.includes("<script>")) fail("device_name cru não pode chegar ao HTML");
  if (html.includes("<img src=x")) fail("clientIp cru não pode chegar ao HTML");
  if (html.includes("<b>Linux</b>")) fail("os cru não pode chegar ao HTML");
  if (!html.includes("&lt;script&gt;alert(1)&lt;/script&gt;")) fail("device_name deveria sair escapado");
  if (!html.includes("Mozilla &amp; &quot;Co&quot;")) fail("browser deveria sair escapado");
  if (!html.includes("&lt;b&gt;Linux&lt;/b&gt;")) fail("os deveria sair escapado");
});

Deno.test("buildDeviceAlertEmail preserva valores benignos", () => {
  const html = buildDeviceAlertEmail({
    deviceName: "Chrome no Windows",
    browser: "Chrome 120",
    os: "Windows 11",
    clientIp: "203.0.113.10",
    whenLabel: "10/10/2026 20:00",
  });
  for (const valor of ["Chrome no Windows", "Chrome 120", "Windows 11", "203.0.113.10"]) {
    if (!html.includes(valor)) fail(`valor benigno ${valor} deveria aparecer no e-mail`);
  }
});

// ─── Corrida do inventário: handler + cliente Supabase reais, HTTP interceptado ───

type SessionRaceOptions = {
  concurrent?: boolean;
  newDevice?: boolean;
  insertError?: { code?: string; message: string };
  canonical?: "missing" | "foreign-user" | "different-session";
  patchFailure?: "error" | "zero";
  returned?: "null" | "array" | "multiple" | "missing-id" | "empty-id" | "wrong-user" | "wrong-session";
  inactive?: boolean;
  rateAllowed?: boolean;
};
type SessionRaceResult = {
  responses: { status: number; body: Record<string, unknown> }[];
  sessions: Record<string, unknown>[];
  sessionReads: number;
  sessionInserts: number;
  sessionPatches: Record<string, unknown>[];
  sessionCollisions: number;
  deviceCount: number;
  alerts: number;
  emails: number;
};

const SESSION_UNIQUE_MESSAGE = 'duplicate key value violates unique constraint "idx_user_sessions_auth_session_id"';
const RACE_DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const RACE_SESSION_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_RACE_USER = "00000000-0000-4000-8000-000000000002";

async function runSessionRace(options: SessionRaceOptions = {}): Promise<SessionRaceResult> {
  let result: SessionRaceResult | undefined;
  await withEnvDetect(ENV_OK_DETECT, async () => {
    const originalFetch = globalThis.fetch;
    const originalConsole = { log: console.log, warn: console.warn, error: console.error };
    const logs: string[] = [];
    const violations: string[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const releaseGates: (() => void)[] = [];
    const devices: Record<string, unknown>[] = options.newDevice ? [] : [{
      id: RACE_DEVICE_ID, user_id: A, device_fingerprint: FINGERPRINT,
    }];
    const sessions: Record<string, unknown>[] = [];
    const sessionPatches: Record<string, unknown>[] = [];
    let deviceReads = 0, sessionReads = 0, sessionInserts = 0, sessionCollisions = 0, alerts = 0, emails = 0;
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { "content-type": "application/json" },
    });
    const dbError = (code: string | undefined, message: string, status = 409) => json({ code, message, details: null, hint: null }, status);
    const zeroRows = () => dbError("PGRST116", "JSON object requested, multiple (or no) rows returned", 406);
    const matches = (row: Record<string, unknown>, url: URL) => {
      for (const [key, value] of url.searchParams) {
        if (key === "select") continue;
        if (!value.startsWith("eq.") || row[key] !== value.slice(3)) return false;
      }
      return true;
    };
    const project = (row: Record<string, unknown>, select: string | null) => select === "*"
      ? { ...row }
      : Object.fromEntries((select ?? "").split(",").filter(Boolean).map((key) => [key, row[key]]));
    function twoReads(label: string) {
      let count = 0, release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      releaseGates.push(release);
      let timer: ReturnType<typeof setTimeout> | undefined;
      return async () => {
        count++;
        if (count === 1) {
          timer = setTimeout(() => { violations.push(`barreira incompleta: ${label}`); release(); }, 5_000);
          timers.push(timer);
        }
        if (count === 2) { clearTimeout(timer); release(); }
        await gate;
      };
    }
    const deviceGate = twoReads("user_devices");
    const sessionGate = twoReads("user_sessions");
    const canonicalRow = (): Record<string, unknown> => ({
      id: RACE_SESSION_ID,
      user_id: options.canonical === "foreign-user" ? OTHER_RACE_USER : A,
      auth_session_id: options.canonical === "different-session" ? S2 : S1,
      device_id: "55555555-5555-4555-8555-555555555555",
      ip_address: "192.0.2.99", user_agent: "previous-agent",
      is_active: !options.inactive, expires_at: "2026-10-01T00:00:00.000Z",
      ended_at: options.inactive ? "2026-10-01T01:00:00.000Z" : null,
    });

    // Nenhuma chamada cai no fetch original. Erros do próprio double ficam
    // registrados e reprovam o caso, mesmo se o handler responder 500 esperado.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const req = new Request(input instanceof URL ? input.href : input, init);
        const url = new URL(req.url);
        if (url.origin === "https://api.resend.com" && url.pathname === "/emails" && req.method === "POST") {
          emails++;
          return json({ id: "synthetic-email" });
        }
        assert(url.origin === ENV_OK_DETECT.SUPABASE_URL, "origem inesperada no double de sessão");
        if (url.pathname === "/auth/v1/user" && req.method === "GET") {
          // A corresponde ao sub do JWT desta fixture; não reutiliza USER_DETECT.
          assert(req.headers.get("authorization") === `Bearer ${DETECT_AUTH_TOKEN}`, "Auth precisa receber o JWT da requisição");
          return json({ id: A, email: "session-race@example.invalid", aud: "authenticated" });
        }
        if (url.pathname === "/rest/v1/rpc/consume_rate_limit" && req.method === "POST") {
          return json([{ allowed: options.rateAllowed !== false, remaining: options.rateAllowed === false ? 0 : 4 }]);
        }
        if (url.pathname === "/rest/v1/security_alerts" && req.method === "POST") {
          alerts++;
          return new Response(null, { status: 201 });
        }
        if (url.pathname === "/rest/v1/user_devices") {
          if (req.method === "GET") {
            assert(url.searchParams.get("user_id") === `eq.${A}` && url.searchParams.get("device_fingerprint") === `eq.${FINGERPRINT}`,
              "leitura de dispositivo precisa dos dois filtros");
            const snapshot = devices.filter((row) => matches(row, url)).map((row) => project(row, url.searchParams.get("select")));
            deviceReads++;
            if (options.concurrent && options.newDevice && deviceReads <= 2) await deviceGate();
            return json(snapshot); // GET maybeSingle recebe array do PostgREST.
          }
          if (req.method === "POST") {
            const body = await req.json() as Record<string, unknown>;
            assert(body.user_id === A && body.device_fingerprint === FINGERPRINT, "dispositivo inserido precisa pertencer ao usuário");
            if (devices.length) return dbError("23505", 'duplicate key value violates unique constraint "user_devices_user_id_device_fingerprint_key"');
            const row = { ...body, id: RACE_DEVICE_ID }; devices.push(row);
            assert(req.headers.get("accept") === "application/vnd.pgrst.object+json", "POST single precisa pedir objeto");
            return json(project(row, url.searchParams.get("select")), 201);
          }
          if (req.method === "PATCH") {
            const body = await req.json() as Record<string, unknown>;
            for (const row of devices) if (matches(row, url)) Object.assign(row, body);
            return new Response(null, { status: 204 });
          }
        }
        if (url.pathname === "/rest/v1/user_sessions") {
          if (req.method === "GET") {
            assert(url.searchParams.get("user_id") === `eq.${A}` && url.searchParams.get("auth_session_id") === `eq.${S1}`,
              "leitura de sessão precisa de usuário e claim");
            assert(url.searchParams.get("select") === "id", "leitura inicial deve projetar apenas id");
            const snapshot = sessions.filter((row) => matches(row, url)).map((row) => project(row, "id"));
            sessionReads++;
            if (options.concurrent && sessionReads <= 2) await sessionGate();
            return json(snapshot);
          }
          if (req.method === "POST") {
            const body = await req.json() as Record<string, unknown>;
            assert(body.user_id === A && body.auth_session_id === S1, "inventário novo precisa do usuário e claim verificados");
            assert(req.headers.get("accept") === "application/vnd.pgrst.object+json", "POST single de sessão precisa pedir objeto");
            sessionInserts++;
            if (!options.concurrent) {
              if (options.canonical !== "missing") sessions.push(canonicalRow());
              const error = options.insertError ?? { code: "23505", message: SESSION_UNIQUE_MESSAGE };
              sessionCollisions++;
              return dbError(error.code, error.message);
            }
            if (sessions.some((row) => row.auth_session_id === body.auth_session_id)) {
              sessionCollisions++;
              return dbError("23505", SESSION_UNIQUE_MESSAGE);
            }
            const row = { ...body, id: RACE_SESSION_ID }; sessions.push(row);
            return json(project(row, url.searchParams.get("select")), 201);
          }
          if (req.method === "PATCH") {
            assert(url.searchParams.get("user_id") === `eq.${A}` && url.searchParams.get("auth_session_id") === `eq.${S1}`,
              "recuperação precisa filtrar usuário e sessão Auth atuais");
            assert(url.searchParams.get("select") === "id,user_id,auth_session_id", "recuperação precisa projetar identidade completa");
            assert(req.headers.get("accept") === "application/vnd.pgrst.object+json", "PATCH precisa pedir um objeto singular");
            assert(req.headers.get("prefer")?.split(",").includes("return=representation"), "PATCH precisa pedir a linha atualizada");
            const body = await req.json() as Record<string, unknown>;
            assert(Object.keys(body).sort().join(",") === "device_id,ip_address,last_activity_at,user_agent", "PATCH só pode alterar os quatro campos sequenciais");
            assert(body.device_id === RACE_DEVICE_ID && typeof body.last_activity_at === "string" && Number.isFinite(Date.parse(body.last_activity_at)),
              "PATCH precisa do dispositivo canônico e atividade válida");
            sessionPatches.push({ ...body });
            if (options.patchFailure === "error") return dbError("42501", "controlled update denied", 403);
            if (options.patchFailure === "zero") sessions.length = 0;
            const found = sessions.filter((row) => matches(row, url));
            if (found.length !== 1) return zeroRows();
            Object.assign(found[0], body);
            const row = project(found[0], url.searchParams.get("select"));
            if (options.returned === "null") return json(null);
            if (options.returned === "array") return json([row]);
            if (options.returned === "multiple") return json([row, { ...row, id: "66666666-6666-4666-8666-666666666666" }]);
            if (options.returned === "missing-id") delete row.id;
            if (options.returned === "empty-id") row.id = "";
            if (options.returned === "wrong-user") row.user_id = OTHER_RACE_USER;
            if (options.returned === "wrong-session") row.auth_session_id = S2;
            return json(row);
          }
        }
        throw new Error("rota ou método inesperado no double de sessão");
      } catch (error) {
        violations.push(error instanceof Error ? error.message : "falha do double");
        return json({ message: "fixture contract failure" }, 599);
      }
    }) as typeof fetch;
    const capture = (...values: unknown[]) => {
      logs.push(values.map((value) => typeof value === "string" ? value : JSON.stringify(value, (_key, entry) =>
        entry instanceof Error ? { message: entry.message } : entry)).join(" "));
    };
    console.log = capture; console.warn = capture; console.error = capture;
    try {
      const requests = Array.from({ length: options.concurrent ? 2 : 1 }, (_, index) => {
        const request = makeDetectRequest({ device_fingerprint: FINGERPRINT, browser: "Browser", os: "OS", device_name: "Device" }, `192.0.2.${index + 10}`);
        request.headers.set("user-agent", `session-race-agent-${index}`);
        return handleDetectNewDevice(request);
      });
      const responses = await Promise.all(requests);
      const bodies = await Promise.all(responses.map((response) => response.json() as Promise<Record<string, unknown>>));
      assert(violations.length === 0, `double nativo inválido: ${violations.join("; ")}`);
      for (const secret of [DETECT_AUTH_TOKEN, ENV_OK_DETECT.SUPABASE_ANON_KEY, ENV_OK_DETECT.SUPABASE_SERVICE_ROLE_KEY, ENV_OK_DETECT.RESEND_API_KEY]) {
        assert(!logs.some((line) => line.includes(secret)), "o handler não pode registrar JWT ou chaves");
      }
      result = { responses: responses.map((response, index) => ({ status: response.status, body: bodies[index] })),
        sessions, sessionReads, sessionInserts, sessionPatches, sessionCollisions, deviceCount: devices.length, alerts, emails };
    } finally {
      for (const timer of timers) clearTimeout(timer);
      for (const release of releaseGates) release();
      globalThis.fetch = originalFetch;
      console.log = originalConsole.log; console.warn = originalConsole.warn; console.error = originalConsole.error;
    }
  });
  assert(result !== undefined, "a observação de sessão precisa concluir");
  return result;
}

for (const newDevice of [false, true]) {
  Deno.test(`handleDetectNewDevice: duas visitas concorrentes com dispositivo ${newDevice ? "novo" : "conhecido"} convergem para uma sessão`, async () => {
    const observed = await runSessionRace({ concurrent: true, newDevice });
    assert(observed.responses.every((response) => response.status === 200), "ambas as visitas precisam concluir sem 500");
    assert(observed.responses.every((response) => response.body.session_id === RACE_SESSION_ID), "ambas precisam devolver a mesma sessão canônica");
    assert(observed.sessionReads === 2 && observed.sessionInserts === 2 && observed.sessionCollisions === 1, "a prova precisa exercer SELECTs vazios e INSERTs concorrentes");
    assert(observed.sessions.length === 1 && observed.deviceCount === 1 && observed.sessionPatches.length === 1, "a corrida precisa convergir sem duplicar inventário");
    assert(observed.sessions[0].user_agent === observed.sessionPatches[0].user_agent && observed.sessions[0].ip_address === observed.sessionPatches[0].ip_address,
      "a visita recuperada precisa persistir seus próprios metadados");
    assert(observed.alerts === (newDevice ? 1 : 0) && observed.emails === (newDevice ? 1 : 0), "a recuperação de sessão não pode repetir alerta ou email");
    assert(observed.responses.filter((response) => response.body.is_new_device === true).length === (newDevice ? 1 : 0), "classificação do dispositivo precisa permanecer correta");
  });
}

Deno.test("handleDetectNewDevice: só o código e a mensagem exatos do índice de sessão autorizam recuperação", async () => {
  for (const insertError of [
    { code: "23503", message: SESSION_UNIQUE_MESSAGE },
    { message: SESSION_UNIQUE_MESSAGE },
    { code: "23505", message: 'duplicate key value violates unique constraint "other_session_unique"' },
    { code: "23505", message: 'duplicate key value violates unique constraint "idx_user_sessions_auth_session_id_copy"' },
    { code: "23505", message: 'valor de chave duplicado viola a restrição de unicidade "idx_user_sessions_auth_session_id"' },
  ]) {
    const observed = await runSessionRace({ insertError });
    assert(observed.responses[0].status === 500, "erro não reconhecido deve continuar falhando");
    assert(observed.sessionPatches.length === 0, "erro de outro contrato não pode atualizar uma sessão existente");
  }
});

for (const canonical of ["missing", "foreign-user", "different-session"] as const) {
  Deno.test(`handleDetectNewDevice: recuperação recusa vencedora ${canonical}`, async () => {
    const observed = await runSessionRace({ canonical });
    assert(observed.responses[0].status === 500, "sem vencedora própria não existe recuperação válida");
    assert(observed.sessionPatches.length === 1, "a prova precisa chegar ao UPDATE filtrado");
    assert(observed.sessions.every((row) => row.user_agent === "previous-agent"), "linha alheia não pode ser alterada");
  });
}

Deno.test("handleDetectNewDevice: erro ou zero linhas no UPDATE canônico não vira sucesso", async () => {
  for (const patchFailure of ["error", "zero"] as const) {
    const observed = await runSessionRace({ patchFailure });
    assert(observed.responses[0].status === 500 && observed.sessionPatches.length === 1, "PATCH sem atualização confirmada precisa falhar");
  }
});

Deno.test("handleDetectNewDevice: retorno canônico nulo, múltiplo ou com identidade inválida é recusado", async () => {
  for (const returned of ["null", "array", "multiple", "missing-id", "empty-id", "wrong-user", "wrong-session"] as const) {
    const observed = await runSessionRace({ returned });
    assert(observed.responses[0].status === 500 && observed.sessionPatches.length === 1, "retorno não canônico não comprova a sessão recuperada");
  }
});

Deno.test("handleDetectNewDevice: recuperação preserva sessão inativa, encerramento e validade", async () => {
  const observed = await runSessionRace({ inactive: true });
  assert(observed.responses[0].status === 200 && observed.responses[0].body.session_id === RACE_SESSION_ID, "a linha própria deve ser recuperada");
  assert(observed.sessions[0].is_active === false && observed.sessions[0].ended_at === "2026-10-01T01:00:00.000Z" && observed.sessions[0].expires_at === "2026-10-01T00:00:00.000Z",
    "recuperar uma visita não pode reativar nem prolongar a sessão");
  assert(observed.sessions[0].user_agent === "session-race-agent-0" && observed.sessions[0].ip_address === "192.0.2.10", "os metadados da visita precisam ser atualizados");
});

Deno.test("handleDetectNewDevice: rate limit mantém 429 depois de recuperar inventário e criar um único alerta", async () => {
  const observed = await runSessionRace({ newDevice: true, rateAllowed: false });
  assert(observed.responses[0].status === 429, "a recuperação não pode suprimir o 429 de dispositivo novo");
  assert(observed.sessions.length === 1 && observed.sessionPatches.length === 1 && observed.sessions[0].user_agent === "session-race-agent-0", "429 não pode pular o inventário");
  assert(observed.alerts === 1 && observed.emails === 0, "rate limit não pode repetir alerta nem enviar email");
});
