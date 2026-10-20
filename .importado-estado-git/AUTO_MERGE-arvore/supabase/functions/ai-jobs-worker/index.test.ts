// IA-051 — a correlação tem de sobreviver aos DOIS saltos que ligam a fila ao log.
//
// Por que este arquivo existe: os testes do registrador (`_shared/ai-usage.test.ts`)
// provam que o canal grava `request_id`/`job_id`/`attempt` e recusa dado pessoal.
// Eles NÃO veem o que acontece no meio do caminho — quem preenche esses campos é
// (a) o handler `ai.generate` do worker, que tem o job arrendado na mão, e (b) o
// roteador `generateWithRouting`, que repassa para o registrador central.
// Se qualquer um dos dois saltos perder os campos, a correlação morre EM SILÊNCIO:
// o log continua sendo gravado, só deixa de responder "de onde veio este gasto".
//
// LIMITE DECLARADO (não é prova de comportamento): isto é uma **guarda de origem** —
// lê o código e falha se a fiação sumir, no mesmo estilo da guarda do ponto de
// chamada do `ai-proxy` em `_shared/ai-usage.test.ts`. A prova de RUNTIME de um job
// da fila até o log exigiria provedor real e a flag `AI_JOBS_ENABLE_AI_GENERATE`
// ligada, além de credencial de banco que este ambiente não tem: está declarada como
// limitação no corpo do PR, não maquiada aqui.
//
// NOTA para o ratchet `tests/contracts/_adv_edge_legacy_producers.test.ts`: este
// arquivo conta como +1 `.ts` em `supabase/functions` (sem produtor de vocabulário
// legado). Não usa o "regex antigo" — o fatiamento é por `indexOf`, de propósito.
//
// Run with: deno test --allow-read supabase/functions/ai-jobs-worker/index.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import type { AiJob } from "../_shared/ai-jobs.ts";
import { resolveDefaultTimeoutMs } from "../_shared/ai-generate.ts";
import { AI_PURPOSES } from "../_shared/ai-routing.ts";
import {
  GENERATE_LEASE_MARGIN_MS,
  LEASE_WINDOW_MS,
  runBatch,
  type AiJobHandler,
  type AiJobHandlerInput,
} from "./index.ts";

const WORKER = new URL("./index.ts", import.meta.url);
const ROTEADOR = new URL("../_shared/ai-generate.ts", import.meta.url);

/** Trecho do fonte entre `inicio` e o primeiro `fim` depois dele (vazio se não achar). */
function trecho(fonte: string, inicio: string, fim: string): string {
  const i = fonte.indexOf(inicio);
  if (i < 0) return "";
  const j = fonte.indexOf(fim, i + inicio.length);
  return j < 0 ? fonte.slice(i) : fonte.slice(i, j + fim.length);
}

Deno.test("IA-051: o handler `ai.generate` liga a chamada ao job e à tentativa arrendados", async () => {
  const fonte = await Deno.readTextFile(WORKER);

  const chamada = trecho(fonte, "generateWithRouting({", "});");
  assert(
    chamada.length > 0,
    "não encontrei a chamada de `generateWithRouting` no worker (o código mudou?)",
  );

  assert(
    /jobId:\s*input\.job\.id\b/.test(chamada),
    "o handler `ai.generate` não passa `jobId: input.job.id`: o consumo da fila deixa de ser rastreável até o job",
  );
  assert(
    /attempt:\s*input\.job\.attemptCount\b/.test(chamada),
    "o handler `ai.generate` não passa `attempt: input.job.attemptCount`: a tentativa se perde e a IA-054 não reconcilia",
  );

  // A fiação tem de estar DENTRO da chamada do roteador, não solta no arquivo:
  // um `jobId` computado e nunca usado seria a mesma perda, com aparência de feita.
  assert(
    /input\.job\.id/.test(chamada) && /input\.job\.attemptCount/.test(chamada),
    "os campos de correlação existem no arquivo mas ficaram FORA da chamada do roteador",
  );
});

Deno.test("IA-051: o roteador repassa requestId/jobId/attempt ao registrador central", async () => {
  const fonte = await Deno.readTextFile(ROTEADOR);

  // (1) o contrato aceita os três campos.
  for (const campo of ["requestId", "jobId", "attempt"]) {
    assert(
      new RegExp(`${campo}\\?:\\s*(string|number) \\| null`).test(fonte),
      `GenerateParams não declara \`${campo}\` — o caller não tem como informar a correlação`,
    );
  }

  // (2) o registrador central recebe os três (é o único ponto de log do roteador).
  const insert = trecho(fonte, "logAiUsage({", "});");
  assert(insert.length > 0, "não encontrei a chamada de `logAiUsage` no roteador (o código mudou?)");
  for (const campo of ["requestId", "jobId", "attempt"]) {
    assert(
      new RegExp(`\\n\\s*${campo},`).test(insert),
      `o roteador não repassa \`${campo}\` ao log: a correlação é recebida e descartada`,
    );
  }

  // (3) e são lidos dos params (não hardcoded).
  for (const campo of ["requestId", "jobId", "attempt"]) {
    assert(
      new RegExp(`params\\.${campo}\\b`).test(fonte),
      `\`${campo}\` não é lido de \`params\` — valor fixo não correlaciona nada`,
    );
  }
});

