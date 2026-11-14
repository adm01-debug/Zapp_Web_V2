// 14/11 — follow-up do #3045 (teto de 40 s no connect da GO). Verificação com
// relógio virtual achou três buracos:
//  1. o poll do QR da instância RECRIADA ignorava o prazo e dormia 4×1,5 s —
//     pior caso 46 s, acima dos 45 s em que o navegador desiste;
//  2. a recriação da sessão órfã podia APAGAR a instância e não ter prazo para
//     recriá-la (create estrangulado) → 503 "removida mas não recriada";
//  3. status, connect do v2 e a resposta `recovered` não passavam por
//     stripInstanceToken.
// Aqui o tempo é virtual: Date.now/setTimeout/AbortSignal.timeout são trocados
// e cada fetch falso avança o relógio pelo atraso simulado (ou pelo timeout do
// sinal, quando o atraso passa dele — como um TimeoutError real).
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleEvolutionApi } from "./index.ts";
import { resetInstanceTokenCache } from "../_shared/evolution-instance-token.ts";

/* eslint-disable @typescript-eslint/no-explicit-any -- mocks estruturais dos clients Supabase. */

const GO = "http://go.invalid";
const GLOBAL_KEY = "global-key-test";
const TOKEN = "instance-token-xyz";
const ECHO_TOKEN = "echoed-token-abc";
const BROWSER_TIMEOUT_MS = 45_000;
const HARD_DEADLINE_MS = 40_000;

let ipSeq = 0;
const nextIp = () => `10.14.11.${++ipSeq}`;

function makeQuery(data: any = null): any {
  const q: any = {};
  for (const k of ["select", "eq", "neq", "update", "insert", "delete", "order", "limit"]) q[k] = () => q;
  q.maybeSingle = () => Promise.resolve({ data, error: null });
  q.single = q.maybeSingle;
  q.then = (resolve: any) => resolve({ data: null, error: null });
  return q;
}

function makeService(): any {
  return {
    from: (t: string) => t === "whatsapp_connections" ? makeQuery({ id: "conn-1" }) : makeQuery(null),
    rpc: (fn: string) => Promise.resolve({ data: fn === "get_instance_token" ? TOKEN : null, error: null }),
  };
}

function makeCaller(rpcDelayMs = 0): any {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }) },
    rpc: (fn: string, args: Record<string, unknown>) => {
      // Checagem de papel lenta (banco): também consome o prazo do connect.
      vnow += rpcDelayMs;
      if (fn === "is_admin_or_supervisor") return Promise.resolve({ data: true, error: null });
      if (fn === "has_role") return Promise.resolve({ data: args?._role === "admin", error: null });
      return Promise.resolve({ data: false, error: null });
    },
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// ── relógio virtual ──
let vnow = 1_000_000_000_000;
const realNow = Date.now;
const realSetTimeout = globalThis.setTimeout;
const realAbortTimeout = AbortSignal.timeout;
function installClock() {
  Date.now = () => vnow;
  (globalThis as any).setTimeout = (fn: () => void, ms = 0) => {
    vnow += ms;
    Promise.resolve().then(fn);
    return 0;
  };
  (AbortSignal as any).timeout = (ms: number) => {
    const c = new AbortController();
    (c.signal as any).__ms = ms;
    return c.signal;
  };
}
function uninstallClock() {
  Date.now = realNow;
  (globalThis as any).setTimeout = realSetTimeout;
  (AbortSignal as any).timeout = realAbortTimeout;
}

type Step = { delay: number; resp?: () => Response };
type Handler = (url: string, n: number) => Step;
interface Call { url: string; at: number; timeout: number }

