import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  validateAiProviderEndpoint,
  validateAiProviderSecretName,
  validatedAiFetch,
} from "../ai-provider-egress.ts";
import { callOpenAICompatible, callCustomWebhook } from "../ai-providers.ts";

const PROVIDER_ENDPOINTS = [
  "https://api.deepseek.com/v1/chat/completions",
  "https://api.z.ai/api/coding/paas/v4/chat/completions",
  "https://openrouter.ai/api/v1/chat/completions",
];

Deno.test("IA-EGRESS-001: endpoint de provedor exige https público sem credencial/porta", () => {
  for (const endpoint of PROVIDER_ENDPOINTS) {
    assertEquals(validateAiProviderEndpoint(endpoint).ok, true, endpoint);
  }

  for (const endpoint of [
    "http://api.deepseek.com/v1/chat/completions", // http
    "https://user:pass@api.openai.com/v1", // credencial embutida
    "https://api.openai.com:8080/v1", // porta não padrão
    "https://localhost/v1", // hostname interno
    "https://api.internal/v1", // sufixo interno
    "https://api.local/v1", // sufixo interno
    "https://api", // sem domínio público
    "not a url",
    "",
  ]) {
    const result = validateAiProviderEndpoint(endpoint);
    assertEquals(result.ok, false, endpoint);
  }
});

Deno.test("IA-EGRESS-001: endpoint de provedor bloqueia IP privado/literal/loopback/metadata", () => {
  for (const endpoint of [
    "https://127.0.0.1/v1",
    "https://169.254.169.254/latest/meta-data/",
    "https://10.0.0.1/v1",
    "https://192.168.0.1/v1",
    "https://172.16.0.1/v1",
    "https://[::1]/v1",
    "https://[fc00::1]/v1",
    "https://93.184.216.34/v1", // IP público literal (provedor deve ser nome DNS)
  ]) {
    const result = validateAiProviderEndpoint(endpoint);
    assertEquals(result.ok, false, endpoint);
  }
});

Deno.test("IA-EGRESS-001: nome de secret de infraestrutura é recusado como credencial", () => {
  for (const name of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "EVOLUTION_API_KEY",
    "EVOLUTION_INSTANCE_TOKEN",
    "CRON_SECRET",
    "PREVIEW_EGRESS_SHARED_SECRET",
    "TALKX_ENGINE_JWT",
    "PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    const result = validateAiProviderSecretName(name);
    assertEquals(result.ok, false, name);
  }

  for (const name of [
    "DEEPSEEK_API_KEY",
    "GLM_API_KEY",
    "OPENROUTER_API_KEY",
    "LOVABLE_API_KEY",
  ]) {
    assertEquals(validateAiProviderSecretName(name).ok, true, name);
  }

  // Formato inválido
  for (const name of ["", "deepseek_api_key", "CHAVE COM ESPAÇO", "1CHAVE"]) {
    assertEquals(validateAiProviderSecretName(name).ok, false, name);
  }
});

Deno.test("IA-EGRESS-001: validatedAiFetch bloqueia destino antes de chamar o fetcher", async () => {
  let called = false;
  const fetcher = async (_input: string, _init: RequestInit): Promise<Response> => {
    called = true;
    return new Response("{}", { status: 200 });
  };

  let threw = false;
  try {
    await validatedAiFetch("http://169.254.169.254/latest/meta-data/", { method: "POST" }, fetcher);
  } catch {
    threw = true;
  }
  assert(threw, "deveria lançar para endpoint privado");
  assertEquals(called, false, "fetcher não deve ser chamado para endpoint bloqueado");
});

