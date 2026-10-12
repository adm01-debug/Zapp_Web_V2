import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleEvolutionApi, formatPairingCode, pairingCodeFromResponse, pairingValidity, resolvePairingRoute } from "./index.ts";
import {
  qrFromV2Connect,
  resolveSessionApiKey,
  resolveSessionRoute,
  sessionStateFromV2,
  type EvolutionFlavor,
  type SessionAction,
} from "../_shared/evolution-session-routes.ts";
import { resetInstanceTokenCache } from "../_shared/evolution-instance-token.ts";

/* eslint-disable @typescript-eslint/no-explicit-any -- mocks estruturais dos
   clients Supabase (SupabaseClient é genérico e não é importável no teste). */

// R2-API-015 (P2): o ciclo de sessão (connect/status/disconnect) executava fetch
// direto nas rotas NATIVAS do GO mesmo com EVOLUTION_API_FLAVOR=v2 — sem ramo v2
// e sem o nome da instância no path. RED: com flavor v2, `status` batia em
// `/instance/status` (rota GO) e `connect`/`disconnect` em `/instance/connect` e
// `/instance/logout` sem sufixo. GREEN: cada ação de sessão escolhe rota,
// método, credencial e normalização pelo flavor (matriz completa abaixo).
//
// Tudo offline: o provedor é um servidor HTTP local que REGISTRA método, path,
// header apikey e corpo de cada requisição; o handler real é o mesmo das edges
// (handleEvolutionApi) com os dois clients do Supabase injetados.

const GLOBAL_KEY = "global-key-fixture";
const INSTANCE_TOKEN = "instance-token-fixture";
const INSTANCE = "fixture-connection";

let ipSeq = 0;
function nextIp(): string {
  ipSeq += 1;
  return `10.1.0.${ipSeq}`;
}

type ProviderCall = {
  method: string;
  path: string;
  apikey: string | null;
  body: Record<string, unknown> | null;
};

type ProviderRoute = (req: Request, url: URL) => Response | null;

/** Provedor Evolution falso: registra cada requisição e responde o que a rota mandar. */
function startFakeProvider(route: ProviderRoute) {
  const calls: ProviderCall[] = [];
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    async (req) => {
      const url = new URL(req.url);
      const raw = await req.text();
      let body: Record<string, unknown> | null = null;
      try {
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          body = parsed as Record<string, unknown>;
        }
      } catch { /* corpo não-JSON */ }
      calls.push({ method: req.method, path: url.pathname, apikey: req.headers.get("apikey"), body });
      return route(req, url) ??
        new Response(JSON.stringify({ error: "unexpected_route", method: req.method, path: url.pathname }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
    },
  );
  const addr = server.addr;
  if (addr.transport !== "tcp") throw new Error("fake provider: era esperado um listener TCP");
  return { url: `http://127.0.0.1:${addr.port}`, calls, stop: () => server.shutdown() };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Registro das escritas no banco (service client) — encadeia e grava no await. */
type Write = { table: string; patch: Record<string, unknown> };
function makeServiceClient(writes: Write[]): any {
  const query = (table: string): any => {
    let patch: Record<string, unknown> | null = null;
    const q: any = {
      select: () => q,
      eq: () => q,
      neq: () => q,
      not: () => q,
      in: () => q,
      order: () => q,
      limit: () => q,
      update: (p: Record<string, unknown>) => { patch = p; return q; },
      insert: () => q,
      delete: () => q,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        if (patch) writes.push({ table, patch });
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      },
    };
    return q;
  };
  return { from: (table: string) => query(table), rpc: (fn: string) => fn === "get_instance_token" ? Promise.resolve({ data: INSTANCE_TOKEN, error: null }) : Promise.resolve({ data: null, error: null }) };
}

function makeCallerClient(): any {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "admin-fixture" } }, error: null }) },
    rpc: (fn: string) => Promise.resolve({ data: fn === "is_admin_or_supervisor", error: null }),
  };
}

