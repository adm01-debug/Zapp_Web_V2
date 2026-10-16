// R2-INF-022 (t_f1da4967) — classify-emoji: a leitura do Storage PRIVADO fica
// vinculada à identidade de usuário já validada por `requireAiIdentity`.
//
// O que se prova aqui, com o handler REAL e só as fronteiras de I/O dubladas
// (mesmo padrão de `multiplix-voices/index.test.ts`):
//
//   1. usuário válido + imagem privada ALHEIA: o GET do Storage sai com
//      `apikey` = anon key e `Authorization` = Bearer <JWT do chamador> (a
//      policy de `storage.objects` é quem decide — aqui o Storage devolve 403),
//      o handler responde `{ category: 'outros' }` (HTTP 200), registra o motivo
//      em `ai_usage_logs` (metadata.reason = 'image_input_failed') e NUNCA chama
//      o provedor (0 POST ao provedor, 0 leitura de `ai_providers` — o
//      `generateWithRouting` nem chega a rodar);
//   2. imagem AUTORIZADA: o helper devolve a data URL e ela chega ao provedor de
//      visão EMBUTIDA no multipart (`data:image/png;base64,...`, nunca a URL crua);
//   3. identidade INVÁLIDA: `requireAiIdentity` devolve a negação (401) e NADA é
//      baixado — zero GET no Storage, zero POST ao provedor. E o endpoint segue
//      recusando service role (403) sem tocar a rede.
//
// A função não exporta o handler: `Deno.serve` é trocado por um dublê ANTES do
// import para capturá-lo, e `globalThis.fetch` é o espião que serve GoTrue,
// PostgREST, Storage e provedor. Nenhum segredo nem dado real: tudo sintético.
// Cota compartilhada e orçamento (RPCs) falham com erro de infraestrutura — o
// desenho delas é falha ABERTA e não é o que está em prova aqui.
//
// NOTA para o ratchet `tests/contracts/_adv_edge_legacy_producers.test.ts`: este
// arquivo conta como +1 `.ts` em `supabase/functions` (sem produtor de
// vocabulário legado).
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/classify-emoji/index.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";

type Handler = (req: Request) => Promise<Response>;

// ─── captura do handler (a função registra via Deno.serve, não exporta) ────────

const DenoMutavel = Deno as unknown as { serve: (h: Handler) => unknown };
let handlerRegistrado: Handler | null = null;

async function handlerDaFuncao(): Promise<Handler> {
  if (handlerRegistrado) return handlerRegistrado;
  const original = DenoMutavel.serve;
  DenoMutavel.serve = (h) => {
    handlerRegistrado = h;
  };
  try {
    await import("./index.ts");
  } finally {
    DenoMutavel.serve = original;
  }
  if (!handlerRegistrado) {
    throw new Error("index.ts nao registrou handler via Deno.serve — o bootstrap mudou?");
  }
  return handlerRegistrado;
}

// ─── cenário sintético ───────────────────────────────────────────────────────

const SUPABASE = "https://stub.supabase.co";
const BUCKET = "whatsapp-media";
const CAMINHO = "emojis/feliz.png";
/** URL que o app manda (pública); o helper baixa pelo endpoint autenticado. */
const URL_PUBLICA = `${SUPABASE}/storage/v1/object/public/${BUCKET}/${CAMINHO}`;
const URL_DOWNLOAD = `${SUPABASE}/storage/v1/object/${BUCKET}/${CAMINHO}`;

const JWT_USUARIO = "jwt-usuario-sintetico";
const USER_ID = "11111111-2222-4333-8444-555555555555";
const ANON_KEY = "anon-key-sintetica";
const SERVICE_KEY = "service-role-sintetica-1234567890";
const PROVIDER_ENDPOINT = "https://provedor-visao.test/v1/chat/completions";
const PROVIDER_SECRET_NAME = "CHAVE_VISAO_TESTE";
const MODELO_VISAO = "modelo-visao-teste";

/** PNG mínimo (conteúdo irrelevante: o base64 é o que importa). */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const DATA_URL_ESPERADA =
  `data:image/png;base64,${btoa(String.fromCharCode(...PNG_BYTES))}`;