Deno.test("IA-EGRESS-001: validatedAiFetch segue redirect mesma origem e bloqueia privado/outra origem", async () => {
  // Redirect para a MESMA origem → seguido.
  const calls: string[] = [];
  const okFetcher = async (input: string, _init: RequestInit): Promise<Response> => {
    calls.push(input);
    if (input.endsWith("/v2")) {
      return new Response("{}", { status: 200 });
    }
    return new Response(null, { status: 302, headers: { location: "https://api.z.ai/v2" } });
  };
  const ok = await validatedAiFetch("https://api.z.ai/v1", { method: "POST" }, okFetcher);
  assertEquals(ok.status, 200);
  assertEquals(calls.length, 2, "deveria seguir um redirect mesma-origem");

  // Redirect para OUTRA origem pública → bloqueado ANTES do segundo fetch:
  // Authorization da API key nunca chega a outro host.
  const crossOriginCalls: string[] = [];
  const crossFetcher = async (input: string, _init: RequestInit): Promise<Response> => {
    crossOriginCalls.push(input);
    return new Response(null, { status: 302, headers: { location: "https://openrouter.ai/api/v1/chat/completions" } });
  };
  let threwCross = false;
  try {
    await validatedAiFetch(
      "https://api.z.ai/v1",
      { method: "POST", headers: { Authorization: "Bearer segredo" } },
      crossFetcher,
    );
  } catch {
    threwCross = true;
  }
  assert(threwCross, "redirect para outra origem deve lançar");
  assertEquals(crossOriginCalls.length, 1, "o host de destino não pode ser chamado");
  assertEquals(crossOriginCalls[0], "https://api.z.ai/v1");

  // Redirect para IP privado → bloqueado com throw.
  const evilFetcher = async (_input: string, _init: RequestInit): Promise<Response> => {
    return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
  };
  let threw = false;
  try {
    await validatedAiFetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST" }, evilFetcher);
  } catch {
    threw = true;
  }
  assert(threw, "redirect para destino privado deve lançar");
});

Deno.test("IA-EGRESS-001: validatedAiFetch reescreve POST→GET e descarta body em 303/302", async () => {
  for (const status of [303, 302]) {
    const hops: Array<{ method?: string; body?: unknown; contentType: string | null }> = [];
    const fetcher = async (input: string, init: RequestInit): Promise<Response> => {
      if (input.endsWith("/v2")) {
        hops.push({
          method: init.method,
          body: init.body,
          contentType: new Headers(init.headers).get("content-type"),
        });
        return new Response("{}", { status: 200 });
      }
      return new Response(null, { status, headers: { location: "https://api.z.ai/v2" } });
    };
    const res = await validatedAiFetch("https://api.z.ai/v1", {
      method: "POST",
      headers: { Authorization: "Bearer k", "Content-Type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    }, fetcher);
    assertEquals(res.status, 200);
    assertEquals(hops.length, 1);
    assertEquals(hops[0].method, "GET", `status ${status} deve reescrever POST→GET`);
    assertEquals(hops[0].body, null, `status ${status} deve descartar o body`);
    assertEquals(hops[0].contentType, null, `status ${status} deve remover content-type`);
  }

  // 307 preserva método e body (redirect sem reescrita).
  const hops307: Array<{ method?: string; body?: unknown }> = [];
  const fetcher307 = async (input: string, init: RequestInit): Promise<Response> => {
    if (input.endsWith("/v2")) {
      hops307.push({ method: init.method, body: init.body });
      return new Response("{}", { status: 200 });
    }
    return new Response(null, { status: 307, headers: { location: "https://api.z.ai/v2" } });
  };
  const res307 = await validatedAiFetch("https://api.z.ai/v1", {
    method: "POST",
    body: "payload",
  }, fetcher307);
  assertEquals(res307.status, 200);
  assertEquals(hops307[0].method, "POST");
  assertEquals(hops307[0].body, "payload");
});

Deno.test("IA-EGRESS-001: callOpenAICompatible bloqueia endpoint privado ANTES de enviar fetch", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    let threw = false;
    try {
      await callOpenAICompatible({
        endpoint: "http://169.254.169.254/latest/meta-data/",
        apiKey: "chave-de-teste",
        messages: [{ role: "user", content: "oi" }],
      });
    } catch {
      threw = true;
    }
    assert(threw, "callOpenAICompatible deveria lançar para endpoint privado");
    assertEquals(fetchCalled, false, "fetch não deveria ser chamado (Authorization não enviada)");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("IA-EGRESS-001: callCustomWebhook bloqueia endpoint privado ANTES de enviar fetch", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    let threw = false;
    try {
      await callCustomWebhook({
        endpoint: "http://169.254.169.254/latest/meta-data/",
        messages: [{ role: "user", content: "oi" }],
      });
    } catch {
      threw = true;
    }
    assert(threw, "callCustomWebhook deveria lançar para endpoint privado");
    assertEquals(fetchCalled, false, "fetch não deveria ser chamado (cabeçalhos não enviados)");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
