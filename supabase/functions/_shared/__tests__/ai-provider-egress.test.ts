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

Deno.test("IA-EGRESS-001: validatedAiFetch segue redirect seguro e bloqueia redirect privado", async () => {
  // Redirect para host público → seguido.
  const calls: string[] = [];
  const okFetcher = async (input: string, _init: RequestInit): Promise<Response> => {
    calls.push(input);
    if (input.includes("openrouter.ai")) {
      return new Response("{}", { status: 200 });
    }
    return new Response(null, { status: 302, headers: { location: "https://openrouter.ai/api/v1/chat/completions" } });
  };
  const ok = await validatedAiFetch("https://api.z.ai/v1", { method: "POST" }, okFetcher);
  assertEquals(ok.status, 200);
  assertEquals(calls.length, 2, "deveria seguir um redirect seguro");

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