/** Linha de `ai_providers`: o ÚNICO provedor ativo que declara visão. */
const PROVEDOR_VISAO = {
  id: "00000000-0000-4000-8000-0000000000aa",
  name: "Visao de Teste",
  provider_type: "openai_compatible",
  api_endpoint: PROVIDER_ENDPOINT,
  api_key_secret_name: PROVIDER_SECRET_NAME,
  model: MODELO_VISAO,
  system_prompt: null,
  config: { capabilities: { modalities: ["vision"] } },
  is_active: true,
  is_default: false,
  use_for: ["tagging"],
};

// ─── espião de fetch ─────────────────────────────────────────────────────────

interface Chamada {
  url: string;
  metodo: string;
  headers: Record<string, string>;
  corpo: unknown;
}

interface Rotas {
  /** Resposta do GoTrue (`/auth/v1/user`). */
  auth: () => Response;
  /** Resposta do GET autenticado do Storage (`/storage/v1/object/...`). */
  storage?: () => Response;
  /** Resposta do POST ao provedor de visão. */
  provedor?: () => Response;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const respostaAuthOk = () => json({ id: USER_ID, aud: "authenticated" });
const respostaAuthInvalida = () => json({ message: "invalid JWT" }, 401);
const respostaStorageOk = () =>
  new Response(PNG_BYTES, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "content-length": String(PNG_BYTES.byteLength),
    },
  });
const respostaProvedorOk = () =>
  json({
    model: MODELO_VISAO,
    choices: [{ message: { content: "riso" } }],
    usage: { prompt_tokens: 7, completion_tokens: 2 },
  });

function normalizarHeaders(fonte: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fonte) return out;
  if (fonte instanceof Headers) {
    fonte.forEach((valor, chave) => {
      out[chave.toLowerCase()] = valor;
    });
  } else if (Array.isArray(fonte)) {
    for (const [chave, valor] of fonte) out[String(chave).toLowerCase()] = String(valor);
  } else {
    for (const [chave, valor] of Object.entries(fonte as Record<string, unknown>)) {
      out[chave.toLowerCase()] = String(valor);
    }
  }
  return out;
}

/**
 * Troca `globalThis.fetch` por um espião que roteia por URL. Qualquer chamada
 * sem rota declarada volta 599 e fica registrada — o teste falha em vez de
 * deixar uma fronteira nova passar em silêncio.
 */