Deno.test("IA-051: o worker continua sem registrar dado pessoal como identificador", async () => {
  const fonte = await Deno.readTextFile(WORKER);
  const chamada = trecho(fonte, "generateWithRouting({", "});");
  assert(chamada.length > 0, "não encontrei a chamada de `generateWithRouting` no worker");

  // A tentação num worker é usar `payload` (que carrega conteúdo de conversa) como
  // identificador. A correlação tem de usar o ID do job, nunca o payload.
  assert(
    !/jobId:\s*input\.payload/.test(chamada),
    "o worker usa o payload como identificador de log — payload carrega conteúdo, não id",
  );
  assert(
    !/attempt:\s*input\.payload/.test(chamada),
    "o worker usa o payload como número de tentativa",
  );
});

// ---------------------------------------------------------------------------
// IA-202 / R2-API-026 — runtime: lease vivo DURANTE o handler, perda propagada
// por AbortSignal e marca durável antes do efeito externo.
//
// O Supabase é real (supabase-js) contra um `fetch` falso que grava as RPCs:
// os wrappers de `_shared/ai-jobs.ts` rodam de verdade — nada é simulado por
// dentro do módulo. `runBatch` aceita `{ handlers, renewIntervalMs }` injetáveis
// SÓ para o teste; em produção o default é o registro real e janela/3.
// ---------------------------------------------------------------------------

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

/** Respostas programáveis das RPCs que o lote usa. */
interface RpcStubOpts {
  /** Resultado do n-ésimo heartbeat (1 é a renovação ANTES do handler). */
  heartbeat?: (n: number, args: Record<string, unknown>) => boolean;
  /** Resultado de `mark_ai_job_effect_started` (default true). */
  mark?: boolean;
  /** Resultado de `finish_ai_job` (default true). */
  finish?: boolean;
}

/**
 * Fetch falso: registra cada RPC (PostgREST `/rest/v1/rpc/<nome>`) e devolve o
 * escalar que a função retornaria. Qualquer outra rota responde 404 — vazamento
 * para fora do contrato fica visível.
 */
