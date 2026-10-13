// LGPD (doc 07, achado do log de voz): a edge `voice-agent` gravava os 100
// primeiros caracteres da FALA do usuário no log da função. A fala pode conter
// dado pessoal (CPF, telefone, conteúdo de conversa) e isso é vazamento em log.
//
// Aceite: o log da fala carrega SÓ metadados (tamanho + id curto da requisição),
// NUNCA o texto.
//
// A prova roda o handler REAL com o `fetch` global stubado e captura o `console`
// (o `Logger` escreve por `console.log`/`warn`/`error`), garantindo que NENHUMA
// linha emitida contenha o texto da fala.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
//     supabase/functions/voice-agent/index.test.ts

import { handleVoiceAgent } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const USER_ID = "20000000-0000-0000-0000-000000000010";
// Fala com dado pessoal sintético: a prova é NÃO ver isso em nenhuma linha de log.
const FALA = "meu cpf e 111.222.333-44 e meu telefone e 11 91234-5678, pode anotar";

type Route = { match: string; make: () => Response | Promise<Response> };
type Call = { url: string; init?: RequestInit };

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Stuba o `fetch` global: `/auth/v1/user` (requireAuth), `feature_flags`
 *  (kill switch), `ai_rate_limit_hit` (cota compartilhada) e `ai_usage_logs`
 *  (cota diária + ledger). Qualquer outra URL cai no 599 — o despacho de IA
 *  falha de forma tratada e o handler devolve o fallback, mas o log da fala já
 *  aconteceu (é ele que a prova verifica). */
function withFetch(routes: Route[]) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    calls.push({ url, init });
    if (url.includes("/rest/v1/rpc/resolve_network_policy")) {
      return Promise.resolve(jsonResp([
        { allowed: true, reason: null, rate_limit_max_requests: 30, rate_limit_window_seconds: 60 },
      ]));
    }
    const route = routes.find((r) => url.includes(r.match));
    if (!route) return Promise.resolve(new Response("nao stubado", { status: 599 }));
    return Promise.resolve(route.make());
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const ROTA_AUTH: Route = {
  match: "/auth/v1/user",
  make: () => jsonResp({ id: USER_ID, aud: "authenticated" }),
};
const ROTA_FLAG: Route = {
  match: "/rest/v1/feature_flags",
  make: () => jsonResp({ enabled: true }),
};
const ROTA_RATE_LIMIT: Route = {
  match: "/rest/v1/rpc/ai_rate_limit_hit",
  make: () => jsonResp(1),
};
const ROTA_USAGE: Route = {
  match: "/rest/v1/ai_usage_logs",
  make: () => jsonResp([], 200),
};

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const ENV_OK = {
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-de-teste",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-de-teste",
};

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>, fn: () => Promise<void>) {
  const saved = ENV_KEYS.map((k) => [k, Deno.env.get(k)] as const);
  for (const key of ENV_KEYS) {
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

function capturarConsole() {
  const original = { log: console.log, warn: console.warn, error: console.error };
  const linhas: string[] = [];
  const push = (...args: unknown[]) => {
    linhas.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  console.log = push;
  console.warn = push;
  console.error = push;
  return {
    linhas,
    restaurar: () => {
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
    },
  };
}

function vozRequest(): Request {
  return new Request("https://stub.supabase.co/functions/v1/voice-agent", {
    method: "POST",
    headers: { Authorization: "Bearer token-de-teste", "content-type": "application/json" },
    body: JSON.stringify({ transcript: FALA }),
  });
}

Deno.test("log da fala carrega só metadados: nunca o texto (LGPD)", async () => {
  const { restore } = withFetch([ROTA_AUTH, ROTA_FLAG, ROTA_RATE_LIMIT, ROTA_USAGE]);
  const captura = capturarConsole();
  try {
    await withEnv(ENV_OK, async () => {
      const res = await handleVoiceAgent(vozRequest());
      // O despacho de IA cai no 599 (nao stubado) e o handler devolve o fallback;
      // o que importa aqui é o log emitido ANTES disso.
      assert(res.status === 200, `o handler sempre devolve resposta usável, veio ${res.status}`);

      const saida = captura.linhas.join("\n");
      assert(saida.includes("Processing voice command"), "o handler precisa registrar o processamento da fala");
      assert(!saida.includes(FALA), "a fala completa NUNCA pode aparecer no log");
      assert(!saida.includes("111.222.333-44"), "dado pessoal da fala não pode aparecer no log");
      assert(!saida.includes("91234-5678"), "telefone da fala não pode aparecer no log");

      const linhaDaFala = captura.linhas.find((l) => l.includes("Processing voice command"));
      assert(linhaDaFala, "a linha do processamento precisa existir para inspecionar");
      const entrada = JSON.parse(linhaDaFala!);
      assert(entrada.transcript_length === FALA.length, "o log precisa do TAMANHO da fala");
      assert(
        typeof entrada.request_id === "string" && entrada.request_id.length > 0,
        "o log precisa de um identificador curto da requisição",
      );
      assert(!("transcript" in entrada), "o log NÃO pode ter o texto da fala em nenhuma chave");
    });
  } finally {
    captura.restaurar();
    restore();
  }
});
