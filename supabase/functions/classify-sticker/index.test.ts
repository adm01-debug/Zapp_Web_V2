// t_6c69be32 — separação explícita do ramo USUÁRIO e do ramo SERVIÇO na
// preparação da imagem do classify-sticker.
//
// O que estes testes travam:
//   1. Ramo usuário: a identidade repassada ao helper de imagem é
//      `{ kind: 'user', bearerToken }` — o GET ao Storage vai com a anon key +
//      JWT do chamador (a policy de `storage.objects` decide), NUNCA com a
//      service role. Usuário não é promovido a serviço.
//   2. Ramo serviço (webhook interno): a identidade é `{ kind: 'service' }`
//      EXPLÍCITA — o GET ao Storage usa a service role do ambiente e o bucket
//      continua `whatsapp-media`.
//   3. Mídia privada negada pelo Storage (403) degrada para `outros` (200) SEM
//      nenhuma chamada ao provedor — e o registro em `ai_usage_logs` não vaza
//      o locator (path do objeto) nem o bearer token do chamador.
//   4. Identidade ausente ou inválida: 401 antes de qualquer download — a
//      função de download/storage não é chamada e o provedor não é tocado.
//
// Fronteira de I/O dublada: `globalThis.fetch` responde por host/path EXATOS
// (auth GoTrue, PostgREST/RPC, Storage, provedor de visão) e registra cada
// chamada para as asserções de "zero invocações". O handler testado é o REAL,
// capturado do `Deno.serve` na importação do módulo.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/classify-sticker/index.test.ts

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEq<T>(a: T, b: T, msg: string) {
  assert(a === b, `${msg} (esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)})`);
}

// ── fixture do cenário ──────────────────────────────────────────────────────
const BASE = "https://stub.supabase.co";
const BUCKET = "whatsapp-media";
const CAMINHO_PRIVADO = "alheia/segredo.webp";
const IMAGEM_PRIVADA = `${BASE}/storage/v1/object/public/${BUCKET}/${CAMINHO_PRIVADO}`;
const DOWNLOAD_PRIVADO = `${BASE}/storage/v1/object/${BUCKET}/${CAMINHO_PRIVADO}`;

const JWT_USUARIO = "jwt-do-usuario-de-teste";
const JWT_INVALIDO = "jwt-que-nao-existe";
const ANON_KEY = "anon-key-de-teste";
const SERVICE_ROLE = "service-role-de-teste";
const USER_ID = "30000000-0000-0000-0000-00000000000b";
const ENDPOINT_VISAO = "https://provedor-visao.teste/v1/chat/completions";

const ENV_OK = {
  SUPABASE_URL: BASE,
  SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
  TEST_VISION_KEY: "chave-visao-de-teste",
};
const ENV_KEYS = Object.keys(ENV_OK) as Array<keyof typeof ENV_OK>;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const PROVEDOR_VISAO = [{
  id: "visao-1",
  name: "Visao",
  provider_type: "openai_compatible",
  api_endpoint: ENDPOINT_VISAO,
  api_key_secret_name: "TEST_VISION_KEY",
  model: "modelo-visao",
  system_prompt: null,
  config: { capabilities: { modalities: ["vision"] } },
  is_active: true,
  is_default: false,
  use_for: ["tagging"],
}];

