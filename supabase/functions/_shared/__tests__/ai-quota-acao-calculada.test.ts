// IA-QUOTA-001 — ação, tentativa e cobrança ligadas à quota REAL.
//
// Defeito do cartão (item 42): os handlers calculados `ai-churn-analysis` e
// `ai-classify-tickets` passavam pelo `enforceAiGuards` — cuja quota diária
// CONTA linhas de `ai_usage_logs` por (user_id, function_name) — sem jamais
// gravar a linha. Ação admitida, consumo nunca registrado: a quota dessas duas
// funções era decorativa.
//
// A correção expõe `registrarAcaoCalculada` (`_shared/ai-usage.ts`), que grava
// UMA linha por resposta da ação admitida, e os dois handlers a chamam DEPOIS
// da guarda. Estes testes provam:
//   (a) runtime — a linha chega ao PostgREST com tokens NULL (consumo não
//       medido, regra 3 da IA-054), status da resposta real e o request_id do
//       cliente quando é uuid;
//   (b) reconciliação — a linha emitida entra em `reconciliarConsumo` como
//       1 ação + 1 tentativa e NÃO é somada como cobrança de tokens;
//   (c) fiação — guarda de origem (mesmo estilo de `ai-jobs-worker/index.test.ts`):
//       cada handler chama o registrador após a guarda, com o MESMO functionName
//       que a guarda usa, e só devolve a resposta depois de registrar.
//
// Sem rede real: o `globalThis.fetch` é substituído por um espião que captura o
// PostgREST do supabase-js (mesmo padrão de `_shared/ai-usage.test.ts`).
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
//   supabase/functions/_shared/__tests__/ai-quota-acao-calculada.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  contaParaQuota,
  identidadeDaAcao,
  reconciliarConsumo,
  registrarAcaoCalculada,
  type LinhaDeConsumo,
} from "../ai-usage.ts";

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

/** Espião de fetch: captura as chamadas PostgREST e responde 201. */
function stubFetch(): { capturas: Captura[]; restaurar: () => void } {
  const capturas: Captura[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    let corpo: unknown = null;
    try {
      corpo = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      corpo = init?.body ?? null;
    }
    capturas.push({ metodo: init?.method ?? "GET", url: String(input), corpo });
    return Promise.resolve(
      new Response("", { status: 201, headers: { "content-type": "application/json" } }),
    );
  }) as typeof fetch;
  return { capturas, restaurar: () => { globalThis.fetch = original; } };
}

/** A linha que o PostgREST recebeu (o supabase-js manda objeto ou [objeto]). */
function linhaEnviada(capturas: Captura[]): Record<string, unknown> | null {
  const post = capturas.find(
    (c) => c.metodo === "POST" && c.url.includes("/rest/v1/ai_usage_logs"),
  );
  if (!post || post.corpo === null) return null;
  const corpo = post.corpo as Record<string, unknown> | Record<string, unknown>[];
  return (Array.isArray(corpo) ? corpo[0] : corpo ?? null) as Record<string, unknown> | null;
}

const UUID = "9f4c1e2a-1b3d-4c5e-8a7b-0d1e2f3a4b5c";
const USUARIO = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

