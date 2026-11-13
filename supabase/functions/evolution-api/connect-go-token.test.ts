// 13/11 — QR quebrado em produção: POST evolution-api/connect respondia HTTP
// 500 genérico. Causa: fetch do fluxo GO sem proteção — AbortSignal.timeout
// (TimeoutError) e erro de rede (TypeError) subiam até o catch-all. Estes
// testes simulam as respostas da Evolution GO com fetch falso (sem rede) e
// provam que TODA falha sai como 200 + { error: true, code, message } em PT-BR,
// que o connect se auto-repara num 401 buscando a chave na GO (GET
// /instance/all com a chave global) e que a ação admin sync-instance-token
// grava no Vault sem nunca devolver o token.
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleEvolutionApi } from "./index.ts";
import { resetInstanceTokenCache } from "../_shared/evolution-instance-token.ts";
import { lookupGoInstanceToken, safeFetch } from "../_shared/evolution-go-token-sync.ts";

/* eslint-disable @typescript-eslint/no-explicit-any -- mocks estruturais dos clients Supabase. */

const GO = "http://go.invalid";
const GLOBAL_KEY = "global-key-test";
const OLD_TOKEN = "old-instance-token-xyz";
const NEW_TOKEN = "new-instance-token-abc";

let ipSeq = 0;
const nextIp = () => `10.13.11.${++ipSeq}`;

function makeQuery(data: any = null): any {
  const q: any = {};
  for (const k of ["select", "eq", "neq", "update", "insert", "delete", "order", "limit"]) q[k] = () => q;
  q.maybeSingle = () => Promise.resolve({ data, error: null });
  q.single = q.maybeSingle;
  q.then = (resolve: any) => resolve({ data: null, error: null });
  return q;
}

interface ServiceState { vaultToken: string | null; setCalls: Array<Record<string, unknown>>; connection: boolean }

function makeService(state: ServiceState): any {
  return {
    from: (table: string) => table === "whatsapp_connections" && state.connection ? makeQuery({ id: "conn-1" }) : makeQuery(null),
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === "get_instance_token") return Promise.resolve({ data: state.vaultToken, error: null });
      if (fn === "set_instance_token") {
        state.setCalls.push(args);
        state.vaultToken = String(args.p_token);
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}

function makeCaller(isAdmin = true): any {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "admin-1" } }, error: null }) },
    rpc: (fn: string) => Promise.resolve({ data: fn === "is_admin_or_supervisor" ? isAdmin : false, error: null }),
  };
}

type Handler = (url: string, init: RequestInit) => Promise<Response> | Response;
interface Call { url: string; method: string; apikey: string }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const QR_OK = { message: "success", data: { qrcode: "data:image/png;base64,QUFB|https://wa.me/x", code: "" } };

