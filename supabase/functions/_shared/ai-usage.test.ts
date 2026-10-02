// IA-049 — o consumo de IA no `ai-proxy` não pode virar registro perdido.
//
// Defeito original: `void logAiUsage(...)` descarta de propósito a promessa do
// insert. Se a função encerrar antes do insert concluir, o consumo PAGO some
// (o critério de aceite é textualmente: "Encerramento da função não transforma
// consumo pago ou efeito operacional em registro perdido").
//
// A correção expõe `logAiUsageDetached`: registra a promessa em
// `EdgeRuntime.waitUntil` quando ele existe (o runtime mantém a função viva até
// o insert) e cai em `await` quando não existe (Deno local/teste). A promessa
// NUNCA é descartada.
//
// Estes testes fixam as três propriedades do critério:
//   (a) com `waitUntil`, a promessa do insert é entregue ao waitUntil e o insert
//       NÃO se perde (e a chamada NÃO bloqueia a resposta);
//   (b) sem `waitUntil`, a promessa é AGUARDADA — só resolve DEPOIS do insert;
//   (c) o ponto de chamada do ai-proxy não volta a descartar com `void`.
//
// IA-051 — correlação da execução (mesmo arquivo, bloco (d) em diante).
// A etapa exige propagar requestId/jobId/attemptId "sem usar dado pessoal como
// identificador de log". Como `ai_usage_logs.request_id` é `uuid`, a regra é
// aplicada na entrada do logger: só uuid passa, o resto vira NULL. Os testes
// abaixo provam (1) a regra na função pura, (2) que o insert leva a correlação,
// e (3) que um e-mail/telefone entregue por engano NÃO chega ao banco.
//
// O insert é observado pelo `globalThis.fetch` (o PostgREST do supabase-js), sem
// rede real: nenhuma credencial, nenhum banco.
//
// Run with: deno test --allow-env --allow-net --allow-read \
//   supabase/functions/_shared/ai-usage.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  extractAiRequestId,
  logAiUsageDetached,
  normalizeAttempt,
  normalizeCorrelationId,
} from "./ai-usage.ts";

type EdgeRuntimeType = { waitUntil?: (promise: Promise<unknown>) => void };
const edgeGlobal = globalThis as { EdgeRuntime?: EdgeRuntimeType };

type Captura = { metodo: string; url: string; corpo: unknown };

/** Fixa as credenciais do Supabase (sem rede real) e devolve o restaurador. */
function stubEnv(): () => void {
  const prevUrl = Deno.env.get("SUPABASE_URL");
  const prevKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_URL", "https://projeto-teste.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-key-de-teste");
  return () => {
    if (prevUrl === undefined) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", prevUrl);
    if (prevKey === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", prevKey);
  };
}

/**
 * Substitui `globalThis.fetch` por um espião que captura as chamadas PostgREST.
 * `portao`, quando passado, segura a resposta do insert em ai_usage_logs até ser
 * liberado — é assim que provamos que a promessa ainda NÃO concluiu.
 */
function stubFetch(portao?: Promise<void>): { capturas: Captura[]; restaurar: () => void } {
  const capturas: Captura[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    let corpo: unknown = null;
    try {
      corpo = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      corpo = init?.body ?? null;
    }
    capturas.push({ metodo: init?.method ?? "GET", url, corpo });
    return (async () => {
      if (portao && url.includes("/rest/v1/ai_usage_logs")) await portao;
      return new Response("", { status: 201, headers: { "content-type": "application/json" } });
    })();
  }) as typeof fetch;
  return { capturas, restaurar: () => { globalThis.fetch = original; } };
}

/** Entrada de consumo — `userId` nulo evita a resolução de profile_id. */
const ENTRADA = {
  functionName: "ai-proxy",
  userId: null,
  model: "modelo-de-teste",
  inputTokens: 10,
  outputTokens: 5,
  status: "success",
  metadata: { prova: "ia-049" },
};

const houveInsert = (capturas: Captura[]) =>
  capturas.some((c) => c.metodo === "POST" && c.url.includes("/rest/v1/ai_usage_logs"));

/** A linha que o PostgREST recebeu (o supabase-js manda objeto ou [objeto]). */
const linhaEnviada = (capturas: Captura[]): Record<string, unknown> | null => {
  const post = capturas.find((c) => c.metodo === "POST" && c.url.includes("/rest/v1/ai_usage_logs"));
  if (!post || post.corpo === null) return null;
  const corpo = post.corpo as Record<string, unknown> | Record<string, unknown>[];
  const linha = Array.isArray(corpo) ? corpo[0] : corpo;
  return (linha ?? null) as Record<string, unknown> | null;
};