// ---------------------------------------------------------------------------
// (a) a ação admitida vira UMA linha em ai_usage_logs — é ela que a quota conta
// ---------------------------------------------------------------------------
Deno.test("registrarAcaoCalculada: a ação grava uma linha que a quota diária conta", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubFetch();

  try {
    const req = new Request("https://exemplo.test/functions/v1/ai-churn-analysis", {
      method: "POST",
      headers: { "x-ai-request-id": UUID },
    });
    await registrarAcaoCalculada({
      functionName: "ai-churn-analysis",
      userId: USUARIO,
      req,
      resposta: new Response("{}", { status: 200 }),
      inicio: Date.now(),
    });

    const linha = linhaEnviada(capturas);
    assert(linha !== null, "nenhuma linha foi enviada a ai_usage_logs — a ação não entrou na quota");
    // A quota conta por (user_id, function_name): os dois têm de ser os mesmos da guarda.
    assertEquals(linha!.user_id, USUARIO, "a linha não carrega o usuário da ação");
    assertEquals(linha!.function_name, "ai-churn-analysis", "a linha não carrega a função da ação");
    assertEquals(linha!.request_id, UUID, "a identidade da ação (x-ai-request-id) não chegou ao log");
    assertEquals(linha!.status, "success", "resposta 200 tinha de gravar status=success");
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("registrarAcaoCalculada: resposta de erro também conta (ação falhou, não sumiu)", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubFetch();

  try {
    await registrarAcaoCalculada({
      functionName: "ai-classify-tickets",
      userId: USUARIO,
      req: new Request("https://exemplo.test/functions/v1/ai-classify-tickets", { method: "POST" }),
      resposta: new Response("{}", { status: 500 }),
      inicio: Date.now(),
    });

    const linha = linhaEnviada(capturas);
    assert(linha !== null, "resposta de erro não gerou linha — ação admitida ficou de fora da quota");
    assertEquals(linha!.status, "error", "o status da linha tem de refletir a resposta real");
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("registrarAcaoCalculada: sem modelo não há consumo medido — tokens NULL, nunca zero", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubFetch();

  try {
    await registrarAcaoCalculada({
      functionName: "ai-churn-analysis",
      userId: USUARIO,
      req: new Request("https://exemplo.test/", { method: "POST" }),
      resposta: new Response("{}", { status: 200 }),
      inicio: Date.now(),
    });

    const linha = linhaEnviada(capturas);
    assert(linha !== null, "nenhuma linha foi enviada a ai_usage_logs");
    assertEquals(linha!.input_tokens, null, "handler calculado gravou tokens de entrada: medição inventada");
    assertEquals(linha!.output_tokens, null, "handler calculado gravou tokens de saída: medição inventada");
    const md = (linha!.metadata ?? {}) as Record<string, unknown>;
    assertEquals(md.usage_unknown, true, "a linha tem de declarar que o consumo não foi medido");
    assertEquals(md.acao_calculada, true, "a linha tem de se identificar como ação sem modelo");
  } finally {
    restaurar();
    restaurarEnv();
  }
});

// ---------------------------------------------------------------------------
// (b) a linha emitida reconcilia: 1 ação, 1 tentativa, e NÃO vira cobrança
// ---------------------------------------------------------------------------
Deno.test("a linha da ação calculada reconcilia como tentativa sem cobrança de tokens", async () => {
  const restaurarEnv = stubEnv();
  const { capturas, restaurar } = stubFetch();

  try {
    const req = new Request("https://exemplo.test/", {
      method: "POST",
      headers: { "x-ai-request-id": UUID },
    });
    await registrarAcaoCalculada({
      functionName: "ai-churn-analysis",
      userId: USUARIO,
      req,
      resposta: new Response("{}", { status: 200 }),
      inicio: Date.now(),
    });

    const linha = linhaEnviada(capturas);
    assert(linha !== null, "nenhuma linha foi enviada a ai_usage_logs");
    const consumo: LinhaDeConsumo = {
      id: "linha-1",
      requestId: linha!.request_id as string | null,
      status: linha!.status as string,
      inputTokens: linha!.input_tokens as number | null,
      outputTokens: linha!.output_tokens as number | null,
      usageUnknown: ((linha!.metadata as Record<string, unknown>)?.usage_unknown === true),
    };

    const veredito = contaParaQuota(consumo);
    assertEquals(
      veredito,
      { cobra: false, motivo: "sem_medicao" },
      "ação sem modelo não pode virar cobrança de tokens",
    );
    assertEquals(
      identidadeDaAcao(consumo),
      `req:${UUID}`,
      "a linha sem identidade de ação não reconcilia com o clique do usuário",
    );

    const totais = reconciliarConsumo([consumo]);
    assertEquals(totais.acoes, 1, "uma ação admitida tem de reconciliar como UMA ação");
    assertEquals(totais.tentativas, 1);
    assertEquals(totais.tokensMedidos, 0);
    assertEquals(totais.linhasCobradas, 0);
  } finally {
    restaurar();
    restaurarEnv();
  }
});

// ---------------------------------------------------------------------------
// (c) fiação: cada handler calculado liga a ação à quota DEPOIS da guarda
// ---------------------------------------------------------------------------
const HANDLERS: Array<{ slug: string; arquivo: string }> = [
  { slug: "ai-churn-analysis", arquivo: "../../ai-churn-analysis/index.ts" },
  { slug: "ai-classify-tickets", arquivo: "../../ai-classify-tickets/index.ts" },
];

for (const { slug, arquivo } of HANDLERS) {
  Deno.test(`${slug}: a ação admitida é registrada em ai_usage_logs (senão a quota não a vê)`, async () => {
    const fonte = await Deno.readTextFile(new URL(arquivo, import.meta.url));

    const posGuarda = fonte.indexOf("enforceAiGuards(");
    assert(posGuarda >= 0, `${slug} não passa mais pela guarda de IA (o código mudou?)`);

    // A linha só existe se o handler chamar o registrador — e DEPOIS da guarda:
    // registrar antes contaria ações negadas (regra 4 da IA-054).
    const posRegistro = fonte.indexOf("await registrarAcaoCalculada(", posGuarda);
    assert(
      posRegistro > posGuarda,
      `${slug} não chama \`await registrarAcaoCalculada\` após enforceAiGuards: ` +
        "a ação passa pela guarda sem virar linha em ai_usage_logs e a quota diária nunca a conta",
    );

    // A quota conta por (user_id, function_name): o slug registrado TEM de ser o
    // mesmo da guarda, senão a linha cai em outra função e a quota segue cega.
    const guarda = fonte.slice(posGuarda, fonte.indexOf(")", posGuarda));
    assert(
      guarda.includes(`functionName: "${slug}"`),
      `${slug}: enforceAiGuards não usa o slug "${slug}" (o código mudou?)`,
    );
    const registro = fonte.slice(posRegistro, fonte.indexOf("})", posRegistro));
    assert(
      registro.includes(`functionName: "${slug}"`),
      `${slug}: a linha de consumo tem de usar o MESMO functionName da guarda ("${slug}")`,
    );

    // O status da linha vem da resposta real — um literal "success" gravaria
    // sucesso em resposta de erro e a reconciliação mentiria as falhas.
    assert(
      registro.includes("resposta") && registro.includes("inicio"),
      `${slug}: o registro tem de levar a resposta produzida e o início da ação`,
    );
  });
}