// ── espião de rede ──────────────────────────────────────────────────────────
interface Chamada {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

interface Espiao {
  chamadas: Chamada[];
  /** 'ok' serve a imagem; 'negada' responde 403 como a policy de storage.objects. */
  imagem: "ok" | "negada";
  restore: () => void;
}

function headersDe(init: RequestInit | undefined): Record<string, string> {
  const fonte = init?.headers;
  const out: Record<string, string> = {};
  if (!fonte) return out;
  if (fonte instanceof Headers) fonte.forEach((v, k) => out[k.toLowerCase()] = v);
  else if (Array.isArray(fonte)) for (const [k, v] of fonte) out[String(k).toLowerCase()] = String(v);
  else for (const [k, v] of Object.entries(fonte)) out[k.toLowerCase()] = String(v);
  return out;
}

function instalarEspiao(): Espiao {
  const espiao: Espiao = {
    chamadas: [],
    imagem: "ok",
    restore: () => { globalThis.fetch = original; },
  };
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = String(init?.method ?? "GET").toUpperCase();
    let body: unknown = null;
    if (typeof init?.body === "string") {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    espiao.chamadas.push({ url, method, headers: headersDe(init), body });

    const alvo = new URL(url);
    const json = (d: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(d), {
        status,
        headers: { "content-type": "application/json" },
      }));

    if (alvo.hostname !== "stub.supabase.co" && alvo.hostname !== "provedor-visao.teste") {
      return json({ error: "host_sem_stub" }, 599);
    }
    if (alvo.hostname === "provedor-visao.teste") {
      return json({
        model: "modelo-visao",
        choices: [{ message: { content: "riso" } }],
        usage: { prompt_tokens: 3, completion_tokens: 1 },
      });
    }
    if (alvo.pathname === "/auth/v1/user") {
      const auth = espiao.chamadas.at(-1)!.headers["authorization"] ?? "";
      if (auth === `Bearer ${JWT_USUARIO}`) {
        return json({ id: USER_ID, aud: "authenticated", role: "authenticated" });
      }
      return json({ message: "invalid JWT" }, 401);
    }
    if (alvo.pathname === "/rest/v1/ai_providers") return json(PROVEDOR_VISAO);
    if (alvo.pathname === "/rest/v1/profiles") return json([]);
    if (alvo.pathname === "/rest/v1/ai_usage_logs") {
      return method === "POST" ? json([], 201) : json([]);
    }
    if (alvo.pathname === "/rest/v1/rpc/ai_rate_limit_hit") return json(1);
    if (alvo.pathname === "/rest/v1/rpc/ai_budget_reserve") {
      return json([{ id: "reserva-1", allowed: true, used_tokens: 0, limit_tokens: 100000 }]);
    }
    if (alvo.pathname === "/rest/v1/rpc/ai_budget_settle"
      || alvo.pathname === "/rest/v1/rpc/ai_budget_release") return json(null);
    if (alvo.pathname.startsWith("/storage/v1/object/")) {
      if (espiao.imagem === "negada") return json({ error: "not_allowed" }, 403);
      return Promise.resolve(new Response(PNG, {
        status: 200,
        headers: { "content-type": "image/webp" },
      }));
    }
    return json({ error: "rota_sem_stub", path: alvo.pathname }, 599);
  }) as typeof fetch;
  return espiao;
}

const downloads = (e: Espiao) =>
  e.chamadas.filter((c) => c.url.includes("/storage/v1/object/") && c.method === "GET");
const provedorCalls = (e: Espiao) => e.chamadas.filter((c) => c.url.startsWith(ENDPOINT_VISAO));
const logsDeUso = (e: Espiao) =>
  e.chamadas.filter((c) => c.url === `${BASE}/rest/v1/ai_usage_logs` && c.method === "POST");

function comEnv(fn: () => Promise<void>): Promise<void> {
  const salvo = ENV_KEYS.map((k) => [k, Deno.env.get(k)] as const);
  for (const k of ENV_KEYS) Deno.env.set(k, ENV_OK[k]);
  return fn().finally(() => {
    for (const [k, v] of salvo) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  });
}

// ── handler real capturado do Deno.serve ────────────────────────────────────
type Handler = (req: Request) => Promise<Response>;
let moduloPromise: Promise<{ handler: Handler; exports: Record<string, unknown> }> | null = null;