// ---------------------------------------------------------------------------
// (a) com waitUntil: a promessa vai para o waitUntil e o insert não se perde
// ---------------------------------------------------------------------------
Deno.test("logAiUsageDetached: com EdgeRuntime.waitUntil, entrega a promessa ao runtime sem bloquear", async () => {
  const restaurarEnv = stubEnv();
  const prevEdge = edgeGlobal.EdgeRuntime;
  const registradas: Promise<unknown>[] = [];
  edgeGlobal.EdgeRuntime = { waitUntil: (p) => { registradas.push(p); } };

  let liberarInsert!: () => void;
  const portao = new Promise<void>((res) => { liberarInsert = res; });
  const { capturas, restaurar } = stubFetch(portao);

  try {
    // Com o portão FECHADO, a chamada tem de retornar: o insert ainda não concluiu.
    await logAiUsageDetached(ENTRADA);

    assertEquals(
      registradas.length,
      1,
      "logAiUsageDetached tem de entregar a promessa do insert ao waitUntil exatamente uma vez",
    );

    let insertConcluido = false;
    registradas[0].then(() => { insertConcluido = true; });
    await Promise.resolve();
    await Promise.resolve();
    assertEquals(
      insertConcluido,
      false,
      "não pode bloquear: a resposta ao usuário não espera o insert concluir",
    );

    // Ao liberar o portão, a promessa registrada conclui e o insert aparece.
    liberarInsert();
    await registradas[0];
    assert(houveInsert(capturas), "o insert em ai_usage_logs não foi observado — registro perdido");
  } finally {
    restaurar();
    restaurarEnv();
    edgeGlobal.EdgeRuntime = prevEdge;
  }
});

// ---------------------------------------------------------------------------
// (b) sem waitUntil: a promessa é AGUARDADA (só resolve depois do insert)
// ---------------------------------------------------------------------------
Deno.test("logAiUsageDetached: sem EdgeRuntime.waitUntil, AGUARDA a promessa até o insert concluir", async () => {
  const restaurarEnv = stubEnv();
  const prevEdge = edgeGlobal.EdgeRuntime;
  delete edgeGlobal.EdgeRuntime;

  let liberarInsert!: () => void;
  const portao = new Promise<void>((res) => { liberarInsert = res; });
  const { capturas, restaurar } = stubFetch(portao);

  try {
    let resolvida = false;
    const promessa = logAiUsageDetached(ENTRADA).then(() => { resolvida = true; });

    // Com o portão fechado, o insert não concluiu — a promessa NÃO pode resolver.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    assertEquals(
      resolvida,
      false,
      "a promessa resolveu antes do insert: foi descartada (void) em vez de aguardada",
    );

    liberarInsert();
    await promessa;
    assert(resolvida, "a promessa tinha de resolver após o insert concluir");
    assert(houveInsert(capturas), "o insert em ai_usage_logs não foi observado — registro perdido");
  } finally {
    restaurar();
    restaurarEnv();
    edgeGlobal.EdgeRuntime = prevEdge;
  }
});

