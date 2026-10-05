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
  calcularCusto,
  contaParaQuota,
  extractAiRequestId,
  extrairUsageDoStream,
  identidadeDaAcao,
  logAiUsage,
  logAiUsageDetached,
  medirStream,
  normalizeAttempt,
  normalizeCorrelationId,
  normalizeModality,
  reconciliarConsumo,
  reprocessarOutboxDeLog,
  tarifaAplicavel,
  type LinhaDeConsumo,
  type StreamOutcome,
  type TarifaDeModelo,
} from "./ai-usage.ts";

type EdgeRuntimeType = { waitUntil?: (promise: Promise<unknown>) => void };
const edgeGlobal = globalThis as { EdgeRuntime?: EdgeRuntimeType };

type Captura = {
  metodo: string;
  url: string;
  corpo: unknown;
  cabecalhos?: Record<string, unknown>;
};

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

// ---------------------------------------------------------------------------
// (f) IA-052 — a linha diz QUAL rota atendeu, e não a rota configurada
// ---------------------------------------------------------------------------
// A etapa exige "gravar provedor, modelo efetivo, finalidade, versões,
// modalidade, latência, status e unidades", com o aceite: "Cada execução informa
// seu caminho efetivo, inclusive fallback e modalidade de áudio" — e a proibição
// explícita de "inferir provedor apenas pela configuração padrão".
//
// Os testes abaixo fixam: (1) a rota medida chega ao log sob chaves canônicas;
// (2) sem rota (falha de roteamento) os campos NÃO são inventados; (3) id de
// provedor que não é uuid e modalidade fora da lista canônica não viram lixo no
// jsonb; (4) o metadata do chamador continua preservado junto da rota.
const ROTA_PROVEDOR = "926d3eec-3324-47a8-872f-fd369bd187ac";

function metadataDaLinha(capturas: Captura[]): Record<string, unknown> {
  const linha = linhaEnviada(capturas);
  assert(linha !== null, "nenhuma linha foi enviada ao PostgREST");
  return (linha!.metadata ?? {}) as Record<string, unknown>;
}