function carregarModulo() {
  if (!moduloPromise) {
    moduloPromise = (async () => {
      const original = Deno.serve;
      const capturados: Handler[] = [];
      (Deno as unknown as { serve: unknown }).serve = (h: Handler) => {
        capturados.push(h);
      };
      try {
        const exports = (await import("./index.ts")) as unknown as Record<string, unknown>;
        assert(capturados.length === 1, "index.ts deveria registrar exatamente um handler via Deno.serve");
        return { handler: capturados[0], exports };
      } finally {
        (Deno as unknown as { serve: unknown }).serve = original;
      }
    })();
  }
  return moduloPromise;
}

function pedido(bearer: string | null, corpo: unknown = { image_url: IMAGEM_PRIVADA }): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (bearer !== null) headers["authorization"] = `Bearer ${bearer}`;
  return new Request("https://funcao.teste/classify-sticker", {
    method: "POST",
    headers,
    body: JSON.stringify(corpo),
  });
}

// ── (1) identidade repassada ao helper: objeto explícito, sem promover a serviço
Deno.test("t_6c69be32: identidade de usuário vira {kind:'user', bearerToken} — nunca service", async () => {
  const { exports } = await carregarModulo();
  const storageIdentityPara = exports["storageIdentityPara"];
  assert(
    typeof storageIdentityPara === "function",
    "index.ts deve exportar storageIdentityPara (ramos explícitos de identidade)",
  );
  const id = (storageIdentityPara as (i: unknown, b: string) => Record<string, unknown>)(
    { kind: "user", userId: USER_ID },
    JWT_USUARIO,
  );
  assertEq(id["kind"], "user", "o ramo de usuário declara kind 'user'");
  assertEq(id["bearerToken"], JWT_USUARIO, "o bearer do chamador é o que desce ao Storage");
  assert(!("serviceRoleKey" in id), "identidade de usuário não pode carregar service role");
});

Deno.test("t_6c69be32: identidade de serviço vira {kind:'service'} — sem bearer do chamador", async () => {
  const { exports } = await carregarModulo();
  const storageIdentityPara = exports["storageIdentityPara"];
  assert(typeof storageIdentityPara === "function", "index.ts deve exportar storageIdentityPara");
  const id = (storageIdentityPara as (i: unknown, b: string) => Record<string, unknown>)(
    { kind: "service", userId: null },
    JWT_USUARIO, // mesmo que um bearer chegue, o ramo service não o carrega
  );
  assertEq(JSON.stringify(id), JSON.stringify({ kind: "service" }), "o ramo de serviço é só {kind:'service'}");
});

// ── (2) usuário + item autorizado: fluxo completo, download sob o JWT dele ───
Deno.test("t_6c69be32: usuário + mídia autorizada → download com anon+JWT e 1 chamada ao provedor", async () => {
  await comEnv(async () => {
    const espiao = instalarEspiao();
    try {
      const { handler } = await carregarModulo();
      const res = await handler(pedido(JWT_USUARIO));
      assertEq(res.status, 200, "usuário autorizado deve receber 200");
      assertEq((await res.json() as { category: string }).category, "riso", "categoria veio do provedor");

      const gets = downloads(espiao);
      assertEq(gets.length, 1, "deve haver exatamente um download do Storage");
      assertEq(gets[0].url, DOWNLOAD_PRIVADO, "o download usa o endpoint autenticado do objeto");
      assertEq(gets[0].headers["apikey"], ANON_KEY, "ramo usuário: apikey é a anon key");
      assertEq(gets[0].headers["authorization"], `Bearer ${JWT_USUARIO}`, "ramo usuário: bearer do chamador");
      assert(gets[0].headers["apikey"] !== SERVICE_ROLE, "usuário NUNCA é promovido a service role");

      assertEq(provedorCalls(espiao).length, 1, "mídia autorizada segue ao provedor exatamente uma vez");
    } finally {
      espiao.restore();
    }
  });
});