// ---------------------------------------------------------------------------
// (c) guarda do ponto de chamada: o ai-proxy não volta a descartar com `void`
// ---------------------------------------------------------------------------
Deno.test("ai-proxy: os logs de consumo usam `await logAiUsageDetached` (nunca `void logAiUsage`)", async () => {
  const fonte = await Deno.readTextFile(new URL("../ai-proxy/index.ts", import.meta.url));

  assertEquals(
    fonte.includes("void logAiUsage"),
    false,
    "ai-proxy descarta a promessa com `void logAiUsage(...)`: o consumo pago pode virar registro perdido",
  );

  const usosDetached = fonte.match(/await\s+logAiUsageDetached\s*\(/g) ?? [];
  assertEquals(
    usosDetached.length,
    2,
    `os DOIS pontos de log de consumo têm de usar await logAiUsageDetached (encontrados ${usosDetached.length})`,
  );
});

// ---------------------------------------------------------------------------
// (d) IA-051 — a regra do identificador: uuid ou nada
// ---------------------------------------------------------------------------
const UUID = "9f4c1e2a-1b3d-4c5e-8a7b-0d1e2f3a4b5c";

Deno.test("IA-051 normalizeCorrelationId: aceita uuid (e canoniza em minúsculas)", () => {
  assertEquals(normalizeCorrelationId(UUID), UUID);
  assertEquals(
    normalizeCorrelationId(UUID.toUpperCase()),
    UUID,
    "uuid em maiúsculas tem de ser aceito e canonizado — o mesmo id não pode virar dois na busca",
  );
  assertEquals(normalizeCorrelationId(`  ${UUID}  `), UUID, "espaço em volta não pode invalidar o id");
});

Deno.test("IA-051 normalizeCorrelationId: NENHUM dado pessoal passa como identificador de log", () => {
  const proibidos: Array<[string, unknown]> = [
    ["e-mail", "cliente@empresa.com.br"],
    ["telefone", "5511999998888"],
    ["telefone formatado", "+55 (11) 99999-8888"],
    ["nome", "Maria Silva"],
    ["id de contato com prefixo", "contact:9f4c1e2a-1b3d-4c5e-8a7b-0d1e2f3a4b5c"],
    ["uuid truncado", "9f4c1e2a-1b3d-4c5e-8a7b"],
    ["objeto", { id: UUID }],
    ["número", 12345],
    ["vazio", ""],
    ["nulo", null],
    ["indefinido", undefined],
  ];
  for (const [rotulo, valor] of proibidos) {
    assertEquals(
      normalizeCorrelationId(valor),
      null,
      `${rotulo} não pode virar request_id: o campo é uuid opaco, nunca dado pessoal`,
    );
  }
});

Deno.test("IA-051 extractAiRequestId: lê o header do cliente e só aceita uuid", () => {
  const comId = new Request("https://exemplo.test/funcao", {
    headers: { "x-ai-request-id": UUID },
  });
  assertEquals(extractAiRequestId(comId), UUID);

  const semId = new Request("https://exemplo.test/funcao");
  assertEquals(extractAiRequestId(semId), null, "sem header não há correlação — e nada é inventado");

  const comPii = new Request("https://exemplo.test/funcao", {
    headers: { "x-ai-request-id": "cliente@empresa.com.br" },
  });
  assertEquals(
    extractAiRequestId(comPii),
    null,
    "um e-mail no header não pode atravessar para o log",
  );
});

Deno.test("IA-051 normalizeAttempt: inteiro pequeno sim, o resto não", () => {
  assertEquals(normalizeAttempt(0), 0, "a primeira tentativa é 0 (ai_jobs.attempt_count começa em 0)");
  assertEquals(normalizeAttempt(3), 3);
  assertEquals(normalizeAttempt("4"), 4, "valor textual vindo de payload ainda é tentativa válida");
  assertEquals(normalizeAttempt(1.5), null, "tentativa fracionária não existe");
  assertEquals(normalizeAttempt(-1), null, "tentativa negativa não existe");
  assertEquals(normalizeAttempt(40000), null, "acima do smallint não cabe na coluna");
  assertEquals(normalizeAttempt(undefined), null);
  assertEquals(normalizeAttempt(""), null);
  assertEquals(normalizeAttempt(null), null);
});

// ---------------------------------------------------------------------------
// (e) IA-051 — o insert leva a correlação, e PII entregue por engano NÃO vai
// ---------------------------------------------------------------------------
Deno.test("IA-051 logAiUsage: grava request_id/job_id/attempt na linha do log", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubFetch();
  const jobId = "0b1c2d3e-4f50-4a6b-8c9d-0e1f2a3b4c5d";

  try {
    await logAiUsageDetached({ ...ENTRADA, requestId: UUID, jobId, attempt: 2 });

    const linha = linhaEnviada(capturas);
    assert(linha !== null, "nenhuma linha foi enviada ao PostgREST");
    assertEquals(linha!.request_id, UUID, "request_id não chegou ao log");
    assertEquals(linha!.job_id, jobId, "job_id não chegou ao log");
    assertEquals(linha!.attempt, 2, "attempt não chegou ao log");
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-051 logAiUsage: PII entregue como identificador é gravada como NULL, não como dado pessoal", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubFetch();

  try {
    await logAiUsageDetached({
      ...ENTRADA,
      requestId: "cliente@empresa.com.br",
      jobId: "5511999998888",
      attempt: 999999,
    });

    const linha = linhaEnviada(capturas);
    assert(linha !== null, "nenhuma linha foi enviada ao PostgREST");
    assertEquals(
      linha!.request_id,
      null,
      "um e-mail virou request_id: dado pessoal dentro de um log de execução",
    );
    assertEquals(linha!.job_id, null, "um telefone virou job_id: dado pessoal dentro de um log");
    assertEquals(linha!.attempt, null, "attempt fora do smallint devia virar NULL, não derrubar o insert");
    assert(houveInsert(capturas), "o consumo tinha de continuar sendo registrado mesmo com id inválido");
  } finally {
    restaurar();
    restaurarEnv();
  }
});
