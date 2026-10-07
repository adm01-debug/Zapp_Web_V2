// IA-TIMEOUT-001 — a outbox de log essencial tem consumidor real e restrito.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/ai-usage-outbox-drain/index.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { handleAiUsageOutboxDrain } from "./index.ts";

type Chamada = { url: string; metodo: string; corpo: Record<string, unknown> | null };

const SERVICE_KEY = "service-role-local";
const EVENTO = "7b3f1a2c-9d4e-4f50-8a6b-1c2d3e4f5a6b";

function withEnv(): () => void {
  const prevUrl = Deno.env.get("SUPABASE_URL");
  const prevKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_URL", "https://local.supabase.test");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  return () => {
    if (prevUrl === undefined) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", prevUrl);
    if (prevKey === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", prevKey);
  };
}

function json(valor: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(valor), {
    status,
    headers: { "content-type": "application/json" },
  }));
}

function stubFetchOutbox(): { chamadas: Chamada[]; restaurar: () => void } {
  const chamadas: Chamada[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const metodo = init?.method ?? "GET";
    let corpo: Record<string, unknown> | null = null;
    try {
      corpo = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    } catch {
      corpo = null;
    }
    chamadas.push({ url, metodo, corpo });

    if (url.includes("/rest/v1/rpc/ai_usage_outbox_pending") && metodo === "POST") {
      return json([
        {
          id: "ob-1",
          event_id: EVENTO,
          tentativas: 0,
          payload: {
            linha: {
              event_id: EVENTO,
              function_name: "ai-proxy",
              user_id: null,
              profile_id: null,
              model: "modelo-local",
              input_tokens: 1,
              output_tokens: 2,
              duration_ms: 10,
              status: "success",
              error_message: null,
              metadata: {},
              request_id: null,
              job_id: null,
              attempt: null,
            },
          },
        },
      ]);
    }
    if (url.includes("/rest/v1/ai_usage_logs") && metodo === "POST") {
      return json([corpo], 201);
    }
    if (url.includes("/rest/v1/rpc/ai_usage_outbox_mark_processed") && metodo === "POST") {
      return json(null);
    }
    if (url.includes("/rest/v1/rpc/ai_usage_outbox_increment_attempts") && metodo === "POST") {
      return json(null);
    }
    return json({ erro: "rota inesperada", url, metodo }, 500);
  }) as typeof fetch;
  return { chamadas, restaurar: () => { globalThis.fetch = original; } };
}

Deno.test("IA-TIMEOUT-001 drain: rejeita quem nao envia service_role e nao toca a outbox", async () => {
  const restaurarEnv = withEnv();
  const stub = stubFetchOutbox();
  try {
    const res = await handleAiUsageOutboxDrain(new Request("https://local/drain", {
      method: "POST",
      headers: { authorization: "Bearer chave-errada" },
      body: "{}",
    }));
    assertEquals(res.status, 401);
    assertEquals(stub.chamadas.length, 0, "sem service_role nao pode ler a fila interna");
  } finally {
    stub.restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-TIMEOUT-001 drain: service_role executa reprocessarOutboxDeLog e baixa o pendente", async () => {
  const restaurarEnv = withEnv();
  const stub = stubFetchOutbox();
  try {
    const res = await handleAiUsageOutboxDrain(new Request("https://local/drain", {
      method: "POST",
      headers: { authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ limite: 7 }),
    }));
    assertEquals(res.status, 200);
    const body = await res.json() as Record<string, unknown>;
    assertEquals(body.ok, true);
    assertEquals(body.lidos, 1);
    assertEquals(body.gravados, 1);
    assertEquals(body.pendentes, 0);

    const pendentes = stub.chamadas.find((c) => c.url.includes("ai_usage_outbox_pending"));
    assert(pendentes, "o handler precisa chamar a RPC de leitura da outbox");
    assertEquals(pendentes!.corpo?.p_limite, 7, "o limite do consumidor chega na RPC real");
    assert(
      stub.chamadas.some((c) => c.url.includes("/rest/v1/ai_usage_logs") && c.metodo === "POST"),
      "o consumidor precisa reenviar o log pendente",
    );
    assert(
      stub.chamadas.some((c) => c.url.includes("ai_usage_outbox_mark_processed")),
      "entrega confirmada precisa baixar o item da fila",
    );
  } finally {
    stub.restaurar();
    restaurarEnv();
  }
});