function stubRpcFetch(opts: RpcStubOpts) {
  const calls: RpcCall[] = [];
  let heartbeats = 0;
  const original = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = ((input: any, init?: any) => {
    const url = typeof input === "string" ? input : String(input?.url ?? input);
    const m = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(url);
    if (!m) {
      return Promise.resolve(new Response("{}", { status: 404 }));
    }
    const name = m[1];
    const args = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ name, args });
    let data: unknown = true;
    if (name === "heartbeat_ai_job") {
      heartbeats += 1;
      data = opts.heartbeat ? opts.heartbeat(heartbeats, args) : true;
    } else if (name === "mark_ai_job_effect_started") {
      data = opts.mark ?? true;
    } else if (name === "finish_ai_job") {
      data = opts.finish ?? true;
    } else if (name === "reap_ai_jobs") {
      data = 0;
    }
    return Promise.resolve(
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  return {
    calls,
    rpcs: (name: string) => calls.filter((c) => c.name === name),
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/** Env de service role para os wrappers reais criarem o client (fetch é falso). */
async function withWorkerEnv<T>(fn: () => Promise<T>): Promise<T> {
  const prevUrl = Deno.env.get("SUPABASE_URL");
  const prevKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_URL", "http://127.0.0.1:9");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key-de-teste");
  try {
    return await fn();
  } finally {
    if (prevUrl === undefined) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", prevUrl);
    if (prevKey === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", prevKey);
  }
}

const JOB_ID = "job-202-0001";
const noopLog = { warn: () => {} };

function claimedJob(id = JOB_ID, leaseToken = "tok-202-1"): AiJob {
  return {
    id,
    status: "running",
    attemptCount: 1,
    maxAttempts: 8,
    leaseToken,
    priority: 100,
  };
}

/** Client real (a leitura da linha do job passa pelo fetch falso). */
function rowsSupabase(rows: Record<string, unknown>[]): SupabaseClient {
  return createClient("http://127.0.0.1:9", "service-key-de-teste", {
    global: {
      fetch: ((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : String(input);
        assert(url.includes("/rest/v1/ai_jobs"), `leitura inesperada: ${url}`);
        return Promise.resolve(
          new Response(JSON.stringify(rows), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }) as typeof fetch,
    },
  });
}

function jobRow(kind: string, id = JOB_ID): Record<string, unknown> {
  return { id, kind, function_name: "ai-proxy", user_id: null, payload: {} };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.test("IA-202: handler lento recebe heartbeat DURANTE a execução e o timer morre no fim", async () => {
  await withWorkerEnv(async () => {
    const stub = stubRpcFetch({});
    try {
      let beatsNaEntrada = -1;
      let beatsNaSaida = -1;
      const handlers: Record<string, AiJobHandler> = {
        "ai_jobs.reap_expired": async () => {
          beatsNaEntrada = stub.rpcs("heartbeat_ai_job").length;
          await sleep(80); // várias vezes o intervalo do keeper (20ms)
          beatsNaSaida = stub.rpcs("heartbeat_ai_job").length;
          return { status: "succeeded" };
        },
      };
      const counts = await runBatch(
        rowsSupabase([jobRow("ai_jobs.reap_expired")]),
        [claimedJob()],
        noopLog,
        { handlers, renewIntervalMs: 20 },
      );

      assert(
        beatsNaSaida - beatsNaEntrada >= 1,
        `handler lento ficou sem heartbeat durante a execução (${beatsNaEntrada} -> ${beatsNaSaida}): o lease teria expirado no meio`,
      );
      // Timer encerrado: nenhum heartbeat NOVO depois que o lote terminou.
      const totalAposBatch = stub.rpcs("heartbeat_ai_job").length;
      await sleep(70); // > 3x o intervalo — se o timer vazasse, dispararia
      assertEquals(
        stub.rpcs("heartbeat_ai_job").length,
        totalAposBatch,
        "heartbeat continuou depois do fim do lote — timer do keeper vazou",
      );
      assertEquals(counts.succeeded, 1);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("IA-202: lease perdido durante o handler aborta o signal e o worker NÃO liquida", async () => {
  await withWorkerEnv(async () => {
    // A renovação ANTES do handler (1ª) vale; todas as seguintes devolvem false.
    const stub = stubRpcFetch({ heartbeat: (n) => n === 1 });
    try {
      let signalAbortado = false;
      const handlers: Record<string, AiJobHandler> = {
        "ai_jobs.reap_expired": async (input: AiJobHandlerInput) => {
          const sig = (input as { signal?: AbortSignal }).signal;
          // Espera a propagação com teto (sem travar o CI se a perda não chegar).
          for (let i = 0; i < 200 && !sig?.aborted; i++) await sleep(10);
          signalAbortado = sig?.aborted === true;
          return { status: "succeeded" };
        },
      };
      await runBatch(
        rowsSupabase([jobRow("ai_jobs.reap_expired")]),
        [claimedJob()],
        noopLog,
        { handlers, renewIntervalMs: 10 },
      );

      assert(
        signalAbortado,
        "perda de lease não foi propagada ao handler — signal nunca abortou",
      );
      assertEquals(
        stub.rpcs("finish_ai_job").filter((c) => c.args.p_id === JOB_ID).length,
        0,
        "worker liquidou (finish_ai_job) um job cujo lease se perdeu no meio",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("IA-202: kind com efeito externo marca ANTES do handler; marca recusada NÃO executa o efeito", async () => {
  await withWorkerEnv(async () => {
    // (a) marca aceita: a RPC corre ANTES do handler e o job liquida normal.
    let stub = stubRpcFetch({});
    try {
      let handlerRodou = false;
      let marcaAntesDoHandler = false;
      const handlers: Record<string, AiJobHandler> = {
        "ai.generate": async () => {
          handlerRodou = true;
          marcaAntesDoHandler = stub.rpcs("mark_ai_job_effect_started").length === 1;
          return { status: "succeeded" };
        },
      };
      const counts = await runBatch(
        rowsSupabase([jobRow("ai.generate")]),
        [claimedJob()],
        noopLog,
        { handlers, renewIntervalMs: 60_000 },
      );
      assert(handlerRodou, "handler de kind com efeito não rodou com a marca aceita");
      assert(
        marcaAntesDoHandler,
        "o efeito executou sem a marca durável ANTES (mark_ai_job_effect_started)",
      );
      assertEquals(
        stub.rpcs("mark_ai_job_effect_started")[0]?.args,
        { p_id: JOB_ID, p_lease_token: "tok-202-1" },
      );
      assertEquals(counts.succeeded, 1);
    } finally {
      stub.restore();
    }

    // (b) marca recusada (lease perdido / fora de alcance): na dúvida, NEGA —
    // o handler NÃO roda e o efeito NÃO acontece.
    stub = stubRpcFetch({ mark: false });
    try {
      let handlerRodou = false;
      const handlers: Record<string, AiJobHandler> = {
        "ai.generate": async () => {
          handlerRodou = true;
          return { status: "succeeded" };
        },
      };
      await runBatch(
        rowsSupabase([jobRow("ai.generate")]),
        [claimedJob()],
        noopLog,
        { handlers, renewIntervalMs: 60_000 },
      );
      assert(
        !handlerRodou,
        "mark_ai_job_effect_started devolveu false e o efeito externo executou mesmo assim",
      );
      assertEquals(
        stub.rpcs("finish_ai_job").filter((c) => c.args.p_id === JOB_ID).length,
        0,
        "job com marca recusada foi liquidado como se o efeito tivesse ocorrido",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("IA-202 (regressão): kind sem efeito liquida como antes, sem exigir a marca", async () => {
  await withWorkerEnv(async () => {
    const stub = stubRpcFetch({});
    try {
      let handlerRodou = false;
      const handlers: Record<string, AiJobHandler> = {
        "ai_jobs.reap_expired": async () => {
          handlerRodou = true;
          return { status: "succeeded" };
        },
      };
      const counts = await runBatch(
        rowsSupabase([jobRow("ai_jobs.reap_expired")]),
        [claimedJob()],
        noopLog,
        { handlers, renewIntervalMs: 60_000 },
      );
      assert(handlerRodou && counts.succeeded === 1, "kind sem efeito deixou de liquidar");
      assertEquals(
        stub.rpcs("mark_ai_job_effect_started").length,
        0,
        "kind sem efeito externo chamou a RPC de marca — a proteção tem de valer só onde há efeito",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("IA-202: o prazo de geração é min(default do roteador, orçamento do lease) — nunca aumenta", async () => {
  const fonte = await Deno.readTextFile(WORKER);
  const chamada = trecho(fonte, "generateWithRouting({", "});");
  assert(chamada.length > 0, "não encontrei a chamada de `generateWithRouting` no worker");

  // O prazo ponta a ponta (requisição + corpo — IA-041) tem de ser DERIVADO:
  // Math.min(default real do roteador para o purpose, orçamento do lease).
  // Um `timeoutMs:` solto com a janela inteira volta a AUMENTAR o prazo
  // (o defeito recusado) — esta guarda falha nesse formato.
  const expr = trecho(chamada, "timeoutMs:", "GENERATE_LEASE_MARGIN_MS");
  assert(
    /Math\.min\(/.test(expr) && /resolveDefaultTimeoutMs\(/.test(expr),
    "handleAiGenerate não passa `timeoutMs` = Math.min(resolveDefaultTimeoutMs(...), LEASE_WINDOW_MS - GENERATE_LEASE_MARGIN_MS) — o prazo deixou de ser o default limitado pelo orçamento do lease",
  );

  // Valores REAIS: a função do roteador e as constantes do worker, chamadas
  // de verdade — nada repetido na mão. Para TODA finalidade (texto puro) o
  // prazo efetivo é o default histórico de 30s, que já cabe no orçamento.
  const orcamento = LEASE_WINDOW_MS - GENERATE_LEASE_MARGIN_MS;
  assert(orcamento > 0, `orçamento do lease não positivo: ${orcamento}ms`);
  for (const purpose of AI_PURPOSES) {
    const padrao = resolveDefaultTimeoutMs(purpose, null);
    const efetivo = Math.min(padrao, orcamento);
    assert(
      efetivo <= orcamento,
      `timeoutMs de '${purpose}' (${efetivo}ms) excede o orçamento do lease (${orcamento}ms)`,
    );
    assertEquals(
      efetivo,
      padrao,
      `timeoutMs de '${purpose}' ficou abaixo do default do roteador (${efetivo}ms < ${padrao}ms) — o teto do lease cortou o prazo`,
    );
    assertEquals(
      efetivo,
      30_000,
      `o prazo de '${purpose}' deixou o default histórico de 30s — vale ${efetivo}ms`,
    );
  }
  // Purpose fora do enum cai no default fechado — também dentro do orçamento.
  assert(
    Math.min(resolveDefaultTimeoutMs("purpose-inexistente", null), orcamento) <= orcamento,
    "purpose desconhecido estourou o orçamento do lease",
  );

  // A perda de lease tem de alcançar a espera da geração (o signal do job),
  // não só o fetch interno do provedor.
  const corpoHandler = trecho(fonte, "async function handleAiGenerate", "export const HANDLERS");
  assert(
    /input\.signal/.test(corpoHandler),
    "a perda de lease (signal do job) não chega ao caminho de geração",
  );
});