async function run(action: string, handler: Handler, opts: { flavor?: string; envToken?: string; rpcDelayMs?: number } = {}) {
  resetInstanceTokenCache();
  Deno.env.set("EVOLUTION_API_URL", GO);
  Deno.env.set("EVOLUTION_API_KEY", GLOBAL_KEY);
  Deno.env.set("SUPABASE_URL", "http://supabase.invalid");
  Deno.env.set("EVOLUTION_INSTANCE_NAME", "PRINCIPAL");
  if (opts.envToken) Deno.env.set("EVOLUTION_INSTANCE_TOKEN", opts.envToken);
  else Deno.env.delete("EVOLUTION_INSTANCE_TOKEN");
  if (opts.flavor) Deno.env.set("EVOLUTION_API_FLAVOR", opts.flavor);
  else Deno.env.delete("EVOLUTION_API_FLAVOR");
  const calls: Call[] = [];
  const counts: Record<string, number> = {};
  const originalFetch = globalThis.fetch;
  installClock();
  const t0 = vnow;
  globalThis.fetch = (async (input: Request | URL | string, init: RequestInit = {}) => {
    const raw = String(input).replace(GO, "");
    const url = raw.startsWith("/instance/delete") ? "/instance/delete" : raw;
    const timeout = (init.signal as any)?.__ms ?? Infinity;
    counts[url] = (counts[url] ?? 0) + 1;
    calls.push({ url, at: vnow - t0, timeout });
    const step = handler(url, counts[url]);
    if (step.delay > timeout) {
      vnow += timeout;
      throw new DOMException("signal timed out", "TimeoutError");
    }
    vnow += step.delay;
    return step.resp ? step.resp() : json(500, {});
  }) as typeof fetch;
  try {
    const req = new Request(`http://localhost/functions/v1/evolution-api/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test", "x-real-ip": nextIp() },
      body: JSON.stringify({ instanceName: "PRINCIPAL" }),
    });
    const res = await handleEvolutionApi(req, { supabase: makeService(), callerClient: makeCaller(opts.rpcDelayMs ?? 0) });
    const text = await res.text();
    return { text, body: JSON.parse(text), calls, total: vnow - t0 };
  } finally {
    globalThis.fetch = originalFetch;
    uninstallClock();
    Deno.env.delete("EVOLUTION_INSTANCE_TOKEN");
    Deno.env.delete("EVOLUTION_API_FLAVOR");
    resetInstanceTokenCache();
  }
}

const QR_OK = { message: "success", data: { qrcode: "data:image/png;base64,QUFB|https://wa.me/x", code: "" } };
const QR_EMPTY = { message: "success", data: { qrcode: "", code: "" } };
const DEAD = { data: { Connected: false, LoggedIn: false } };
const ALL = { message: "success", data: [{ id: "u-2", name: "PRINCIPAL", jid: "5511@s.whatsapp.net", token: TOKEN }] };
const count = (calls: Call[], url: string) => calls.filter((c) => c.url === url).length;

interface Delays { qr: number; all: number; del: number; create: number; connect2: number; qr2: number }

/** Sessão órfã: QR inicial vazio, status !LoggedIn; após o create, QR conforme `qr2Ok`. */
function orphanScenario(d: Delays, qr2Ok = false): Handler {
  let created = false;
  return (u) => {
    if (u === "/instance/connect") return { delay: created ? d.connect2 : 0, resp: () => json(200, { message: "success" }) };
    if (u === "/instance/qr") {
      return created
        ? { delay: d.qr2, resp: () => json(200, qr2Ok ? QR_OK : QR_EMPTY) }
        : { delay: d.qr, resp: () => json(200, QR_EMPTY) };
    }
    if (u === "/instance/status") return { delay: 0, resp: () => json(200, DEAD) };
    if (u === "/instance/all") return { delay: d.all, resp: () => json(200, ALL) };
    if (u === "/instance/delete") return { delay: d.del, resp: () => json(200, {}) };
    if (u === "/instance/create") {
      created = true;
      return { delay: d.create, resp: () => json(200, {}) };
    }
    return { delay: 0, resp: () => json(200, {}) };
  };
}

// ─── 1. teto de 40 s inclusive no poll do QR da instância recriada ────────

Deno.test("connect órfã: poll do QR da instância recriada respeita o teto (antes: 46 s)", async () => {
  // Cenário do verificador: all/delete/create lentos mas dentro do orçamento,
  // o QR recriado nunca vem — antes o laço dormia 4×1,5 s além do teto (46 s).
  const r = await run("connect", orphanScenario({ qr: 0, all: 7_900, del: 7_900, create: 9_900, connect2: 7_900, qr2: 7_900 }));
  assertEquals(count(r.calls, "/instance/create"), 1);
  assert(r.total <= HARD_DEADLINE_MS + 100, `total ${r.total} ms passou do teto de 40 s`);
  assert(r.total < BROWSER_TIMEOUT_MS, `total ${r.total} ms ≥ 45 s do navegador`);
});

Deno.test("connect órfã: varredura de atrasos — nunca passa de ~40 s e nunca apaga sem create completo", async () => {
  const D = [0, 500, 1_500, 3_500, 7_900, 9_900, 14_900, 60_000];
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const pick = () => D[Math.floor(rnd() * D.length)];
  let worst = 0;
  let recreations = 0;
  for (let i = 0; i < 600; i++) {
    const d: Delays = { qr: pick(), all: pick(), del: pick(), create: pick(), connect2: pick(), qr2: pick() };
    const r = await run("connect", orphanScenario(d, rnd() < 0.5));
    worst = Math.max(worst, r.total);
    assert(r.total <= HARD_DEADLINE_MS + 100, `total ${r.total} ms com ${JSON.stringify(d)}`);
    const del = r.calls.find((c) => c.url === "/instance/delete");
    if (del) {
      recreations++;
      const create = r.calls.find((c) => c.url === "/instance/create");
      // Se o DELETE saiu, o create (se o delete deu certo) recebe os 10 s inteiros.
      if (create) assertEquals(create.timeout, 10_000, `create estrangulado com ${JSON.stringify(d)}`);
      assert(HARD_DEADLINE_MS - del.at >= 20_000, `DELETE começou com ${HARD_DEADLINE_MS - del.at} ms restantes`);
    }
  }
  assert(worst < BROWSER_TIMEOUT_MS);
  assert(recreations > 0, "a varredura precisa exercitar a recriação");
});

// ─── 2. nunca apagar sem orçamento para recriar ───────────────────────────

Deno.test("connect órfã: borda do verificador (~21,5 s restantes) → go_unreachable sem listar nem apagar (antes: 503 destrutivo)", async () => {
  // QR inicial lento deixa ~21,5 s; antes: /instance/all 7,9 s + DELETE 7,9 s
  // ok + create estrangulado em 5,7 s → instância apagada e não recriada.
  const r = await run("connect", orphanScenario({ qr: 3_500, all: 7_900, del: 7_900, create: 9_900, connect2: 0, qr2: 0 }));
  assertEquals(r.body.code, "go_unreachable");
  assertEquals(count(r.calls, "/instance/all"), 0);
  assertEquals(count(r.calls, "/instance/delete"), 0);
  assertEquals(count(r.calls, "/instance/create"), 0);
  assert(!r.text.includes("removida"), r.text);
});

Deno.test("connect órfã: prazo some entre a listagem e o DELETE → rechecagem responde go_unreachable SEM apagar", async () => {
  // ~29 s restantes ao entrar na órfã (passa o orçamento de 28 s), checagem de
  // admin de 2 s + /instance/all de 7,9 s → ~19 s antes do DELETE (< 20 s).
  const r = await run("connect", orphanScenario({ qr: 1_600, all: 7_900, del: 0, create: 0, connect2: 0, qr2: 0 }), { rpcDelayMs: 2_000 });
  assertEquals(count(r.calls, "/instance/all"), 1);
  assertEquals(r.body.code, "go_unreachable");
  assertEquals(count(r.calls, "/instance/delete"), 0);
  assertEquals(count(r.calls, "/instance/create"), 0);
});

Deno.test("connect órfã: com prazo, DELETE lento ainda deixa os 10 s inteiros ao create e recupera", async () => {
  const r = await run("connect", orphanScenario({ qr: 0, all: 7_900, del: 7_900, create: 9_900, connect2: 0, qr2: 0 }, true));
  assertEquals(r.body.recovered, true);
  const create = r.calls.filter((c) => c.url === "/instance/create");
  assertEquals(create.length, 1);
  assertEquals(create[0].timeout, 10_000);
  assert(r.total <= HARD_DEADLINE_MS + 100, `total ${r.total}`);
});

// ─── 3. token da instância nunca sai nas respostas ───────────────────────

const TOKEN_FIELDS = { token: ECHO_TOKEN, Token: ECHO_TOKEN, apikey: ECHO_TOKEN, hash: ECHO_TOKEN };
const assertNoToken = (text: string) => {
  assert(!text.includes(ECHO_TOKEN), `token ecoado na resposta: ${text}`);
  assert(!text.includes(TOKEN), `token da instância na resposta: ${text}`);
};

Deno.test("status (GO): token ecoado pela GO não sai na resposta", async () => {
  const r = await run("status", () => ({
    delay: 0,
    resp: () => json(200, { ...TOKEN_FIELDS, data: { ...TOKEN_FIELDS, Connected: true, LoggedIn: true, instance: { token: ECHO_TOKEN } } }),
  }));
  assertEquals(r.body.status, "connected");
  assertNoToken(r.text);
});

Deno.test("status (v2): hash/token ecoados não saem na resposta", async () => {
  const r = await run("status", () => ({
    delay: 0,
    resp: () => json(200, { ...TOKEN_FIELDS, instance: { instanceName: "PRINCIPAL", state: "open", token: ECHO_TOKEN, hash: ECHO_TOKEN } }),
  }), { flavor: "v2" });
  assertEquals(r.body.status, "connected");
  assertNoToken(r.text);
});

Deno.test("connect (v2): QR no corpo com hash/token ecoados → só o QR sai", async () => {
  const r = await run("connect", () => ({
    delay: 0,
    resp: () => json(200, { ...TOKEN_FIELDS, base64: "data:image/png;base64,QUFB", code: "2@x", instance: { token: ECHO_TOKEN } }),
  }), { flavor: "v2", envToken: "env-token" });
  assertEquals(r.body.status, "qr_pending");
  assertNoToken(r.text);
  assert(!r.text.includes("env-token"));
});

Deno.test("connect (v2): sessão aberta com hash/token ecoados → connected sem token", async () => {
  const r = await run("connect", () => ({
    delay: 0,
    resp: () => json(200, { ...TOKEN_FIELDS, instance: { instanceName: "PRINCIPAL", state: "open", token: ECHO_TOKEN } }),
  }), { flavor: "v2", envToken: "env-token" });
  assertEquals(r.body.status, "connected");
  assertNoToken(r.text);
});

Deno.test("connect órfã recuperada (recovered) não carrega token", async () => {
  const r = await run("connect", orphanScenario({ qr: 0, all: 0, del: 0, create: 0, connect2: 0, qr2: 0 }, true));
  assertEquals(r.body.recovered, true);
  assertNoToken(r.text);
});
