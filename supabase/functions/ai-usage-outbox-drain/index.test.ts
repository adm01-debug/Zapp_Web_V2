// IA-TIMEOUT-001 — consumidor da outbox durável de log essencial de IA.
//
// Prova (a) sem credencial ⇒ 401 e a fila não é tocada; (b) com o segredo de cron ⇒
// o reprocessamento roda com o lote pedido; (c) falha do reprocessamento ⇒ 500 SEM
// texto interno. O último teste exercita o REPROCESSADOR REAL (não um espião) com a
// rede stubada, provando que a drenagem usa `public.ai_usage_outbox` (`limit`,
// `processed_at=is.null`) e dá baixa por `id`.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/ai-usage-outbox-drain/index.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { handleAiUsageOutboxDrain, LIMITE_MAXIMO, LIMITE_PADRAO } from "./index.ts";
import type { ResultadoReprocessamentoLogEssencial } from "../_shared/ai-usage.ts";

const SEGREDO = "cron-segredo-local";

function resultado(
  parcial: Partial<ResultadoReprocessamentoLogEssencial> = {},
): ResultadoReprocessamentoLogEssencial {
  return { lidos: 0, entregues: 0, pendentes: 0, esgotadas: 0, falha: null, ...parcial };
}

/** Espião: registra o limite recebido e devolve um resultado controlado. */
function espiao(valor: ResultadoReprocessamentoLogEssencial | Error = resultado()) {
  const limites: number[] = [];
  const reprocessar = (limite: number) => {
    limites.push(limite);
    if (valor instanceof Error) return Promise.reject(valor);
    return Promise.resolve(valor);
  };
  return { limites, reprocessar };
}

function requisicao(opcoes: {
  segredo?: string | null;
  metodo?: string;
  corpo?: string;
} = {}): Request {
  const headers = new Headers();
  if (opcoes.segredo !== undefined && opcoes.segredo !== null) {
    headers.set("x-cron-secret", opcoes.segredo);
  }
  return new Request("https://local/ai-usage-outbox-drain", {
    method: opcoes.metodo ?? "POST",
    headers,
    body: opcoes.corpo,
  });
}

Deno.test("(a) sem x-cron-secret ⇒ 401 e o reprocessamento NÃO roda", async () => {
  const spy = espiao();
  const res = await handleAiUsageOutboxDrain(requisicao(), {
    cronSecret: SEGREDO,
    reprocessar: spy.reprocessar,
  });
  assertEquals(res.status, 401);
  assertEquals(await res.json(), { error: "Unauthorized" });
  assertEquals(spy.limites.length, 0, "sem credencial a fila não pode ser tocada");
});

Deno.test("(a) segredo errado ⇒ 401 e o reprocessamento NÃO roda", async () => {
  const spy = espiao();
  const res = await handleAiUsageOutboxDrain(requisicao({ segredo: "segredo-errado" }), {
    cronSecret: SEGREDO,
    reprocessar: spy.reprocessar,
  });
  assertEquals(res.status, 401);
  assertEquals(spy.limites.length, 0);
});

Deno.test("(a) fail-closed: sem segredo no ambiente, mesmo o header certo ⇒ 401", async () => {
  const spy = espiao();
  const res = await handleAiUsageOutboxDrain(requisicao({ segredo: SEGREDO }), {
    cronSecret: "",
    reprocessar: spy.reprocessar,
  });
  assertEquals(res.status, 401);
  assertEquals(spy.limites.length, 0);
});

Deno.test("(b) com o segredo de cron ⇒ drena com o lote pedido e devolve os contadores", async () => {
  const spy = espiao(resultado({ lidos: 3, entregues: 2, pendentes: 1, esgotadas: 0 }));
  const res = await handleAiUsageOutboxDrain(
    requisicao({ segredo: SEGREDO, corpo: JSON.stringify({ limite: 7 }) }),
    { cronSecret: SEGREDO, reprocessar: spy.reprocessar },
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), {
    ok: true,
    lidos: 3,
    entregues: 2,
    pendentes: 1,
    esgotadas: 0,
  });
  assertEquals(spy.limites, [7]);
});

Deno.test("(b) lote limitado: sem corpo usa o padrão; 0 vira 1; acima do teto vira o teto", async () => {
  const semCorpo = espiao();
  await handleAiUsageOutboxDrain(requisicao({ segredo: SEGREDO }), {
    cronSecret: SEGREDO,
    reprocessar: semCorpo.reprocessar,
  });
  assertEquals(semCorpo.limites, [LIMITE_PADRAO]);

  const zero = espiao();
  await handleAiUsageOutboxDrain(
    requisicao({ segredo: SEGREDO, corpo: JSON.stringify({ limite: 0 }) }),
    { cronSecret: SEGREDO, reprocessar: zero.reprocessar },
  );
  assertEquals(zero.limites, [1]);

  const enorme = espiao();
  await handleAiUsageOutboxDrain(
    requisicao({ segredo: SEGREDO, corpo: JSON.stringify({ limite: 99999 }) }),
    { cronSecret: SEGREDO, reprocessar: enorme.reprocessar },
  );
  assertEquals(enorme.limites, [LIMITE_MAXIMO]);
});

