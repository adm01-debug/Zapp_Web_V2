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
// O insert é observado pelo `globalThis.fetch` (o PostgREST do supabase-js), sem
// rede real: nenhuma credencial, nenhum banco.
//
// Run with: deno test --allow-env --allow-net --allow-read \
//   supabase/functions/_shared/ai-usage.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { logAiUsageDetached } from "./ai-usage.ts";

type EdgeRuntimeType = { waitUntil?: (promise: Promise<unknown>) => void };
const edgeGlobal = globalThis as { EdgeRuntime?: EdgeRuntimeType };

type Captura = { metodo: string; url: string };

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
    capturas.push({ metodo: init?.method ?? "GET", url });
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