Deno.test("IA-052 logAiUsage: a rota EFETIVA chega ao log sob chaves canônicas", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubFetch();

  try {
    await logAiUsageDetached({
      ...ENTRADA,
      providerId: ROTA_PROVEDOR,
      providerType: "openai_compatible",
      providerName: "DeepSeek (Padrao)",
      purpose: "tagging",
      modality: "vision",
      modelRequested: "deepseek-v4-flash",
      fallbackUsed: false,
    });

    const md = metadataDaLinha(capturas);
    assertEquals(md.provider_id, ROTA_PROVEDOR, "o provedor que atendeu não chegou ao log");
    assertEquals(md.provider_type, "openai_compatible", "provider_type não chegou ao log");
    assertEquals(md.provider_name, "DeepSeek (Padrao)", "provider_name não chegou ao log");
    assertEquals(md.purpose, "tagging", "a finalidade não chegou ao log");
    assertEquals(
      md.modality,
      "vision",
      "a modalidade de VISÃO não chegou ao log — é o caso de aceite explícito da etapa",
    );
    assertEquals(md.model_requested, "deepseek-v4-flash", "o modelo pedido não chegou ao log");
    assertEquals(md.fallback_used, false);
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-052 logAiUsage: provedor de fallback é registrado como quem atendeu", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubFetch();

  try {
    await logAiUsageDetached({
      ...ENTRADA,
      providerId: ROTA_PROVEDOR,
      providerType: "openai_compatible",
      purpose: "copilot",
      modality: "text",
      fallbackUsed: true,
    });

    const md = metadataDaLinha(capturas);
    assertEquals(md.fallback_used, true, "a execução por fallback tem de ficar visível no log");
    assertEquals(md.provider_id, ROTA_PROVEDOR);
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-052 logAiUsage: SEM rota, os campos ficam ausentes — nunca inferidos do padrão", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubFetch();

  try {
    // Falha de roteamento: a execução nunca chegou a ter provedor.
    await logAiUsageDetached({ ...ENTRADA, status: "error", errorMessage: "sem provedor ativo" });

    const md = metadataDaLinha(capturas);
    for (const chave of ["provider_id", "provider_type", "provider_name", "purpose", "modality", "model_requested"]) {
      assert(
        !(chave in md),
        `"${chave}" foi gravado numa execução sem rota: o log está afirmando um caminho que não existiu`,
      );
    }
    assertEquals(md.fallback_used, false, "sem rota não é fallback, mas o campo tem de estar declarado");
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-052 logAiUsage: id de provedor não-uuid e modalidade desconhecida não viram lixo", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubFetch();

  try {
    await logAiUsageDetached({
      ...ENTRADA,
      providerId: "openai",            // nome, não id
      providerType: "  ",              // só espaços
      purpose: "",
      modality: "video",               // fora da lista canônica
      modelRequested: "   ",
    });

    const md = metadataDaLinha(capturas);
    assert(!("provider_id" in md), "um nome virou provider_id: o campo não pode virar depósito");
    assert(!("provider_type" in md), "string em branco virou provider_type");
    assert(!("modality" in md), "modalidade inventada virou dado do log");
    assert(!("model_requested" in md), "modelo em branco virou dado do log");
    assert(houveInsert(capturas), "o consumo tinha de ser registrado mesmo com rota inválida");
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-052 logAiUsage: o metadata do chamador é preservado junto da rota", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubFetch();

  try {
    await logAiUsageDetached({
      ...ENTRADA,
      purpose: "tagging",
      modality: "vision",
      metadata: { reason: "image_input_failed", image_bytes: 1024 },
    });

    const md = metadataDaLinha(capturas);
    assertEquals(md.reason, "image_input_failed", "o motivo da degradação foi perdido");
    assertEquals(md.image_bytes, 1024, "o detalhe do chamador foi perdido");
    assertEquals(md.modality, "vision", "a rota não foi anexada ao metadata do chamador");
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-052 normalizeModality: aceita a lista canônica e rejeita o resto", () => {
  assertEquals(normalizeModality("text"), "text");
  assertEquals(normalizeModality("  VISION  "), "vision", "normaliza caixa e espaço");
  assertEquals(normalizeModality("audio_stt"), "audio_stt");
  assertEquals(normalizeModality("audio_tts"), "audio_tts");
  assertEquals(normalizeModality("audio_sts"), "audio_sts");
  assertEquals(normalizeModality("video"), null, "modalidade desconhecida não passa");
  assertEquals(normalizeModality(42), null);
  assertEquals(normalizeModality(null), null);
  assertEquals(normalizeModality(undefined), null);
});

// ---------------------------------------------------------------------------
// (g) IA-053 — streaming: medir o que passa e DECLARAR o que não deu
// ---------------------------------------------------------------------------
// Aceite da etapa: "O caminho de streaming não fica ausente dos relatórios nem
// recebe custo zero por falta de dados." Antes desta correção, o `ai-proxy`
// devolvia o corpo do provedor e NUNCA gravava linha: a chamada paga de
// streaming era invisível. E o pior: os tokens eram gravados com `|| 0`, o que
// fazia "não medido" entrar nos relatórios como consumo zero.
const codificador = new TextEncoder();

function streamDe(partes: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controlador) {
      for (const parte of partes) controlador.enqueue(codificador.encode(parte));
      controlador.close();
    },
  });
}

async function consumir(corpo: ReadableStream<Uint8Array>): Promise<string> {
  const leitor = corpo.getReader();
  const decodificador = new TextDecoder();
  let texto = "";
  while (true) {
    const { done, value } = await leitor.read();
    if (done) break;
    texto += decodificador.decode(value, { stream: true });
  }
  return texto;
}

/** Embrulha o medidor sem corrida: o teste espera o desfecho pelo `await`. */
function medir(partes: string[]): {
  corpo: ReadableStream<Uint8Array>;
  desfecho: Promise<StreamOutcome>;
  vezes: () => number;
} {
  let chamadas = 0;
  let resolver: ((d: StreamOutcome) => void) | null = null;
  const desfecho = new Promise<StreamOutcome>((r) => {
    resolver = r;
  });
  const corpo = medirStream(streamDe(partes), (d) => {
    chamadas += 1;
    resolver?.(d);
  });
  assert(corpo !== null, "medirStream devolveu null para um corpo que existia");
  return { corpo: corpo!, desfecho, vezes: () => chamadas };
}

Deno.test("IA-053 extrairUsageDoStream: só medição declarada conta; o resto é ausência", () => {
  assertEquals(
    extrairUsageDoStream(
      'data: {"choices":[]}\n\ndata: {"usage":{"prompt_tokens":120,"completion_tokens":45}}\n\ndata: [DONE]\n\n',
    ),
    { inputTokens: 120, outputTokens: 45 },
  );
  assertEquals(
    extrairUsageDoStream('data: {"choices":[{"delta":{"content":"oi"}}]}\n\ndata: [DONE]\n\n'),
    null,
    "sem bloco de uso, o consumo é DESCONHECIDO — não zero",
  );
  assertEquals(
    extrairUsageDoStream('data: {"usage":{"prompt_tok'),
    null,
    "JSON cortado no meio do chunk não pode virar número",
  );
  assertEquals(
    extrairUsageDoStream('data: {"usage":{"prompt_tokens":0,"completion_tokens":0}}'),
    { inputTokens: 0, outputTokens: 0 },
    "uso declarado com zeros é medição de zero (≠ ausência)",
  );
});

Deno.test("IA-053 medirStream: entrega os bytes INTACTOS e mede o uso do último chunk", async () => {
  const partes = [
    'data: {"choices":[{"delta":{"content":"Olá"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":" mundo"}}]}\n\n',
    'data: {"usage":{"prompt_tokens":120,"completion_tokens":45}}\n\n',
    "data: [DONE]\n\n",
  ];
  const { corpo, desfecho, vezes } = medir(partes);

  const recebido = await consumir(corpo);
  assertEquals(recebido, partes.join(""), "o cliente recebeu bytes diferentes do original");

  const d = await desfecho;
  assertEquals(vezes(), 1, "o desfecho tem de ser registrado exatamente uma vez");
  assertEquals(d.completed, true);
  assertEquals(d.cancelled, false);
  assertEquals(d.error, null);
  assertEquals(d.usage, { inputTokens: 120, outputTokens: 45 });
  assertEquals(d.chunks, 4);
  assertEquals(d.bytes, codificador.encode(recebido).byteLength, "a contagem de bytes tem de bater");
});

Deno.test("IA-053 medirStream: cancelamento no meio é registrado como saída PARCIAL", async () => {
  const { corpo, desfecho, vezes } = medir([
    'data: {"choices":[{"delta":{"content":"a"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"b"}}]}\n\n',
  ]);

  const leitor = corpo.getReader();
  const primeiro = await leitor.read();
  assertEquals(primeiro.done, false, "esperava o primeiro chunk antes de cancelar");
  await leitor.cancel("cliente desligou");

  const d = await desfecho;
  assertEquals(d.cancelled, true, "o cancelamento tem de ficar visível no registro");
  assertEquals(d.completed, false, "stream cancelado não pode ser contado como concluído");
  assertEquals(d.usage, null, "sem uso declarado, o consumo é DESCONHECIDO");
  assertEquals(vezes(), 1, "cancelar depois de encerrar não pode registrar duas vezes");
});

Deno.test("IA-053 medirStream: falha no meio do stream vira registro com erro", async () => {
  let leituras = 0;
  const quebrado = new ReadableStream<Uint8Array>({
    pull(controlador) {
      leituras += 1;
      if (leituras === 1) {
        controlador.enqueue(codificador.encode('data: {"choices":[]}\n\n'));
        return;
      }
      controlador.error(new Error("conexao caiu"));
    },
  });

  let resolver: ((d: StreamOutcome) => void) | null = null;
  const desfecho = new Promise<StreamOutcome>((r) => {
    resolver = r;
  });
  const medido = medirStream(quebrado, (d) => resolver?.(d));
  assert(medido !== null);

  const leitor = medido!.getReader();
  await leitor.read();
  let lancou = false;
  try {
    await leitor.read();
  } catch {
    lancou = true;
  }
  assert(lancou, "a falha do stream tem de chegar ao consumidor");

  const d = await desfecho;
  assertEquals(d.error, "conexao caiu");
  assertEquals(d.completed, false);
  assertEquals(d.cancelled, false);
  assertEquals(d.usage, null);
});

Deno.test("IA-053 logAiUsage: consumo não medido grava NULL, e não zero", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubFetch();

  try {
    await logAiUsageDetached({ ...ENTRADA, usageUnknown: true, status: "success" });

    const linha = linhaEnviada(capturas);
    assert(linha !== null, "nenhuma linha foi enviada ao PostgREST");
    assertEquals(linha!.input_tokens, null, "consumo não medido virou 0: o relatório vai cobrar zero");
    assertEquals(linha!.output_tokens, null, "consumo não medido virou 0");
    assertEquals((linha!.metadata as Record<string, unknown>).usage_unknown, true);
    assert(houveInsert(capturas), "a execução de streaming tem de ser registrada mesmo sem medição");
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-053 logAiUsage: consumo medido grava o número e NÃO marca unknown", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubFetch();

  try {
    await logAiUsageDetached({ ...ENTRADA, inputTokens: 0, outputTokens: 45 });

    const linha = linhaEnviada(capturas);
    assert(linha !== null, "nenhuma linha foi enviada ao PostgREST");
    assertEquals(linha!.input_tokens, 0, "zero medido é um número, não ausência");
    assertEquals(linha!.output_tokens, 45);
    assert(
      !("usage_unknown" in ((linha!.metadata ?? {}) as Record<string, unknown>)),
      "medição não pode ser marcada como desconhecida",
    );
  } finally {
    restaurar();
    restaurarEnv();
  }
});

// ---------------------------------------------------------------------------
// (h) IA-054 — ação, tentativa e cobrança
// ---------------------------------------------------------------------------
// Aceite da etapa: "Totais de ações, tentativas, falhas e consumo se
// reconciliam com a execução observada", com o risco nomeado de DUPLA CONTAGEM
// por logs de fallback. Os testes abaixo são o que separa "reconciliar" de
// "somar linhas".
function linha(parcial: Partial<LinhaDeConsumo> & { id: string }): LinhaDeConsumo {
  return { status: "success", inputTokens: 10, outputTokens: 5, ...parcial };
}

Deno.test("IA-054 o fallback NÃO vira duas ações: origem que falhou + destino que atendeu", () => {
  const r = reconciliarConsumo([
    linha({ id: "l1", requestId: "req-1", status: "error", inputTokens: 30, outputTokens: 0 }),
    linha({ id: "l2", requestId: "req-1", status: "fallback", inputTokens: 40, outputTokens: 20 }),
  ]);

  assertEquals(r.acoes, 1, "um clique = UMA ação, mesmo com dois saltos de provedor");
  assertEquals(r.tentativas, 2, "duas chamadas ao provedor = duas tentativas");
  assertEquals(r.sucessos, 1, "o fallback que atendeu conta como sucesso");
  assertEquals(r.falhas, 1, "a origem que falhou continua sendo falha observada");
  assertEquals(r.acoesComMaisDeUmaTentativa, 1);
  assertEquals(r.tokensMedidos, 90, "os tokens são reais nas DUAS chamadas: somam");
});

Deno.test("IA-054 retry da fila: três tentativas do mesmo job continuam UMA ação", () => {
  const r = reconciliarConsumo([
    linha({ id: "t1", jobId: "job-9", attempt: 1, status: "error", inputTokens: 5, outputTokens: 0 }),
    linha({ id: "t2", jobId: "job-9", attempt: 2, status: "error", inputTokens: 5, outputTokens: 0 }),
    linha({ id: "t3", jobId: "job-9", attempt: 3, status: "success", inputTokens: 5, outputTokens: 9 }),
  ]);

  assertEquals(r.acoes, 1, "tentativa NÃO é ação");
  assertEquals(r.tentativas, 3);
  assertEquals(r.falhas, 2);
  assertEquals(r.sucessos, 1);
  assertEquals(r.acoesComMaisDeUmaTentativa, 1);
});

Deno.test("IA-054 consumo sem medição não entra na soma como zero", () => {
  const r = reconciliarConsumo([
    linha({ id: "l1", requestId: "req-1", inputTokens: null, outputTokens: null, usageUnknown: true }),
    linha({ id: "l2", requestId: "req-1", inputTokens: 10, outputTokens: 5 }),
  ]);

  assertEquals(r.linhasSemMedicao, 1, "a linha sem medição tem de ser declarada como tal");
  assertEquals(r.tokensMedidos, 15, "só o que foi medido soma — a outra JAMAIS entra como 0");
  assertEquals(r.acoes, 1);
  assertEquals(r.tentativas, 2);
});

Deno.test("IA-054 falha e cancelamento COM consumo cobram; negação sem chamada não", () => {
  const cobra = contaParaQuota(
    linha({ id: "x", status: "cancelled", inputTokens: 200, outputTokens: 0 }),
  );
  assertEquals(cobra.cobra, true, "stream interrompido que consumiu tokens gastou dinheiro");
  assertEquals(cobra.motivo, "medido_cancelled");

  const falha = contaParaQuota(linha({ id: "y", status: "error", inputTokens: 7, outputTokens: 3 }));
  assertEquals(falha.cobra, true, "falha após consumir também é gasto real");

  const negado = contaParaQuota(
    linha({ id: "z", status: "denied", inputTokens: null, outputTokens: null }),
  );
  assertEquals(negado.cobra, false, "negado por quota não chamou o provedor: não há o que cobrar");
  assertEquals(negado.motivo, "sem_chamada_ao_provedor");

  const semMedicao = contaParaQuota(
    linha({ id: "w", inputTokens: null, outputTokens: null, usageUnknown: true }),
  );
  assertEquals(semMedicao.cobra, false);
  assertEquals(semMedicao.motivo, "sem_medicao");

  // PRECEDÊNCIA: `usage_unknown` vence número residual. Se um dia um chamador
  // (ou um insert de outro caminho) gravar a marca de "não medido" junto de
  // valores, a marca manda — senão o relatório cobraria o que a própria linha
  // declara não ter sido medido.
  const unknownComNumeros = contaParaQuota(
    linha({ id: "v", usageUnknown: true, inputTokens: 99, outputTokens: 99 }),
  );
  assertEquals(unknownComNumeros.cobra, false, "`usage_unknown` tem PRECEDÊNCIA sobre resíduo");
  assertEquals(unknownComNumeros.motivo, "sem_medicao");
});

Deno.test("IA-054 a mesma linha duas vezes conta UMA (reentrega de insert não dobra)", () => {
  const uma = linha({ id: "l1", requestId: "req-1", inputTokens: 100, outputTokens: 50 });
  const r = reconciliarConsumo([uma, { ...uma }]);

  assertEquals(r.linhasDuplicadasIgnoradas, 1, "a repetição tem de ser visível no relatório");
  assertEquals(r.tentativas, 1);
  assertEquals(r.acoes, 1);
  assertEquals(r.tokensMedidos, 150, "dobrar a linha dobraria o custo");
});

Deno.test("IA-054 linha sem identidade de ação conta tentativa, nunca ação", () => {
  const r = reconciliarConsumo([linha({ id: "solto", requestId: null, jobId: null })]);

  assertEquals(r.acoes, 0, "não se inventa ação a partir de linha órfã");
  assertEquals(r.linhasSemIdentidadeDeAcao, 1, "a lacuna fica declarada, não escondida");
  assertEquals(r.tentativas, 1);
});

Deno.test("IA-054 identidade da ação: o clique manda, o job é o plano B", () => {
  assertEquals(identidadeDaAcao({ id: "a", requestId: "r1", jobId: "j1" }), "req:r1");
  assertEquals(identidadeDaAcao({ id: "b", requestId: null, jobId: "j1" }), "job:j1");
  assertEquals(identidadeDaAcao({ id: "c", requestId: null, jobId: null }), null);
});

Deno.test("IA-054 reconciliação vazia não inventa número", () => {
  const r = reconciliarConsumo([]);
  assertEquals(r.acoes, 0);
  assertEquals(r.tentativas, 0);
  assertEquals(r.tokensMedidos, 0);
});

// ---------------------------------------------------------------------------
// (i) IA-055 — tarifa versionada por vigência
// ---------------------------------------------------------------------------
// Aceite da etapa: "Um relatório histórico usa a tarifa aplicável e diferencia
// estimativa interna de custo reconciliado." Os dois erros que estes testes
// barram são silenciosos: (1) um reajuste de preço reescrevendo o relatório do
// passado e (2) "não sei o preço" entrando na conta como zero.
const TARIFA_SETEMBRO: TarifaDeModelo = {
  model: "deepseek-v4-pro",
  unit: "token",
  currency: "USD",
  unitPrice: 0.000001,
  validFrom: "2026-09-01T00:00:00Z",
  validTo: "2026-10-01T00:00:00Z",
};

const TARIFA_OUTUBRO: TarifaDeModelo = {
  model: "deepseek-v4-pro",
  unit: "token",
  currency: "USD",
  unitPrice: 0.000002,
  validFrom: "2026-10-01T00:00:00Z",
  validTo: null,
};

Deno.test("IA-055 reajuste de preço NÃO reescreve o relatório do passado", () => {
  const tarifas = [TARIFA_SETEMBRO, TARIFA_OUTUBRO];

  const setembro = calcularCusto(tarifas, {
    model: "deepseek-v4-pro",
    unit: "token",
    em: "2026-09-15T12:00:00Z",
    quantidade: 1_000_000,
  });
  const outubro = calcularCusto(tarifas, {
    model: "deepseek-v4-pro",
    unit: "token",
    em: "2026-10-15T12:00:00Z",
    quantidade: 1_000_000,
  });

  assertEquals(setembro.custo, 1, "setembro tem de usar a tarifa de SETEMBRO");
  assertEquals(outubro.custo, 2, "outubro usa a tarifa nova");
  assertEquals(setembro.moeda, "USD");
});

Deno.test("IA-055 fronteira da vigência: início inclusivo, fim exclusivo", () => {
  const tarifas = [TARIFA_SETEMBRO, TARIFA_OUTUBRO];

  const umSegundoAntes = tarifaAplicavel(tarifas, {
    model: "deepseek-v4-pro",
    unit: "token",
    em: "2026-09-30T23:59:59Z",
  });
  const noInstanteExato = tarifaAplicavel(tarifas, {
    model: "deepseek-v4-pro",
    unit: "token",
    em: "2026-10-01T00:00:00Z",
  });

  assertEquals(umSegundoAntes?.unitPrice, 0.000001, "um segundo antes vale a tarifa antiga");
  assertEquals(noInstanteExato?.unitPrice, 0.000002, "no instante da virada vale a nova");
  assert(
    umSegundoAntes !== null && noInstanteExato !== null,
    "a virada não pode deixar buraco: todo instante tem UMA tarifa",
  );
});

Deno.test("IA-055 sem tarifa vigente o custo é NULL, nunca zero", () => {
  const antesDeExistir = calcularCusto([TARIFA_SETEMBRO], {
    model: "deepseek-v4-pro",
    unit: "token",
    em: "2026-08-01T00:00:00Z",
    quantidade: 5000,
  });
  assertEquals(antesDeExistir.custo, null, "preço desconhecido não pode virar zero");
  assertEquals(antesDeExistir.motivo, "sem_tarifa_vigente");
  assertEquals(antesDeExistir.moeda, null);

  const modeloDesconhecido = calcularCusto([TARIFA_SETEMBRO], {
    model: "modelo-que-nao-existe",
    unit: "token",
    em: "2026-09-15T00:00:00Z",
    quantidade: 10,
  });
  assertEquals(modeloDesconhecido.custo, null);
  assertEquals(modeloDesconhecido.motivo, "sem_tarifa_vigente");
});

Deno.test("IA-055 unidade não se mistura: tarifa de segundo não paga token", () => {
  const porSegundo: TarifaDeModelo = {
    model: "deepseek-v4-pro",
    unit: "second",
    currency: "USD",
    unitPrice: 0.0002,
    validFrom: "2026-09-01T00:00:00Z",
  };

  const comoToken = calcularCusto([porSegundo], {
    model: "deepseek-v4-pro",
    unit: "token",
    em: "2026-09-15T00:00:00Z",
    quantidade: 1000,
  });
  assertEquals(comoToken.custo, null, "unidade diferente não é comparável: nada de converter por conta");
  assertEquals(comoToken.motivo, "sem_tarifa_vigente");

  const segundos = calcularCusto([porSegundo], {
    model: "deepseek-v4-pro",
    unit: "second",
    em: "2026-09-15T00:00:00Z",
    quantidade: 30,
  });
  assertEquals(segundos.custo, 0.006);
});

Deno.test("IA-055 empate de vigência: a tarifa reconciliada vence a interna", () => {
  const interna: TarifaDeModelo = { ...TARIFA_OUTUBRO, source: "internal" };
  const reconciliada: TarifaDeModelo = {
    ...TARIFA_OUTUBRO,
    unitPrice: 0.0000019,
    source: "provider_statement",
  };

  // A ordem do array NÃO pode decidir: o número conferido no extrato manda.
  for (const ordem of [[interna, reconciliada], [reconciliada, interna]]) {
    const escolhida = tarifaAplicavel(ordem, {
      model: "deepseek-v4-pro",
      unit: "token",
      em: "2026-10-15T00:00:00Z",
    });
    assertEquals(escolhida?.source, "provider_statement", "a tarifa conferida no extrato vence");
    assertEquals(escolhida?.unitPrice, 0.0000019);
  }
});

Deno.test("IA-055 o resultado declara a FONTE da tarifa usada", () => {
  const reconciliada: TarifaDeModelo = { ...TARIFA_SETEMBRO, source: "provider_statement" };
  const comFonte = calcularCusto([reconciliada], {
    model: "deepseek-v4-pro",
    unit: "token",
    em: "2026-09-15T00:00:00Z",
    quantidade: 100,
  });
  assertEquals(
    comFonte.fonte,
    "provider_statement",
    "o relatório precisa distinguir estimativa interna de custo reconciliado",
  );

  const semFonte = calcularCusto([TARIFA_SETEMBRO], {
    model: "deepseek-v4-pro",
    unit: "token",
    em: "2026-09-15T00:00:00Z",
    quantidade: 100,
  });
  assertEquals(semFonte.fonte, "internal", "sem marcação explícita, a tarifa é interna");
});

Deno.test("IA-055 zero medido ≠ preço ausente, e valor inválido não passa", () => {
  const zero = calcularCusto([TARIFA_SETEMBRO], {
    model: "deepseek-v4-pro",
    unit: "token",
    em: "2026-09-15T00:00:00Z",
    quantidade: 0,
  });
  assertEquals(zero.custo, 0, "zero medido é número: havia tarifa e não houve consumo");
  assertEquals(zero.motivo, "zero_medido");

  const negativo = calcularCusto([TARIFA_SETEMBRO], {
    model: "deepseek-v4-pro",
    unit: "token",
    em: "2026-09-15T00:00:00Z",
    quantidade: -1,
  });
  assertEquals(negativo.custo, null);
  assertEquals(negativo.motivo, "quantidade_invalida");

  const nan = calcularCusto([TARIFA_SETEMBRO], {
    model: "deepseek-v4-pro",
    unit: "token",
    em: "2026-09-15T00:00:00Z",
    quantidade: Number.NaN,
  });
  assertEquals(nan.motivo, "quantidade_invalida");

  const tarifaRuim = calcularCusto([{ ...TARIFA_SETEMBRO, unitPrice: -1 }], {
    model: "deepseek-v4-pro",
    unit: "token",
    em: "2026-09-15T00:00:00Z",
    quantidade: 10,
  });
  assertEquals(tarifaRuim.custo, null);
  assertEquals(tarifaRuim.motivo, "tarifa_invalida");
});

// ---------------------------------------------------------------------------
// (j) IA-TIMEOUT-001 — log essencial durável: IDENTIDADE ÚNICA POR EVENTO no
// banco (UNIQUE + ON CONFLICT) e OUTBOX persistente para o que falhar
// ---------------------------------------------------------------------------
// O que a rodada anterior errou, medido na recusa: `metadata.log_key` era uma
// chave por CONTEÚDO (consumos legítimos idênticos colapsam) e a "idempotência"
// era consultar-antes-de-inserir — sem restrição UNIQUE no banco, dois inserts
// concorrentes passam pela checagem e duplicam a cobrança. E o que sobrava de
// falha ia para `console.warn`: fora do banco, sem reprocessamento.
//
// O contrato que estes testes fixam:
//   1. event_id: identidade ÚNICA gerada no produtor, independente de conteúdo,
//      imposta no banco por UNIQUE + upsert (`on_conflict=event_id`,
//      `resolution=ignore-duplicates`) — NUNCA consultar-antes-de-inserir;
//   2. reentrega do MESMO evento não duplica nem perde; conteúdo idêntico com
//      evento distinto grava DUAS linhas;
//   3. toda falha — do insert esgotado E de qualquer passo antes/depois dele —
//      persiste na OUTBOX durável (`ai_usage_outbox`), reprocessável por
//      leitura da própria outbox; console é só o ÚLTIMO recurso.

/**
 * Banco falso que honra o contrato real do PostgREST:
 *  - `ai_usage_logs` tem UNIQUE(event_id): POST com `on_conflict` e
 *    `resolution=ignore-duplicates` devolve `[]` quando o evento já existe;
 *  - `ai_usage_outbox` persiste falhas (POST), expõe pendentes (GET) e aceita
 *    baixa (PATCH);
 *  - `posts` simula respostas do insert: `{status, grava}` — `grava: true` com
 *    status de erro é a "resposta perdida depois da escrita".
 */
function stubBancoDeLog(opts: {
  posts?: Array<{ status: number; grava?: boolean }>;
  outboxStatus?: number;
  falharBaixaUmaVez?: boolean;
} = {}) {
  const capturas: Captura[] = [];
  const tabela = new Map<string, Record<string, unknown>>();
  const outbox: Array<Record<string, unknown>> = [];
  let postsCfg = opts.posts ?? [{ status: 201 }];
  let posts = 0;
  let falharBaixaUmaVez = opts.falharBaixaUmaVez ?? false;
  const outboxStatus = opts.outboxStatus ?? 201;
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
    const metodo = init?.method ?? "GET";
    let corpo: unknown = null;
    try {
      corpo = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      corpo = init?.body ?? null;
    }
    capturas.push({
      metodo,
      url,
      corpo,
      cabecalhos: (init?.headers ?? {}) as Record<string, unknown>,
    });

    if (url.includes("/rest/v1/ai_usage_logs") && metodo === "POST") {
      const cfg = postsCfg[Math.min(posts, postsCfg.length - 1)];
      posts += 1;
      const linha = corpo as Record<string, unknown> | null;
      const eventId = linha?.event_id as string | undefined;
      if (eventId && tabela.has(eventId)) return json([], 200); // ON CONFLICT DO NOTHING
      const gravou = cfg.grava ?? (cfg.status >= 200 && cfg.status < 300);
      if (gravou && eventId) tabela.set(eventId, linha!);
      if (cfg.status >= 200 && cfg.status < 300) return json([linha], cfg.status);
      return json({ message: "insert falhou" }, cfg.status);
    }
    if (url.includes("/rest/v1/ai_usage_outbox") && metodo === "POST") {
      if (outboxStatus >= 300) return json({ message: "outbox falhou" }, outboxStatus);
      const linha = corpo as Record<string, unknown>;
      if (linha?.event_id && outbox.some((r) => r.event_id === linha.event_id)) {
        return json([], 200);
      }
      outbox.push({
        id: `ob-${outbox.length + 1}`,
        tentativas: 0,
        processed_at: null,
        ...linha,
      });
      return json([linha], outboxStatus);
    }
    if (url.includes("/rest/v1/ai_usage_outbox") && metodo === "GET") {
      return json(outbox.filter((r) => r.processed_at === null));
    }
    if (url.includes("/rest/v1/ai_usage_outbox") && metodo === "PATCH") {
      const porId = url.match(/(?:[?&])id=eq\.([^&]+)/);
      const porEvento = url.match(/event_id=eq\.([^&]+)/);
      const exigeEventoNulo = url.includes("event_id=is.null");
      const exigeEntregue = url.includes("processed_at=not.is.null");
      const campos = corpo as Record<string, unknown>;
      if (campos.processed_at !== undefined && falharBaixaUmaVez) {
        falharBaixaUmaVez = false;
        return json({ message: "baixa falhou" }, 500);
      }
      const alteradas: Array<Record<string, unknown>> = [];
      for (const r of outbox) {
        const casa = porEvento
          ? r.event_id === decodeURIComponent(porEvento[1]) &&
            (!exigeEntregue || r.processed_at !== null)
          : (!porId || r.id === decodeURIComponent(porId[1])) &&
            (!exigeEventoNulo || r.event_id === null);
        if (casa) {
          Object.assign(r, campos);
          alteradas.push({ ...r });
        }
      }
      return json(alteradas);
    }
    return json([]);
  }) as typeof fetch;

  return {
    capturas,
    tabela,
    outbox,
    setPosts: (p: Array<{ status: number; grava?: boolean }>) => {
      postsCfg = p;
      posts = 0;
    },
    restaurar: () => {
      globalThis.fetch = original;
    },
  };
}