function withFetch(rotas: Rotas) {
  const original = globalThis.fetch;
  const calls: Chamada[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    const metodo = String(
      init?.method ?? (input instanceof Request ? input.method : "GET"),
    ).toUpperCase();
    let corpo: unknown = null;
    if (init?.body != null && typeof init.body === "string") {
      try {
        corpo = JSON.parse(init.body);
      } catch {
        corpo = init.body;
      }
    }
    calls.push({
      url,
      metodo,
      headers: normalizarHeaders(init?.headers ?? (input instanceof Request ? input.headers : null)),
      corpo,
    });

    // GoTrue: identidade do chamador.
    if (url.includes("/auth/v1/user")) return Promise.resolve(rotas.auth());

    // RPCs de cota compartilhada (`ai_rate_limit_hit`) e orçamento
    // (`ai_budget_reserve`): erro de infraestrutura → ambas falham ABERTO por
    // desenho (ai-guards.ts / ai-budget.ts), então a execução segue.
    if (url.includes("/rest/v1/rpc/")) {
      return Promise.resolve(
        json({ code: "PGRST000", message: "rpc indisponivel no stub" }, 400),
      );
    }

    // Cota diária: HEAD em `ai_usage_logs` com count=exact → 0 linhas hoje.
    if (url.includes("/rest/v1/ai_usage_logs") && metodo !== "POST") {
      return Promise.resolve(
        new Response(null, { status: 200, headers: { "content-range": "*/0" } }),
      );
    }

    // Insert do registrador de consumo (`logAiUsage`).
    if (url.includes("/rest/v1/ai_usage_logs") && metodo === "POST") {
      return Promise.resolve(json({}, 201));
    }

    // `resolveProfileId` do registrador (maybeSingle: um objeto ou nada).
    if (url.includes("/rest/v1/profiles")) {
      return Promise.resolve(json({ id: "perfil-sintetico" }));
    }

    // Catálogo de provedores (`generateWithRouting` → loadProviders).
    if (url.includes("/rest/v1/ai_providers")) {
      return Promise.resolve(json([PROVEDOR_VISAO]));
    }

    // Download autenticado do objeto privado — desfecho controlado pelo caso.
    if (url.includes("/storage/v1/object/")) {
      const responder = rotas.storage ??
        (() => new Response("sem stub de storage", { status: 599 }));
      return Promise.resolve(responder());
    }

    // Provedor de visão — desfecho controlado pelo caso.
    if (url.startsWith("https://provedor-visao.test/")) {
      const responder = rotas.provedor ??
        (() => new Response("sem stub de provedor", { status: 599 }));
      return Promise.resolve(responder());
    }

    return Promise.resolve(new Response("nao stubado", { status: 599 }));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

// ─── env sintética (salva e restaura, mesmo padrão de multiplix-voices) ────────

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  PROVIDER_SECRET_NAME,
] as const;

async function withEnv<T>(fn: () => Promise<T>): Promise<T> {
  const saved = ENV_KEYS.map((k) => [k, Deno.env.get(k)] as const);
  Deno.env.set("SUPABASE_URL", SUPABASE);
  Deno.env.set("SUPABASE_ANON_KEY", ANON_KEY);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  Deno.env.set(PROVIDER_SECRET_NAME, "segredo-de-provedor-sintetico");
  try {
    return await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

// ─── pedido e filtros de chamada ─────────────────────────────────────────────

function pedido(authorization = `Bearer ${JWT_USUARIO}`): Request {
  return new Request("https://stub.supabase.co/functions/v1/classify-emoji", {
    method: "POST",
    headers: { "content-type": "application/json", authorization },
    body: JSON.stringify({ image_url: URL_PUBLICA, file_name: "feliz.png" }),
  });
}

/** GETs no endpoint autenticado do Storage (o download da imagem). */
const downloadsDoStorage = (calls: Chamada[]) =>
  calls.filter((c) => c.metodo === "GET" && c.url.includes("/storage/v1/object/"));

/** POSTs ao provedor de IA. */
const chamadasAoProvedor = (calls: Chamada[]) =>
  calls.filter((c) => c.url.startsWith("https://provedor-visao.test/"));

/** Inserts do registrador em `ai_usage_logs`. */
const insertsDeLog = (calls: Chamada[]) =>
  calls.filter((c) => c.metodo === "POST" && c.url.includes("/rest/v1/ai_usage_logs"));

/** O insert do PostgREST viaja como objeto solto ou array de 1 linha. */
function linhasDoInsert(call: Chamada): Array<Record<string, unknown>> {
  const corpo = call.corpo;
  const lista = Array.isArray(corpo) ? corpo : [corpo];
  return lista.filter((l): l is Record<string, unknown> =>
    typeof l === "object" && l !== null
  );
}

// ─── (1) imagem ALHEIA: Storage nega → 'outros', motivo registrado, 0 provedor ─

Deno.test("R2-INF-022: imagem privada alheia (Storage 403) degrada para 'outros' SEM chamar o provedor", async () => {
  await withEnv(async () => {
    const stub = withFetch({
      auth: respostaAuthOk,
      // A policy de storage.objects nega: o objeto não é do chamador.
      storage: () => new Response("proibido", { status: 403 }),
    });
    try {
      const handler = await handlerDaFuncao();
      const res = await handler(pedido());

      assertEquals(res.status, 200);
      assertEquals(await res.json(), { category: "outros" });

      // O download foi TENTADO sob a identidade do usuário — anon key + JWT do
      // chamador, nunca a service role (é a policy do Storage que nega).
      const downloads = downloadsDoStorage(stub.calls);
      assertEquals(downloads.length, 1);
      assertEquals(downloads[0].url, URL_DOWNLOAD);
      assertEquals(downloads[0].headers["apikey"], ANON_KEY);
      assertEquals(downloads[0].headers["authorization"], `Bearer ${JWT_USUARIO}`);
      assert(downloads[0].headers["authorization"] !== `Bearer ${SERVICE_KEY}`);

      // NENHUMA chamada ao provedor e nem leitura de `ai_providers`: a URL de
      // objeto não visível falha ANTES do `generateWithRouting`.
      assertEquals(chamadasAoProvedor(stub.calls).length, 0);
      assert(
        stub.calls.every((c) => !c.url.includes("/rest/v1/ai_providers")),
        "generateWithRouting rodou (leu ai_providers) mesmo com a imagem negada",
      );

      // A degradação foi registrada com o motivo, sem vazar locator nem token.
      const linhas = insertsDeLog(stub.calls).flatMap(linhasDoInsert);
      const registro = linhas.find(
        (l) => (l.metadata as Record<string, unknown> | undefined)?.reason === "image_input_failed",
      );
      assert(registro, "nenhum insert de log com reason='image_input_failed'");
      assertEquals(registro.status, "error");
      assertEquals(
        (registro.metadata as Record<string, unknown>).image_error_code,
        "IMAGE_DOWNLOAD_FAILED",
      );
      const trilha = JSON.stringify(registro);
      assert(!trilha.includes(JWT_USUARIO), "o log vazou o bearer do chamador");
      assert(!trilha.includes(URL_PUBLICA), "o log vazou a URL crua do objeto");
    } finally {
      stub.restore();
    }
  });
});

// ─── (2) imagem AUTORIZADA: data URL embutida chega ao provedor ───────────────

Deno.test("R2-INF-022: imagem autorizada chega ao provedor EMBUTIDA como data URL e devolve a categoria", async () => {
  await withEnv(async () => {
    const stub = withFetch({
      auth: respostaAuthOk,
      storage: respostaStorageOk,
      provedor: respostaProvedorOk,
    });
    try {
      const handler = await handlerDaFuncao();
      const res = await handler(pedido());

      assertEquals(res.status, 200);
      assertEquals(await res.json(), { category: "riso" });

      // Download sob a identidade do usuário (não service role).
      const downloads = downloadsDoStorage(stub.calls);
      assertEquals(downloads.length, 1);
      assertEquals(downloads[0].url, URL_DOWNLOAD);
      assertEquals(downloads[0].headers["apikey"], ANON_KEY);
      assertEquals(downloads[0].headers["authorization"], `Bearer ${JWT_USUARIO}`);

      // Uma única chamada ao provedor de visão, com a imagem EMBUTIDA —
      // `data:image/png;base64,...`, nunca a URL crua do Storage.
      const provedor = chamadasAoProvedor(stub.calls);
      assertEquals(provedor.length, 1);
      assertEquals(provedor[0].url, PROVIDER_ENDPOINT);
      const corpo = provedor[0].corpo as Record<string, unknown>;
      assertEquals(corpo.model, MODELO_VISAO);
      const mensagens = corpo.messages as Array<{ role: string; content: unknown }>;
      const partes = mensagens[0].content as Array<Record<string, unknown>>;
      assert(Array.isArray(partes), "o multipart tem de ser ARRAY, nao string");
      const parteImagem = partes[0] as { type?: string; image_url?: { url?: unknown } };
      assertEquals(parteImagem.type, "image_url");
      assertEquals(parteImagem.image_url?.url, DATA_URL_ESPERADA);
      assert(
        String(parteImagem.image_url?.url).startsWith("data:image/"),
        "a imagem viajou como URL crua em vez de data URL",
      );
      assertEquals((partes[1] as { type?: string }).type, "text");
    } finally {
      stub.restore();
    }
  });
});

// ─── (3) identidade INVÁLIDA: negação da guarda → nada é baixado ──────────────

Deno.test("R2-INF-022: identidade invalida (GoTrue 401) devolve a negacao e NAO baixa imagem", async () => {
  await withEnv(async () => {
    const stub = withFetch({ auth: respostaAuthInvalida });
    try {
      const handler = await handlerDaFuncao();
      const res = await handler(pedido());

      assertEquals(res.status, 401);
      // A guarda recusou antes de qualquer leitura: 0 GET no Storage e 0 POST
      // ao provedor — só a chamada de verificação ao GoTrue aconteceu.
      assertEquals(downloadsDoStorage(stub.calls).length, 0);
      assertEquals(chamadasAoProvedor(stub.calls).length, 0);
      assert(
        stub.calls.every((c) => c.url.includes("/auth/v1/user")),
        `a guarda deixou passar rede alem da verificacao: ${stub.calls.map((c) => c.url)}`,
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("R2-INF-022: service role segue recusada (403) sem tocar a rede", async () => {
  await withEnv(async () => {
    const stub = withFetch({ auth: respostaAuthOk });
    try {
      const handler = await handlerDaFuncao();
      const res = await handler(pedido(`Bearer ${SERVICE_KEY}`));

      assertEquals(res.status, 403);
      // `isServiceRoleRequest` nega antes do `requireAuth`: nem o GoTrue é chamado.
      assertEquals(
        stub.calls.length,
        0,
        `service role tocou a rede antes de ser negada: ${stub.calls.map((c) => c.url)}`,
      );
    } finally {
      stub.restore();
    }
  });
});