Deno.test("(b) método diferente de POST ⇒ 405 e o reprocessamento NÃO roda", async () => {
  const spy = espiao();
  const res = await handleAiUsageOutboxDrain(requisicao({ segredo: SEGREDO, metodo: "GET" }), {
    cronSecret: SEGREDO,
    reprocessar: spy.reprocessar,
  });
  assertEquals(res.status, 405);
  assertEquals(spy.limites.length, 0);
});

Deno.test("(c) falha do reprocessamento ⇒ 500 sem vazar o texto interno", async () => {
  const interno = "leitura:https://db.interno.test/xyz token-interno";
  const spy = espiao(resultado({ falha: interno }));
  const res = await handleAiUsageOutboxDrain(requisicao({ segredo: SEGREDO }), {
    cronSecret: SEGREDO,
    reprocessar: spy.reprocessar,
  });
  assertEquals(res.status, 500);
  const cru = await res.text();
  assertEquals(JSON.parse(cru), { error: "Internal server error" });
  assert(!cru.includes("db.interno.test"), "URL interna não pode voltar ao cliente");
  assert(!cru.includes("token-interno"), "detalhe interno não pode voltar ao cliente");
  assert(!cru.includes("leitura:"), "o motivo interno não pode voltar ao cliente");
});

Deno.test("(c) reprocessamento que lança ⇒ 500 sem vazar a mensagem da exceção", async () => {
  const spy = espiao(new Error("senha-do-banco-interna"));
  const res = await handleAiUsageOutboxDrain(requisicao({ segredo: SEGREDO }), {
    cronSecret: SEGREDO,
    reprocessar: spy.reprocessar,
  });
  assertEquals(res.status, 500);
  const cru = await res.text();
  assert(!cru.includes("senha-do-banco-interna"));
});

// ── Repasse pelo caminho REAL (sem espião), com a rede stubada ──

function comEnv(nome: string, valor: string): () => void {
  const anterior = Deno.env.get(nome);
  Deno.env.set(nome, valor);
  return () => {
    if (anterior === undefined) Deno.env.delete(nome);
    else Deno.env.set(nome, anterior);
  };
}

interface Chamada {
  url: string;
  metodo: string;
}

/** Stub do fetch global: serve a outbox, a checagem de log_key, o insert e o PATCH. */
function stubRede(): { chamadas: Chamada[]; restaurar: () => void } {
  const chamadas: Chamada[] = [];
  const original = globalThis.fetch;
  const json = (valor: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(valor), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const metodo = (init?.method ?? "GET").toUpperCase();
    chamadas.push({ url, metodo });
    if (url.includes("/rest/v1/ai_usage_outbox") && metodo === "GET") {
      return json([
        {
          id: "ob-1",
          tentativas: 0,
          payload: {
            linha: {
              function_name: "ai-proxy",
              user_id: null,
              model: "modelo-local",
              input_tokens: 1,
              output_tokens: 2,
              duration_ms: 10,
              status: "success",
            },
          },
        },
      ]);
    }
    if (url.includes("/rest/v1/ai_usage_logs") && metodo === "GET") return json([]);
    if (url.includes("/rest/v1/ai_usage_logs")) return json([], 201);
    if (url.includes("/rest/v1/ai_usage_outbox") && metodo === "PATCH") {
      // PostgREST com `Prefer: return=minimal` responde 204 SEM corpo — uma
      // Response 204 com corpo é inválida no runtime e faria o PATCH parecer
      // recusado (era o defeito do stub, não do código de produção).
      return new Response(null, { status: 204 });
    }
    return json({ erro: "rota inesperada", url, metodo }, 500);
  }) as typeof fetch;
  return {
    chamadas,
    restaurar: () => {
      globalThis.fetch = original;
    },
  };
}

Deno.test("real (sem espião): drena public.ai_usage_outbox e dá baixa por id", async () => {
  const limpaUrl = comEnv("SUPABASE_URL", "https://local.supabase.test");
  const limpaChave = comEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-local");
  const limpaCron = comEnv("CRON_SECRET", SEGREDO);
  const rede = stubRede();
  try {
    const res = await handleAiUsageOutboxDrain(
      requisicao({ segredo: SEGREDO, corpo: JSON.stringify({ limite: 7 }) }),
    );
    assertEquals(res.status, 200);
    const corpo = await res.json() as Record<string, unknown>;
    assertEquals(corpo.ok, true);
    assertEquals(corpo.lidos, 1);
    assertEquals(corpo.entregues, 1);
    assertEquals(corpo.pendentes, 0);

    const leitura = rede.chamadas.find((c) =>
      c.url.includes("/rest/v1/ai_usage_outbox") && c.metodo === "GET"
    );
    assert(leitura, "o reprocessador real precisa ler a outbox pública");
    assert(leitura!.url.includes("processed_at=is.null"), "só pendências sem baixa");
    assert(leitura!.url.includes("limit=7"), "o lote da requisição chega à leitura real");
    assert(
      rede.chamadas.some((c) =>
        c.url.includes("/rest/v1/ai_usage_logs") && c.metodo === "POST"
      ),
      "o consumo pendente precisa ser regravado em ai_usage_logs",
    );
    assert(
      rede.chamadas.some((c) =>
        c.url.includes("/rest/v1/ai_usage_outbox") && c.metodo === "PATCH" &&
        c.url.includes("id=eq.ob-1")
      ),
      "entrega confirmada precisa dar baixa na pendência pelo id",
    );
  } finally {
    rede.restaurar();
    limpaCron();
    limpaChave();
    limpaUrl();
  }
});