// ── (3) serviço (webhook interno): service role explícita, whatsapp-media ────
Deno.test("t_6c69be32: service role (webhook) → download com service role explícita em whatsapp-media", async () => {
  await comEnv(async () => {
    const espiao = instalarEspiao();
    try {
      const { handler } = await carregarModulo();
      const res = await handler(pedido(SERVICE_ROLE));
      assertEq(res.status, 200, "webhook interno autenticado deve receber 200");

      const gets = downloads(espiao);
      assertEq(gets.length, 1, "deve haver exatamente um download do Storage");
      assert(gets[0].url.startsWith(`${BASE}/storage/v1/object/${BUCKET}/`),
        `o ramo serviço mantém a classificação de ${BUCKET}, veio: ${gets[0].url}`);
      assertEq(gets[0].headers["apikey"], SERVICE_ROLE, "ramo serviço: apikey é a service role");
      assertEq(gets[0].headers["authorization"], `Bearer ${SERVICE_ROLE}`, "ramo serviço: service role explícita");

      assertEq(provedorCalls(espiao).length, 1, "o fluxo de serviço também alimenta o provedor");
    } finally {
      espiao.restore();
    }
  });
});

// ── (4) mídia negada: degrada ANTES do provedor, log sem locator nem token ───
Deno.test("t_6c69be32: usuário + mídia privada negada → 'outros', 0 chamadas ao provedor, log sem vazar", async () => {
  await comEnv(async () => {
    const espiao = instalarEspiao();
    espiao.imagem = "negada";
    try {
      const { handler } = await carregarModulo();
      const res = await handler(pedido(JWT_USUARIO));
      assertEq(res.status, 200, "negação de mídia degrada para 200");
      assertEq((await res.json() as { category: string }).category, "outros", "mídia negada degrada para 'outros'");

      assertEq(downloads(espiao).length, 1, "houve a tentativa autenticada de download");
      assertEq(provedorCalls(espiao).length, 0, "mídia negada NUNCA alcança o provedor");

      const logs = logsDeUso(espiao);
      assert(logs.length >= 1, "a negação deve deixar registro de erro em ai_usage_logs");
      const linha = logs.find((l) => (l.body as Record<string, unknown>)?.["status"] === "error");
      assert(linha, "deve existir linha com status 'error' para a imagem negada");
      const serial = JSON.stringify(linha.body);
      assert(!serial.includes(CAMINHO_PRIVADO), `o log não pode vazar o locator do objeto: ${serial}`);
      assert(!serial.includes(JWT_USUARIO), `o log não pode vazar o bearer token: ${serial}`);
      assert(!serial.includes(SERVICE_ROLE), `o log não pode vazar a service role: ${serial}`);
    } finally {
      espiao.restore();
    }
  });
});

// ── (5) identidade ausente/inválida: nenhum download, nenhum provedor ────────
Deno.test("t_6c69be32: sem bearer → 401 e NENHUMA chamada de rede (download/provedor)", async () => {
  await comEnv(async () => {
    const espiao = instalarEspiao();
    try {
      const { handler } = await carregarModulo();
      const res = await handler(pedido(null));
      assertEq(res.status, 401, "pedido sem identidade deve ser 401");
      assertEq(espiao.chamadas.length, 0, `sem identidade não se toca a rede: ${JSON.stringify(espiao.chamadas.map((c) => c.url))}`);
    } finally {
      espiao.restore();
    }
  });
});

Deno.test("t_6c69be32: bearer inválido → 401, nenhum download de mídia e nenhum provedor", async () => {
  await comEnv(async () => {
    const espiao = instalarEspiao();
    try {
      const { handler } = await carregarModulo();
      const res = await handler(pedido(JWT_INVALIDO));
      assertEq(res.status, 401, "token inválido deve ser 401");
      assertEq(downloads(espiao).length, 0, "identidade inválida não pode baixar mídia");
      assertEq(provedorCalls(espiao).length, 0, "identidade inválida não pode gastar provedor");
    } finally {
      espiao.restore();
    }
  });
});