async function run(
  action: string,
  handler: Handler,
  opts: { vaultToken?: string | null; envToken?: string | null; isAdmin?: boolean; connection?: boolean; flavor?: string } = {},
) {
  resetInstanceTokenCache();
  Deno.env.set("EVOLUTION_API_URL", GO);
  Deno.env.set("EVOLUTION_API_KEY", GLOBAL_KEY);
  Deno.env.set("SUPABASE_URL", "http://supabase.invalid");
  Deno.env.set("EVOLUTION_INSTANCE_NAME", "PRINCIPAL");
  if (opts.envToken) Deno.env.set("EVOLUTION_INSTANCE_TOKEN", opts.envToken);
  else Deno.env.delete("EVOLUTION_INSTANCE_TOKEN");
  if (opts.flavor) Deno.env.set("EVOLUTION_API_FLAVOR", opts.flavor);
  else Deno.env.delete("EVOLUTION_API_FLAVOR");

  const state: ServiceState = { vaultToken: opts.vaultToken ?? null, setCalls: [], connection: opts.connection ?? true };
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: Request | URL | string, init: RequestInit = {}) => {
    const url = String(input);
    const headers = new Headers(init.headers);
    calls.push({ url: url.replace(GO, ""), method: init.method ?? "GET", apikey: headers.get("apikey") ?? "" });
    return await handler(url.replace(GO, ""), init);
  }) as typeof fetch;
  try {
    const req = new Request(`http://localhost/functions/v1/evolution-api/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test", "x-real-ip": nextIp() },
      body: JSON.stringify({ instanceName: "PRINCIPAL" }),
    });
    const res = await handleEvolutionApi(req, { supabase: makeService(state), callerClient: makeCaller(opts.isAdmin ?? true) });
    const text = await res.text();
    return { status: res.status, text, body: JSON.parse(text), calls, state };
  } finally {
    globalThis.fetch = original;
    Deno.env.delete("EVOLUTION_INSTANCE_TOKEN");
    Deno.env.delete("EVOLUTION_API_FLAVOR");
    resetInstanceTokenCache();
  }
}

const goAll = (instances: unknown[]) => json(200, { message: "success", data: instances });

// ─── connect: nenhuma falha da GO vira HTTP 500 ───────────────────────────

Deno.test("connect: erro de rede/DNS na GO → 200 + go_unreachable (antes: 500 do catch-all)", async () => {
  const r = await run("connect", () => { throw new TypeError("error sending request: dns error"); }, { vaultToken: OLD_TOKEN });
  assertEquals(r.status, 200);
  assertEquals(r.body.error, true);
  assertEquals(r.body.code, "go_unreachable");
  assertEquals(r.body.status, 502);
});

Deno.test("connect: tempo esgotado no /instance/connect → 200 + go_unreachable 504", async () => {
  const r = await run("connect", () => { throw new DOMException("signal timed out", "TimeoutError"); }, { vaultToken: OLD_TOKEN });
  assertEquals(r.status, 200);
  assertEquals(r.body.code, "go_unreachable");
  assertEquals(r.body.status, 504);
  assert(String(r.body.message).includes("não respondeu a tempo"));
});

Deno.test("connect: /instance/qr estoura o tempo (GO dorme 3 s no GetQr) → não lança; segue para o status", async () => {
  const r = await run("connect", (url) => {
    if (url === "/instance/connect") return json(200, { message: "success" });
    if (url === "/instance/qr") throw new DOMException("signal timed out", "TimeoutError");
    if (url === "/instance/status") return json(200, { data: { Connected: false, LoggedIn: true } });
    return json(500, {});
  }, { vaultToken: OLD_TOKEN });
  assertEquals(r.status, 200);
  assertEquals(r.body.status, "connecting");
});

Deno.test("connect: corpo não-JSON (502 HTML do proxy reverso) → 200 + go_error", async () => {
  const r = await run("connect", () => new Response("<html>Bad Gateway</html>", { status: 502 }), { vaultToken: OLD_TOKEN });
  assertEquals(r.status, 200);
  assertEquals(r.body.code, "go_error");
  assertEquals(r.body.status, 502);
});

Deno.test("connect: 404 da GO → instance_not_found em PT-BR", async () => {
  const r = await run("connect", () => json(404, { error: "instance not found" }), { vaultToken: OLD_TOKEN });
  assertEquals(r.status, 200);
  assertEquals(r.body.code, "instance_not_found");
});

Deno.test("connect: 401 no /instance/qr → instance_token_invalid (sem cair no 'sessão órfã')", async () => {
  const r = await run("connect", (url) => {
    if (url === "/instance/connect") return json(200, { message: "success" });
    return json(401, { error: "not authorized" });
  }, { vaultToken: OLD_TOKEN });
  assertEquals(r.status, 200);
  assertEquals(r.body.code, "instance_token_invalid");
  assert(String(r.body.message).includes("Sincronizar credencial"));
  assert(!r.calls.some((c) => c.url.startsWith("/instance/delete")), "401 nunca pode disparar recriação");
});

// ─── connect: auto-reparo (o sistema busca a chave sozinho) ───────────────

Deno.test("connect: 401 → busca a chave na GO (chave global), grava no Vault e repete o connect UMA vez", async () => {
  const r = await run("connect", (url, init) => {
    const key = new Headers(init.headers).get("apikey");
    if (url === "/instance/all") return goAll([{ id: "u-1", name: "OUTRA", token: "nao-usar" }, { id: "u-2", name: "PRINCIPAL", token: NEW_TOKEN }]);
    if (key !== NEW_TOKEN) return json(401, { error: "not authorized" });
    if (url === "/instance/connect") return json(200, { message: "success" });
    if (url === "/instance/qr") return json(200, QR_OK);
    return json(500, {});
  }, { envToken: OLD_TOKEN });
  assertEquals(r.status, 200);
  assertEquals(r.body.status, "qr_pending");
  assertEquals(r.state.setCalls, [{ p_connection_id: "conn-1", p_token: NEW_TOKEN }]);
  const all = r.calls.filter((c) => c.url === "/instance/all");
  assertEquals(all.length, 1);
  assertEquals(all[0].apikey, GLOBAL_KEY, "listagem admin usa a chave GLOBAL");
  const connects = r.calls.filter((c) => c.url === "/instance/connect");
  assertEquals(connects.map((c) => c.apikey), [OLD_TOKEN, NEW_TOKEN]);
  assert(!r.text.includes(NEW_TOKEN) && !r.text.includes(OLD_TOKEN), "token nunca volta na resposta");
});

Deno.test("connect: sem token nenhum (Vault vazio, sem env) → busca na GO antes do connect", async () => {
  const r = await run("connect", (url) => {
    if (url === "/instance/all") return goAll([{ id: "u-2", name: "PRINCIPAL", token: NEW_TOKEN }]);
    if (url === "/instance/connect") return json(200, { message: "success" });
    if (url === "/instance/qr") return json(200, QR_OK);
    return json(500, {});
  });
  assertEquals(r.body.status, "qr_pending");
  assertEquals(r.state.setCalls.length, 1);
  assertEquals(r.calls.find((c) => c.url === "/instance/connect")?.apikey, NEW_TOKEN);
});

Deno.test("connect: 401 e a chave global também é recusada → mensagem clara, sem segunda tentativa", async () => {
  const r = await run("connect", () => json(401, { error: "not authorized" }), { vaultToken: OLD_TOKEN });
  assertEquals(r.status, 200);
  assertEquals(r.body.code, "instance_token_invalid");
  assert(String(r.body.message).includes("EVOLUTION_API_KEY"));
  assertEquals(r.calls.filter((c) => c.url === "/instance/connect").length, 1);
  assertEquals(r.state.setCalls.length, 0);
});

Deno.test("connect: 401 e a instância não existe na GO → avisa, NÃO recria", async () => {
  const r = await run("connect", (url) => url === "/instance/all"
    ? goAll([{ id: "u-1", name: "OUTRA", token: "x" }])
    : json(401, { error: "not authorized" }), { vaultToken: OLD_TOKEN });
  assertEquals(r.body.code, "instance_token_invalid");
  assert(String(r.body.message).includes("não existe no servidor WhatsApp"));
  assert(!r.calls.some((c) => c.url === "/instance/create"), "nunca recriar sem aprovação do dono");
});

Deno.test("connect: 401 mas a GO lista a MESMA chave → não repete; explica", async () => {
  const r = await run("connect", (url) => url === "/instance/all"
    ? goAll([{ id: "u-2", name: "PRINCIPAL", token: OLD_TOKEN }])
    : json(401, { error: "not authorized" }), { vaultToken: OLD_TOKEN });
  assertEquals(r.body.code, "instance_token_invalid");
  assert(String(r.body.message).includes("mesma chave"));
  assertEquals(r.calls.filter((c) => c.url === "/instance/connect").length, 1);
});

// ─── status (polling do diálogo) ──────────────────────────────────────────

Deno.test("status: erro de rede → 200 + go_unreachable (antes: 500)", async () => {
  const r = await run("status", () => { throw new TypeError("connection refused"); }, { vaultToken: OLD_TOKEN });
  assertEquals(r.status, 200);
  assertEquals(r.body.code, "go_unreachable");
});

// ─── sync-instance-token (ação admin) ─────────────────────────────────────

Deno.test("sync-instance-token: admin grava a chave da GO no Vault e não ecoa o token", async () => {
  const r = await run("sync-instance-token", (url) => url === "/instance/all"
    ? goAll([{ id: "u-2", name: "PRINCIPAL", token: NEW_TOKEN }])
    : json(500, {}), { envToken: OLD_TOKEN });
  assertEquals(r.status, 200);
  assertEquals(r.body.ok, true);
  assertEquals(r.body.changed, true);
  assertEquals(r.state.setCalls, [{ p_connection_id: "conn-1", p_token: NEW_TOKEN }]);
  assert(!r.text.includes(NEW_TOKEN), "token nunca volta na resposta");
});

Deno.test("sync-instance-token: sem papel admin/supervisor → 403 e nenhuma chamada à GO", async () => {
  const r = await run("sync-instance-token", () => goAll([]), { isAdmin: false });
  assertEquals(r.status, 403);
  assertEquals(r.calls.length, 0);
});

Deno.test("sync-instance-token: instância inexistente na GO → instance_not_found, nada gravado", async () => {
  const r = await run("sync-instance-token", () => goAll([]), {});
  assertEquals(r.body.error, true);
  assertEquals(r.body.code, "instance_not_found");
  assertEquals(r.state.setCalls.length, 0);
});

Deno.test("sync-instance-token: conexão inexistente no app → connection_not_found, sem chamar a GO", async () => {
  const r = await run("sync-instance-token", () => goAll([]), { connection: false });
  assertEquals(r.body.code, "connection_not_found");
  assertEquals(r.calls.length, 0);
});

Deno.test("sync-instance-token: Evolution v2 → notSupported", async () => {
  const r = await run("sync-instance-token", () => goAll([]), { flavor: "v2" });
  assertEquals(r.body.notSupported, true);
  assertEquals(r.calls.length, 0);
});

// ─── módulo puro ──────────────────────────────────────────────────────────

Deno.test("lookupGoInstanceToken: casa o nome EXATO (nunca prefixo) e aceita Name/Token", async () => {
  const f = (() => Promise.resolve(goAll([
    { name: "PRINCIPAL_2", token: "errado" },
    { Name: "PRINCIPAL", Token: NEW_TOKEN },
  ]))) as unknown as typeof fetch;
  const r = await lookupGoInstanceToken(GO, GLOBAL_KEY, "PRINCIPAL", f);
  assertEquals(r, { ok: true, token: NEW_TOKEN });
});

Deno.test("lookupGoInstanceToken: corpo fora do formato → unexpected_response", async () => {
  const f = (() => Promise.resolve(new Response("ok", { status: 200 }))) as unknown as typeof fetch;
  const r = await lookupGoInstanceToken(GO, GLOBAL_KEY, "PRINCIPAL", f);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.code, "unexpected_response");
});

Deno.test("safeFetch: timeout real não lança", async () => {
  const slow = ((_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => {
    init.signal?.addEventListener("abort", () => rej(init.signal?.reason));
  })) as unknown as typeof fetch;
  const r = await safeFetch("http://x.invalid", {}, 20, slow);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.kind, "timeout");
});