const postsEmAiUsageLogs = (capturas: Captura[]) =>
  capturas.filter((c) => c.metodo === "POST" && c.url.includes("/rest/v1/ai_usage_logs"));

const postsNaOutbox = (capturas: Captura[]) =>
  capturas.filter((c) => c.metodo === "POST" && c.url.includes("/rest/v1/ai_usage_outbox"));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Espia console.error e devolve o restaurador. */
function espiarConsoleError(): { mensagens: string[]; restaurar: () => void } {
  const mensagens: string[] = [];
  const original = console.error;
  console.error = (...partes: unknown[]) => {
    mensagens.push(partes.map(String).join(" "));
  };
  return { mensagens, restaurar: () => { console.error = original; } };
}

Deno.test("IA-TIMEOUT-001 a linha leva event_id gerado no produtor e o insert é UPSERT por ON CONFLICT", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubBancoDeLog();

  try {
    await logAiUsage(ENTRADA);

    const post = postsEmAiUsageLogs(capturas)[0];
    assert(post, "nenhum insert foi enviado ao PostgREST");
    assert(
      post.url.includes("on_conflict=event_id"),
      "o insert tem de ser UPSERT ancorado na restrição UNIQUE de event_id",
    );
    const prefer = String(post.cabecalhos?.Prefer ?? post.cabecalhos?.prefer ?? "");
    assert(
      prefer.includes("ignore-duplicates"),
      "reentrega do mesmo evento tem de virar DO NOTHING, não segunda linha",
    );

    const linha = post.corpo as Record<string, unknown>;
    assert(
      typeof linha.event_id === "string" && UUID_RE.test(linha.event_id),
      "o produtor tem de gerar a identidade do evento (uuid) na linha",
    );

    const consultas = capturas.filter(
      (c) => c.metodo === "GET" && c.url.includes("/rest/v1/ai_usage_logs"),
    );
    assertEquals(
      consultas.length,
      0,
      "consultar-antes-de-inserir admite corrida: a unicidade é do BANCO, não de um SELECT",
    );
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-TIMEOUT-001 conteúdo idêntico com eventos distintos grava DUAS linhas (não colapsa)", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, tabela, restaurar } = stubBancoDeLog();

  try {
    await logAiUsage(ENTRADA);
    await logAiUsage(ENTRADA); // mesmo conteúdo, evento NOVO

    const posts = postsEmAiUsageLogs(capturas);
    assertEquals(posts.length, 2, "dois consumos legítimos = dois inserts");
    const ids = posts.map((c) => (c.corpo as Record<string, unknown>).event_id);
    assert(ids[0] !== ids[1], "a identidade é do EVENTO, não do conteúdo");
    assertEquals(
      tabela.size,
      2,
      "consumos legítimos idênticos não podem colapsar por chave de conteúdo",
    );
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-TIMEOUT-001 reentrega do MESMO evento não duplica nem perde", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, tabela, outbox, restaurar } = stubBancoDeLog();
  const EVENTO = "7b3f1a2c-9d4e-4f50-8a6b-1c2d3e4f5a6b";

  try {
    // O mesmo evento entregue duas vezes (reentrada/concorrência no produtor).
    await Promise.all([
      logAiUsage({ ...ENTRADA, eventId: EVENTO }),
      logAiUsage({ ...ENTRADA, eventId: EVENTO }),
    ]);

    assertEquals(postsEmAiUsageLogs(capturas).length, 2, "as duas entregas tentam gravar");
    assertEquals(
      tabela.size,
      1,
      "o UNIQUE do banco colapsa a reentrega em UMA linha — sem depender de checagem prévia",
    );
    assertEquals(
      outbox.length,
      0,
      "o evento foi entregue nas duas tentativas: nada pode ir para a outbox",
    );
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-TIMEOUT-001 resposta perdida DEPOIS da escrita: a restrição impede a duplicata", async () => {
  const restaurarEnv = stubEnv();
  // O primeiro POST GRAVOU no servidor, mas o cliente viu 500. O reenvio bate
  // na UNIQUE — é o banco que decide, não uma consulta que admite corrida.
  const { capturas, tabela, outbox, restaurar } = stubBancoDeLog({
    posts: [{ status: 500, grava: true }],
  });

  try {
    await logAiUsage(ENTRADA);

    assertEquals(
      postsEmAiUsageLogs(capturas).length,
      2,
      "o 500 transitório retenta — e a segunda tentativa é absorvida pela restrição",
    );
    assertEquals(tabela.size, 1, "reenviar o que já gravou não pode duplicar a cobrança");
    assertEquals(outbox.length, 0, "consumo entregue não é falha: a outbox fica vazia");
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-TIMEOUT-001 falha transitória retenta e o consumo TERMINA gravado", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, tabela, outbox, restaurar } = stubBancoDeLog({
    posts: [{ status: 500 }, { status: 201 }],
  });

  try {
    await logAiUsage(ENTRADA);

    assertEquals(postsEmAiUsageLogs(capturas).length, 2, "o 500 tinha de ser retentado");
    assertEquals(tabela.size, 1, "o consumo terminou gravado");
    assertEquals(outbox.length, 0, "sucesso na retentativa não gera registro de falha");
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-TIMEOUT-001 insert esgotado vai para a OUTBOX durável e reprocessa UMA vez", async () => {
  const restaurarEnv = stubEnv();
  const espioes = espiarConsoleError();
  const stub = stubBancoDeLog({ posts: [{ status: 500 }, { status: 500 }, { status: 500 }] });

  try {
    await logAiUsage(ENTRADA);
    assertEquals(postsEmAiUsageLogs(stub.capturas).length, 3, "o insert tinha de ir até o teto");
    assertEquals(
      postsNaOutbox(stub.capturas).length,
      1,
      "a falha tem de persistir na outbox — console.warn sozinho não é durável nem reprocessável",
    );
    assertEquals(stub.outbox.length, 1);
    assertEquals(
      stub.outbox[0].processed_at,
      null,
      "o registro fica PENDENTE até um reprocessamento confirmar a entrega",
    );
    const payload = stub.outbox[0].payload as Record<string, unknown>;
    const linhaOutbox = payload.linha as Record<string, unknown>;
    assert(linhaOutbox, "a outbox carrega a linha pronta para reenvio");
    assertEquals(
      linhaOutbox.event_id,
      stub.outbox[0].event_id,
      "a identidade do evento é a mesma da linha — o reenvio reencontra o evento",
    );
    assert(
      !espioes.mensagens.some((m) => m.includes("LOG-ESSENCIAL-PERDIDO")),
      "com a outbox durável disponível, o marcador de último recurso não dispara",
    );

    // Reprocessamento por LEITURA DA OUTBOX: banco saudável, entrega confirma.
    stub.setPosts([{ status: 201 }]);
    const r1 = await reprocessarOutboxDeLog();
    assertEquals(r1.lidos, 1);
    assertEquals(r1.gravados, 1, "o pendente foi entregue ao log");
    assertEquals(stub.tabela.size, 1);
    assert(
      stub.outbox[0].processed_at !== null,
      "entrega confirmada tira o registro da fila (processed_at)",
    );

    // Segundo reprocessamento: nada pendente, nenhum POST novo — sem duplicata.
    const postsAntes = postsEmAiUsageLogs(stub.capturas).length;
    const r2 = await reprocessarOutboxDeLog();
    assertEquals(r2.lidos, 0, "a fila processada não volta a aparecer");
    assertEquals(
      postsEmAiUsageLogs(stub.capturas).length,
      postsAntes,
      "reprocessar o que já foi entregue NÃO pode gerar novo insert",
    );
  } finally {
    stub.restaurar();
    espioes.restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-TIMEOUT-001 pendente cuja linha JÁ existe é baixado sem novo consumo (sem duplicar)", async () => {
  const restaurarEnv = stubEnv();
  // O POST é PERMANENTE (400) mas GRAVOU no servidor — falha sem retentativa,
  // e a linha está lá. A outbox recebe o pendente; o reprocessamento confirma
  // a existência pela restrição (ON CONFLICT → []) e baixa o registro.
  const stub = stubBancoDeLog({ posts: [{ status: 400, grava: true }] });

  try {
    await logAiUsage(ENTRADA);
    assertEquals(stub.outbox.length, 1, "o cliente viu falha: o registro vai para a outbox");
    assertEquals(stub.tabela.size, 1, "mas a linha está gravada no servidor");

    stub.setPosts([{ status: 201 }]);
    const r = await reprocessarOutboxDeLog();
    assertEquals(r.lidos, 1);
    assertEquals(r.gravados, 0, "não pode gravar de novo: seria cobrança dupla");
    assertEquals(r.jaExistiam, 1, "a restrição confirmou a linha existente");
    assertEquals(stub.tabela.size, 1);
    assert(stub.outbox[0].processed_at !== null, "pendência confirmada sai da fila");
  } finally {
    stub.restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-TIMEOUT-001 falha EXTERNA ao insert vai para a outbox durável — sem catch mudo", async () => {
  const restaurarEnv = stubEnv();
  // Quebra um passo ANTES do insert (a geração da identidade do evento): o
  // defeito apontado era a falha externa cair no catch com console.warn.
  const original = Crypto.prototype.randomUUID;
  Crypto.prototype.randomUUID = () => {
    throw new Error("rng indisponivel");
  };
  const stub = stubBancoDeLog();

  try {
    await logAiUsage(ENTRADA);

    assertEquals(
      postsEmAiUsageLogs(stub.capturas).length,
      0,
      "a falha foi anterior ao insert — nenhum POST em ai_usage_logs",
    );
    assertEquals(
      postsNaOutbox(stub.capturas).length,
      1,
      "a falha externa tinha de virar registro DURÁVEL na outbox",
    );
    assert(String(stub.outbox[0].motivo).includes("rng indisponivel"));
    const payload = stub.outbox[0].payload as Record<string, unknown>;
    assert(
      payload.entrada !== undefined && payload.entrada !== null,
      "sem linha montada, a outbox guarda a ENTRADA para remontar no reprocessamento",
    );
  } finally {
    Crypto.prototype.randomUUID = original;
    stub.restaurar();
  }

  // Com o runtime saudável, o pendente de entrada remonta a linha e entrega.
  const stub2 = stubBancoDeLog({ posts: [{ status: 201 }] });
  try {
    // Mesma fila: o stub novo começa vazio — injetamos o registro pendente.
    stub2.outbox.push({
      id: "ob-ext-1",
      event_id: null,
      tentativas: 0,
      processed_at: null,
      payload: { entrada: ENTRADA },
      motivo: "rng indisponivel",
    });

    const r = await reprocessarOutboxDeLog();
    assertEquals(r.lidos, 1);
    assertEquals(r.gravados, 1, "a entrada pendente remonta a linha e entrega");
    assertEquals(stub2.tabela.size, 1);
    const [linhaEntregue] = [...stub2.tabela.values()];
    assert(
      typeof linhaEntregue.event_id === "string" && UUID_RE.test(linhaEntregue.event_id),
      "o reprocessamento gera a identidade que faltou — a linha sempre nasce com event_id",
    );
    assert(stub2.outbox[0].processed_at !== null, "pendência externa também sai da fila");
  } finally {
    stub2.restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-TIMEOUT-001 baixa falha e segunda passada reutiliza event_id persistido", async () => {
  const restaurarEnv = stubEnv();
  const stub = stubBancoDeLog({ posts: [{ status: 201 }], falharBaixaUmaVez: true });
  stub.outbox.push({
    id: "ob-sem-evento",
    event_id: null,
    tentativas: 0,
    processed_at: null,
    payload: { entrada: ENTRADA },
    motivo: "falha antes da identidade",
  });

  try {
    const primeira = await reprocessarOutboxDeLog();
    assertEquals(primeira.gravados, 1, "o primeiro upsert grava o consumo");
    assertEquals(stub.tabela.size, 1);
    assertEquals(stub.outbox[0].processed_at, null, "a baixa simulada falhou");
    const eventoPersistido = stub.outbox[0].event_id;
    assert(
      typeof eventoPersistido === "string" && UUID_RE.test(eventoPersistido),
      "o UUID precisa estar persistido na outbox ANTES do upsert",
    );
    const indiceReserva = stub.capturas.findIndex(
      (captura) =>
        captura.metodo === "PATCH" &&
        captura.url.includes("/rest/v1/ai_usage_outbox") &&
        captura.url.includes("event_id=is.null") &&
        (captura.corpo as Record<string, unknown>)?.event_id === eventoPersistido,
    );
    const indicePrimeiroUpsert = stub.capturas.findIndex(
      (captura) => captura.metodo === "POST" && captura.url.includes("/rest/v1/ai_usage_logs"),
    );
    assert(indiceReserva >= 0, "a reserva usa PATCH condicionado a event_id IS NULL");
    assert(indiceReserva < indicePrimeiroUpsert, "a identidade é persistida antes do upsert");

    const segunda = await reprocessarOutboxDeLog();
    assertEquals(segunda.jaExistiam, 1, "a segunda passada reencontra o mesmo evento");
    assertEquals(stub.tabela.size, 1, "falha da baixa não pode criar segunda cobrança");
    assert(stub.outbox[0].processed_at !== null, "a segunda baixa conclui a pendência");

    const eventosEnviados = postsEmAiUsageLogs(stub.capturas).map(
      (captura) => (captura.corpo as Record<string, unknown>).event_id,
    );
    assertEquals(eventosEnviados.length, 2);
    assertEquals(eventosEnviados[0], eventoPersistido);
    assertEquals(eventosEnviados[1], eventoPersistido);
  } finally {
    stub.restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-TIMEOUT-001 outbox indisponível: o marcador de console é o ÚLTIMO recurso", async () => {
  const restaurarEnv = stubEnv();
  const espioes = espiarConsoleError();
  const { capturas, restaurar } = stubBancoDeLog({
    posts: [{ status: 500 }, { status: 500 }, { status: 500 }],
    outboxStatus: 500,
  });

  try {
    await logAiUsage(ENTRADA);

    assert(
      postsNaOutbox(capturas).length >= 1,
      "a outbox durável tem de ser tentada ANTES de qualquer marcador",
    );
    assert(
      espioes.mensagens.some((m) => m.includes("[ai-usage][LOG-ESSENCIAL-PERDIDO]")),
      "se nem a outbox grava, a única saída que resta é o marcador observável",
    );
  } finally {
    restaurar();
    espioes.restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-TIMEOUT-001 outbox JA ENTREGUE volta a fila quando o mesmo evento falha de novo", async () => {
  const restaurarEnv = stubEnv();
  const stub = stubBancoDeLog({ posts: [{ status: 400 }] });
  const EVENTO = "1f2e3d4c-5b6a-4789-8abc-0d1e2f3a4b5c";

  try {
    // Registro JÁ ENTREGUE (processed_at preenchido) do mesmo evento: ele veio
    // do banco, não foi criado por este stub.
    stub.outbox.push({
      id: "ob-ja-entregue",
      event_id: EVENTO,
      tentativas: 3,
      processed_at: "2026-10-05T12:00:00.000Z",
      payload: { linha: { event_id: EVENTO } },
      motivo: "antigo",
    });

    // O MESMO evento falha de novo com falha PERMANENTE (400, sem retentativa):
    // o UNIQUE(event_id) absorveria a duplicata — a falha nova ficaria perdida
    // se o registro entregue não voltasse para a fila.
    await logAiUsage({ ...ENTRADA, eventId: EVENTO });

    assertEquals(postsEmAiUsageLogs(stub.capturas).length, 1, "a falha permanente não retenta");
    assertEquals(stub.outbox.length, 1, "não duplica o registro da outbox");
    assertEquals(
      stub.outbox[0].processed_at,
      null,
      "registro entregue cujo evento falhou de novo VOLTA para a fila (durável, não silenciado)",
    );
    assert(
      postsNaOutbox(stub.capturas).length >= 1,
      "a outbox foi o destino — não um console.warn",
    );

    // E o reprocessamento entrega de verdade, sem duplicar cobrança.
    stub.setPosts([{ status: 201 }]);
    const r = await reprocessarOutboxDeLog();
    assertEquals(r.lidos, 1);
    assertEquals(r.gravados, 1);
    assertEquals(stub.tabela.size, 1);
    assert(stub.outbox[0].processed_at !== null, "entregue de novo, sai da fila");
  } finally {
    stub.restaurar();
    restaurarEnv();
  }
});