function sessionRequest(action: string, body: Record<string, unknown> = {}): Request {
  return new Request(`http://localhost/functions/v1/evolution-api/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.fixture.signature",
      "x-real-ip": nextIp(),
    },
    body: JSON.stringify({ action, instanceName: INSTANCE, ...body }),
  });
}

/** Roda o handler com flavor/URL controlados e devolve a resposta + o que foi observado. */
async function runAction(
  flavor: EvolutionFlavor,
  action: SessionAction | "pairing-code",
  route: ProviderRoute,
  actionBody: Record<string, unknown> = {},
): Promise<{ status: number; body: any; calls: ProviderCall[]; writes: Write[] }> {
  const fake = startFakeProvider(route);
  const writes: Write[] = [];
  const previousFlavor = Deno.env.get("EVOLUTION_API_FLAVOR");
  const previousUrl = Deno.env.get("EVOLUTION_API_URL");
  const previousKey = Deno.env.get("EVOLUTION_API_KEY");
  const previousToken = Deno.env.get("EVOLUTION_INSTANCE_TOKEN");
  Deno.env.set("EVOLUTION_API_FLAVOR", flavor);
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  Deno.env.set("EVOLUTION_API_KEY", GLOBAL_KEY);
  Deno.env.set("EVOLUTION_INSTANCE_TOKEN", INSTANCE_TOKEN);
  resetInstanceTokenCache();
  try {
    const res = await handleEvolutionApi(sessionRequest(action, actionBody), {
      callerClient: makeCallerClient(),
      supabase: makeServiceClient(writes),
    });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: res.status, body, calls: [...fake.calls], writes };
  } finally {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    };
    restore("EVOLUTION_API_FLAVOR", previousFlavor);
    restore("EVOLUTION_API_URL", previousUrl);
    restore("EVOLUTION_API_KEY", previousKey);
    restore("EVOLUTION_INSTANCE_TOKEN", previousToken);
    await fake.stop();
  }
}

// ─── Matriz pura: rota/método/credencial/normalização por flavor ───

Deno.test("R2-API-015: matriz go/v2 escolhe método, path (com instância só no v2) e credencial", () => {
  const matrix: Array<{ flavor: EvolutionFlavor; action: SessionAction; method: string; path: string; auth: string }> = [
    { flavor: "go", action: "connect", method: "POST", path: "/instance/connect", auth: "instance" },
    { flavor: "go", action: "status", method: "GET", path: "/instance/status", auth: "instance" },
    { flavor: "go", action: "disconnect", method: "DELETE", path: "/instance/logout", auth: "instance" },
    { flavor: "v2", action: "connect", method: "POST", path: `/instance/connect/${INSTANCE}`, auth: "global" },
    { flavor: "v2", action: "status", method: "GET", path: `/instance/connectionState/${INSTANCE}`, auth: "global" },
    { flavor: "v2", action: "disconnect", method: "DELETE", path: `/instance/logout/${INSTANCE}`, auth: "global" },
  ];
  for (const c of matrix) {
    const route = resolveSessionRoute(c.flavor, c.action, INSTANCE);
    assertEquals(route.method, c.method, `${c.flavor}/${c.action}: método`);
    assertEquals(route.path, c.path, `${c.flavor}/${c.action}: path`);
    assertEquals(route.auth, c.auth, `${c.flavor}/${c.action}: credencial`);
    const suffixFree = c.flavor === "go";
    assertEquals(
      route.path.includes(INSTANCE),
      !suffixFree,
      `${c.flavor}/${c.action}: nome da instância no path só no v2`,
    );
  }
  const goRoute = resolveSessionRoute("go", "status", INSTANCE);
  const v2Route = resolveSessionRoute("v2", "status", INSTANCE);
  assertEquals(resolveSessionApiKey(goRoute, INSTANCE_TOKEN, GLOBAL_KEY), INSTANCE_TOKEN, "GO usa o token da instância");
  assertEquals(resolveSessionApiKey(goRoute, undefined, GLOBAL_KEY), GLOBAL_KEY, "GO cai na chave global sem token");
  assertEquals(resolveSessionApiKey(v2Route, INSTANCE_TOKEN, GLOBAL_KEY), GLOBAL_KEY, "v2 usa a chave global, não o token GO");
});

Deno.test("R2-API-015: normalização por flavor (state do v2 e QR do connect)", () => {
  assertEquals(sessionStateFromV2({ instance: { state: "open" } }), "open");
  assertEquals(sessionStateFromV2({ instance: { state: "connecting" } }), "close");
  assertEquals(sessionStateFromV2({ instance: { state: "qrcode" } }), "close");
  assertEquals(sessionStateFromV2({ data: { LoggedIn: true, Connected: true } }), "close", "shape GO não vira 'open' no v2");
  assertEquals(sessionStateFromV2(null), "close");

  assertEquals(qrFromV2Connect({ base64: "data:image/png;base64,AA", code: "2@abc" }), { base64: "data:image/png;base64,AA", code: "2@abc" });
  assertEquals(qrFromV2Connect({ base64: "data:image/png;base64,AA", pairingCode: "2@pair" }), { base64: "data:image/png;base64,AA", code: "2@pair" });
  assertEquals(qrFromV2Connect({ base64: "data:image/png;base64,AA" }), { base64: "data:image/png;base64,AA", code: "" });
  assertEquals(qrFromV2Connect({ instance: { state: "open" } }), null, "sessão aberta não é QR");
  assertEquals(qrFromV2Connect(null), null);
});

// ─── connect ───

Deno.test("R2-API-015 connect GO: rota nativa do GO (sem instância no path) com o token da instância", async () => {
  const { body, calls, writes } = await runAction("go", "connect", (_req, url) => {
    if (url.pathname === "/instance/connect") return json({ message: "success" });
    if (url.pathname === "/instance/qr") return json({ data: { code: "fake-code", qrcode: "GO-QR-PNG" } });
    return null;
  });
  assertEquals(calls.length, 2, "connect GO: connect + leitura do QR");
  assertEquals(calls[0].method, "POST");
  assertEquals(calls[0].path, "/instance/connect");
  assertEquals(calls[0].apikey, INSTANCE_TOKEN);
  assertEquals(calls[0].body?.subscribe, ["ALL"]);
  assert(String(calls[0].body?.webhookUrl).endsWith("/functions/v1/evolution-webhook"));
  assertEquals(calls[1].method, "GET");
  assertEquals(calls[1].path, "/instance/qr");
  assertEquals(body.status, "qr_pending");
  assertEquals(body.qrcode, { base64: "GO-QR-PNG", code: "fake-code" });
  assertEquals(
    writes.find((w) => w.table === "whatsapp_connections")?.patch,
    { qr_code: "GO-QR-PNG", status: "qr_pending", instance_id: INSTANCE },
  );
});

Deno.test("R2-API-015 connect v2: rota v2 COM a instância no path, chave global e QR do próprio corpo", async () => {
  const { body, calls, writes } = await runAction("v2", "connect", (req, url) => {
    if (req.method === "POST" && url.pathname === `/instance/connect/${INSTANCE}`) {
      return json({ base64: "V2-QR-PNG", code: "2@v2", pairingCode: "2@v2-pair", count: 1 });
    }
    return null;
  });
  assertEquals(calls.length, 1, "connect v2 não pode cair em rota GO (/instance/qr, /instance/status)");
  assertEquals(calls[0].method, "POST");
  assertEquals(calls[0].path, `/instance/connect/${INSTANCE}`);
  assertEquals(calls[0].apikey, GLOBAL_KEY, "connect v2 autentica com a chave global");
  assertEquals(body.status, "qr_pending");
  assertEquals(body.qrcode, { base64: "V2-QR-PNG", code: "2@v2" });
  assertEquals(body.count, 1, "o corpo v2 é preservado na resposta");
  assertEquals(
    writes.find((w) => w.table === "whatsapp_connections")?.patch,
    { qr_code: "V2-QR-PNG", status: "qr_pending", instance_id: INSTANCE },
  );
});

Deno.test("R2-API-015 connect v2 com sessão já aberta responde connected e não grava QR", async () => {
  const { body, calls, writes } = await runAction("v2", "connect", (req, url) =>
    req.method === "POST" && url.pathname === `/instance/connect/${INSTANCE}`
      ? json({ instance: { instanceName: INSTANCE, state: "open" } })
      : null);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].path, `/instance/connect/${INSTANCE}`);
  assertEquals(body.status, "connected");
  assertEquals(body.qrcode, undefined, "sessão aberta não devolve QR");
  assertEquals(
    writes.find((w) => w.table === "whatsapp_connections")?.patch,
    { status: "connected", qr_code: null },
  );
});

Deno.test("R2-API-015 connect v2 sem QR e sem sessão aberta: erro explícito, sem gravar QR", async () => {
  const { body, calls, writes } = await runAction("v2", "connect", (req, url) =>
    req.method === "POST" && url.pathname === `/instance/connect/${INSTANCE}`
      ? json({ instance: { instanceName: INSTANCE, state: "connecting" } })
      : null);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].path, `/instance/connect/${INSTANCE}`);
  assertEquals(body.error, true, "sem QR e sem sessão aberta não pode responder sucesso");
  assertEquals(body.status, 409);
  assertEquals(writes.length, 0, "nenhuma escrita no banco quando o connect não abre sessão nem gera QR");
});

Deno.test("R2-API-015 connect v2 com HTTP de erro do provedor: error:true com a mensagem do v2", async () => {
  const { body, calls, writes } = await runAction("v2", "connect", (req, url) =>
    req.method === "POST" && url.pathname === `/instance/connect/${INSTANCE}`
      ? json({ message: "instance not found" }, 404)
      : null);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].path, `/instance/connect/${INSTANCE}`);
  assertEquals(body.error, true);
  assertEquals(body.status, 404);
  assertEquals(body.message, "instance not found");
  assertEquals(writes.length, 0, "connect recusado pelo provedor não escreve no banco");
});

// ─── status ───

Deno.test("R2-API-015 status GO: GET /instance/status (sem instância no path) com o token da instância", async () => {
  const { body, calls } = await runAction("go", "status", (req, url) =>
    req.method === "GET" && url.pathname === "/instance/status"
      ? json({ data: { LoggedIn: true, Connected: true } })
      : null);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "GET");
  assertEquals(calls[0].path, "/instance/status");
  assertEquals(calls[0].apikey, INSTANCE_TOKEN);
  assertEquals(body.status, "connected");
});

Deno.test("R2-API-015 status v2: GET /instance/connectionState/{instância} com a chave global", async () => {
  const { body, calls, writes } = await runAction("v2", "status", (req, url) =>
    req.method === "GET" && url.pathname === `/instance/connectionState/${INSTANCE}`
      ? json({ instance: { instanceName: INSTANCE, state: "open" } })
      : null);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "GET");
  assertEquals(calls[0].path, `/instance/connectionState/${INSTANCE}`);
  assertEquals(calls[0].apikey, GLOBAL_KEY, "status v2 autentica com a chave global");
  assertEquals(body.state, "open", "state do v2 normalizado no corpo da resposta");
  assertEquals(body.status, "connected");
  assertEquals(body.instance, { instanceName: INSTANCE, state: "open" }, "corpo v2 preservado");
  assertEquals(
    writes.find((w) => w.table === "whatsapp_connections")?.patch,
    { status: "connected", qr_code: null },
  );
});

Deno.test("R2-API-015 status v2 fechado: 'close' é disconnected e preserva quem está pareando", async () => {
  const { body, calls, writes } = await runAction("v2", "status", (req, url) =>
    req.method === "GET" && url.pathname === `/instance/connectionState/${INSTANCE}`
      ? json({ instance: { instanceName: INSTANCE, state: "close" } })
      : null);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].path, `/instance/connectionState/${INSTANCE}`);
  assertEquals(body.status, "disconnected");
  assertEquals(body.state, "close");
  assertEquals(
    writes.find((w) => w.table === "whatsapp_connections")?.patch,
    { status: "disconnected" },
    "sem qr_code no patch: o guard neq('status','qr_pending') protege o pareamento",
  );
});

// ─── disconnect ───

Deno.test("R2-API-015 disconnect GO: DELETE /instance/logout (sem instância no path) com o token da instância", async () => {
  const { body, calls, writes } = await runAction("go", "disconnect", (req, url) =>
    req.method === "DELETE" && url.pathname === "/instance/logout"
      ? json({ message: "success" })
      : null);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "DELETE");
  assertEquals(calls[0].path, "/instance/logout");
  assertEquals(calls[0].apikey, INSTANCE_TOKEN);
  assertEquals(body.error, undefined);
  assertEquals(writes.find((w) => w.table === "whatsapp_connections")?.patch, { status: "disconnected" });
});

Deno.test("R2-API-015 disconnect v2: DELETE /instance/logout/{instância} com a chave global", async () => {
  const { body, calls, writes } = await runAction("v2", "disconnect", (req, url) =>
    req.method === "DELETE" && url.pathname === `/instance/logout/${INSTANCE}`
      ? json({ message: "success" })
      : null);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "DELETE");
  assertEquals(calls[0].path, `/instance/logout/${INSTANCE}`);
  assertEquals(calls[0].apikey, GLOBAL_KEY, "disconnect v2 autentica com a chave global");
  assertEquals(body.error, undefined);
  assertEquals(writes.find((w) => w.table === "whatsapp_connections")?.patch, { status: "disconnected" });
});

// ─── pairing-code (pareamento por número) ───

Deno.test("R2-API-016: matriz do pareamento por número — go põe o phone no corpo; v2 na query", () => {
  const go = resolvePairingRoute("go", INSTANCE, "+55 (11) 98888-7777", "https://x/functions/v1/evolution-webhook");
  assertEquals(go.method, "POST");
  assertEquals(go.path, "/instance/connect");
  assertEquals(go.auth, "instance");
  assertEquals(go.body?.phone, "5511988887777", "número reduzido a dígitos (DDI+DDD+número)");
  assertEquals(go.body?.subscribe, ["ALL"]);
  assertEquals(go.body?.immediate, true);
  assertEquals(go.body?.webhookUrl, "https://x/functions/v1/evolution-webhook");
  assert(!go.path.includes(INSTANCE), "GO não leva a instância no path");

  const v2 = resolvePairingRoute("v2", INSTANCE, "+55 (11) 98888-7777");
  assertEquals(v2.method, "GET");
  assertEquals(v2.path, `/instance/connect/${INSTANCE}?number=5511988887777`);
  assertEquals(v2.auth, "global");
  assertEquals(v2.body, undefined, "v2 recebe o número na query, não no corpo");
});

Deno.test("R2-API-016: normalização e formatação do código por flavor", () => {
  assertEquals(pairingCodeFromResponse("v2", { pairingCode: "1A2B3C4D" }), "1A2B3C4D");
  assertEquals(pairingCodeFromResponse("v2", { code: "1A2B3C4D" }), "1A2B3C4D");
  assertEquals(pairingCodeFromResponse("go", { data: { code: "1A2B3C4D" } }), "1A2B3C4D");
  assertEquals(pairingCodeFromResponse("go", { data: { pairingCode: "1A2B3C4D" } }), "1A2B3C4D");
  assertEquals(pairingCodeFromResponse("go", { data: { code: "2@qr-payload" } }), null, "payload de QR ('2@') não é código de pareamento");
  assertEquals(pairingCodeFromResponse("go", { message: "success" }), null);
  assertEquals(pairingCodeFromResponse("go", null), null);

  assertEquals(formatPairingCode("12345678"), "1234-5678");
  assertEquals(formatPairingCode("abcd-efgh"), "ABCD-EFGH");
  assertEquals(formatPairingCode("ABCD EFGH"), "ABCD-EFGH");
  assertEquals(formatPairingCode(""), null);
  assertEquals(formatPairingCode(null), null);
});

Deno.test("R2-API-016: validade do código (provedor manda, senão 60s preso a 15–300)", () => {
  const now = 1_700_000_000_000;
  assertEquals(pairingValidity({ data: { expiresIn: 120 } }, now).expiresInSeconds, 120);
  assertEquals(pairingValidity({ expires_in: "45" }, now).expiresInSeconds, 45);
  assertEquals(pairingValidity({ data: { validity: 90_000 } }, now).expiresInSeconds, 90, "ms viram segundos");
  assertEquals(pairingValidity({}, now).expiresInSeconds, 60, "sem pista do provedor usa 60s");
  assertEquals(pairingValidity({ expiresIn: 5 }, now).expiresInSeconds, 15, "piso de 15s");
  assertEquals(pairingValidity({ expiresIn: 900 }, now).expiresInSeconds, 300, "teto de 300s");
  assertEquals(pairingValidity({}, now).expiresAt, new Date(now + 60_000).toISOString());
});

Deno.test("R2-API-016 pairing-code GO: POST /instance/connect com phone e token da instância", async () => {
  const { body, calls, writes } = await runAction("go", "pairing-code", (req, url) => {
    if (req.method === "POST" && url.pathname === "/instance/connect") {
      return json({ data: { code: "1A2B3C4D" } });
    }
    return null;
  }, { number: "5511988887777" });
  assertEquals(calls.length, 1, "código veio no corpo do connect: sem poll do QR");
  assertEquals(calls[0].method, "POST");
  assertEquals(calls[0].path, "/instance/connect");
  assertEquals(calls[0].apikey, INSTANCE_TOKEN, "GO autentica com o token DA instância");
  assertEquals(calls[0].body?.phone, "5511988887777");
  assertEquals(body.error, undefined);
  assertEquals(body.status, "qr_pending");
  assertEquals(body.pairingCode, "1A2B-3C4D");
  assertEquals(body.code, "1A2B-3C4D", "o front lê raw.pairingCode ?? raw.code");
  assertEquals(
    writes.find((w) => w.table === "whatsapp_connections")?.patch,
    { status: "qr_pending", instance_id: INSTANCE },
  );
});

Deno.test("R2-API-016 pairing-code GO: sem código no connect, lê /instance/qr (assíncrono)", async () => {
  const { body, calls } = await runAction("go", "pairing-code", (_req, url) => {
    if (url.pathname === "/instance/connect") return json({ message: "success" });
    if (url.pathname === "/instance/qr") return json({ data: { code: "9Z8Y7X6W" } });
    return null;
  }, { number: "5511988887777" });
  assertEquals(calls.length, 2, "connect + leitura do /instance/qr");
  assertEquals(calls[0].path, "/instance/connect");
  assertEquals(calls[1].method, "GET");
  assertEquals(calls[1].path, "/instance/qr");
  assertEquals(calls[1].apikey, INSTANCE_TOKEN);
  assertEquals(body.pairingCode, "9Z8Y-7X6W");
});

Deno.test("R2-API-016 pairing-code v2: GET /instance/connect/{instância}?number= com a chave global", async () => {
  const { body, calls, writes } = await runAction("v2", "pairing-code", (req, url) => {
    if (req.method === "GET" && url.pathname === `/instance/connect/${INSTANCE}` && url.searchParams.get("number") === "5511988887777") {
      return json({ pairingCode: "1A2B3C4D", count: 1, expiresIn: 240 });
    }
    return null;
  }, { number: "5511988887777" });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "GET");
  assertEquals(calls[0].path, `/instance/connect/${INSTANCE}`);
  assertEquals(calls[0].apikey, GLOBAL_KEY, "v2 autentica com a chave global");
  assertEquals(body.pairingCode, "1A2B-3C4D");
  assertEquals(body.count, 1, "o corpo do v2 é preservado");
  assertEquals(body.expiresInSeconds, 240, "validade vinda do provedor é repassada");
  assert(typeof body.expiresAt === "string" && body.expiresAt.length > 0, "expiresAt em ISO");
  assertEquals(writes.find((w) => w.table === "whatsapp_connections")?.patch, { status: "qr_pending", instance_id: INSTANCE });
});

Deno.test("R2-API-016 pairing-code sem número: 422 e nenhuma chamada ao provedor", async () => {
  const { body, calls, writes } = await runAction("go", "pairing-code", () => json({}));
  assertEquals(calls.length, 0, "sem número não bate no provedor");
  assertEquals(writes.length, 0);
  assertEquals(body.error, true);
  assertEquals(body.status, 422);
});

Deno.test("R2-API-016 pairing-code GO sem código (só QR '2@...'): erro explícito, sem gravar", async () => {
  const { body, calls, writes } = await runAction("go", "pairing-code", (_req, url) => {
    if (url.pathname === "/instance/connect") return json({ message: "success" });
    if (url.pathname === "/instance/qr") return json({ data: { code: "2@qr-payload", qrcode: "PNG" } });
    return null;
  }, { number: "5511988887777" });
  assertEquals(calls.length, 4, "connect + 3 tentativas de leitura do /instance/qr");
  assertEquals(body.error, true);
  assertEquals(body.status, 409);
  assertEquals(writes.length, 0, "sem código não escreve no banco");
});
