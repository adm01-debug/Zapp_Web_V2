import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AI_PROVIDER_SECRET_ALLOWLIST,
  validateAiProviderEndpoint,
  validateAiProviderEndpointResolved,
  validateAiProviderSecretName,
  validatedAiFetch,
} from "../ai-provider-egress.ts";
import { callOpenAICompatible, callCustomWebhook } from "../ai-providers.ts";

const PROVIDER_ENDPOINTS = [
  "https://api.deepseek.com/v1/chat/completions",
  "https://api.z.ai/api/coding/paas/v4/chat/completions",
  "https://openrouter.ai/api/v1/chat/completions",
];

/** Resolver de teste: nunca toca a rede (o CI roda com --allow-net=127.0.0.1). */
const publicResolver = async (_hostname: string): Promise<readonly string[]> => ["93.184.216.34"];
const resolverFor = (addresses: readonly string[]) => async (): Promise<readonly string[]> => addresses;

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

Deno.test("IA-EGRESS-001: secret fora da ALLOWLIST de provedor é recusado", () => {
  // Allowlist é POSITIVA: o que não é credencial de provedor conhecida não passa —
  // inclusive secrets de infraestrutura que ninguém enumerou numa lista negativa.
  for (const name of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
    "EVOLUTION_API_KEY",
    "EVOLUTION_INSTANCE_TOKEN",
    "CRON_SECRET",
    "PREVIEW_EGRESS_SHARED_SECRET",
    "TALKX_ENGINE_JWT",
    "RESEND_API_KEY",
    "PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY",
    // não enumerados em lista negativa nenhuma — a blocklist antiga deixava passar:
    "GITHUB_TOKEN",
    "TYPES_SYNC_PR_TOKEN",
    "EXTERNAL_SUPABASE_SERVICE_ROLE_KEY",
    "ZAPP_DARKBLUE_PREMIUM_TOKEN",
    "CHAVE_INVENTADA",
  ]) {
    const result = validateAiProviderSecretName(name);
    assertEquals(result.ok, false, name);
  }

  for (const name of AI_PROVIDER_SECRET_ALLOWLIST) {
    assertEquals(validateAiProviderSecretName(name).ok, true, name);
  }
  for (const name of ["DEEPSEEK_API_KEY", "GLM_API_KEY", "OPENROUTER_API_KEY", "LOVABLE_API_KEY"]) {
    assertEquals(validateAiProviderSecretName(name).ok, true, name);
  }

  // Ausente/vazio/inválido
  for (const name of ["", "   ", "deepseek_api_key", "CHAVE COM ESPAÇO", "1CHAVE"]) {
    assertEquals(validateAiProviderSecretName(name).ok, false, name);
  }
  assertEquals(validateAiProviderSecretName(null).ok, false);
  assertEquals(validateAiProviderSecretName(undefined).ok, false);
});

Deno.test("IA-EGRESS-001: hostname que RESOLVE para IP privado é bloqueado antes do fetch", async () => {
  // O texto da URL (`127.0.0.1.nip.io`) é um hostname público válido — só a
  // resolução DNS revela que ele aponta para loopback.
  assertEquals(validateAiProviderEndpoint("https://127.0.0.1.nip.io/v1").ok, true);

  for (const addresses of [
    ["127.0.0.1"],
    ["169.254.169.254"],
    ["10.0.0.1"],
    ["172.16.0.1"],
    ["192.168.0.1"],
    ["::1"],
    ["fd00::1"],
    ["93.184.216.34", "127.0.0.1"], // mistura público + privado
  ]) {
    let called = false;
    const fetcher = async (): Promise<Response> => {
      called = true;
      return new Response("{}", { status: 200 });
    };
    let threw = false;
    try {
      await validatedAiFetch("https://127.0.0.1.nip.io/v1", { method: "POST" }, {
        fetcher,
        resolver: resolverFor(addresses),
      });
    } catch {
      threw = true;
    }
    assert(threw, `deveria lançar para resolução ${addresses.join(",")}`);
    assertEquals(called, false, `fetcher não pode ser chamado (${addresses.join(",")})`);
  }

  // O mesmo host com resolução pública passa e devolve os endereços validados.
  const resolution = await validateAiProviderEndpointResolved(
    "https://api.deepseek.com/v1/chat/completions",
    resolverFor(["93.184.216.34"]),
  );
  assertEquals(resolution.ok, true);
});

Deno.test("IA-EGRESS-001: falha ou resposta vazia de DNS bloqueia (fail-closed)", async () => {
  for (const resolver of [
    async (): Promise<readonly string[]> => [],
    async (): Promise<readonly string[]> => {
      throw new Error("NXDOMAIN");
    },
  ]) {
    let called = false;
    const fetcher = async (): Promise<Response> => {
      called = true;
      return new Response("{}", { status: 200 });
    };
    let threw = false;
    try {
      await validatedAiFetch("https://api.deepseek.com/v1", { method: "POST" }, { fetcher, resolver });
    } catch {
      threw = true;
    }
    assert(threw, "resolução vazia/erro deve lançar");
    assertEquals(called, false, "fetcher não pode ser chamado quando o DNS não valida");
  }
});

Deno.test("IA-EGRESS-001: DNS rebinding — host que troca de endereço é bloqueado", async () => {
  // Alterna público → privado entre as duas consultas feitas antes do envio.
  let queries = 0;
  const flippingResolver = async (): Promise<readonly string[]> => {
    queries += 1;
    return queries === 1 ? ["93.184.216.34"] : ["127.0.0.1"];
  };
  let called = false;
  const fetcher = async (): Promise<Response> => {
    called = true;
    return new Response("{}", { status: 200 });
  };
  let threw = false;
  try {
    await validatedAiFetch("https://rebind.example.com/v1", { method: "POST" }, {
      fetcher,
      resolver: flippingResolver,
    });
  } catch {
    threw = true;
  }
  assert(threw, "resolução que muda antes do envio deve lançar");
  assertEquals(called, false, "fetcher não pode ser chamado com DNS instável");

  // Conjunto de endereços diferente (sem endereço privado) também é rebinding.
  let seen = 0;
  const rotatingResolver = async (): Promise<readonly string[]> => {
    seen += 1;
    return seen === 1 ? ["93.184.216.34"] : ["93.184.216.35"];
  };
  let threwRotating = false;
  try {
    await validatedAiFetch("https://rebind.example.com/v1", { method: "POST" }, {
      fetcher,
      resolver: rotatingResolver,
    });
  } catch {
    threwRotating = true;
  }
  assert(threwRotating, "conjunto de endereços diferente na validação deve lançar");

  // Durante a requisição (redirect mesmo host): o conjunto tem de continuar igual.
  let calls = 0;
  const duringRequestResolver = async (): Promise<readonly string[]> => {
    calls += 1;
    return calls <= 2 ? ["93.184.216.34"] : ["10.0.0.7"];
  };
  let redirectFetched = 0;
  const redirectFetcher = async (input: string): Promise<Response> => {
    redirectFetched += 1;
    if (input.endsWith("/v1")) {
      return new Response(null, { status: 302, headers: { location: "https://rebind.example.com/v2" } });
    }
    return new Response("{}", { status: 200 });
  };
  let threwDuring = false;
  try {
    await validatedAiFetch("https://rebind.example.com/v1", { method: "POST" }, {
      fetcher: redirectFetcher,
      resolver: duringRequestResolver,
    });
  } catch {
    threwDuring = true;
  }
  assert(threwDuring, "DNS que muda no meio da requisição deve lançar");
  assertEquals(redirectFetched, 1, "o destino do redirect não pode ser chamado");
});

Deno.test("IA-EGRESS-001: validatedAiFetch segue redirect mesma origem e bloqueia privado/outra origem", async () => {
  // Redirect para a MESMA origem → seguido.
  const calls: string[] = [];
  const okFetcher = async (input: string): Promise<Response> => {
    calls.push(input);
    if (input.endsWith("/v2")) {
      return new Response("{}", { status: 200 });
    }
    return new Response(null, { status: 302, headers: { location: "https://api.z.ai/v2" } });
  };
  const ok = await validatedAiFetch("https://api.z.ai/v1", { method: "POST" }, {
    fetcher: okFetcher,
    resolver: publicResolver,
  });
  assertEquals(ok.status, 200);
  assertEquals(calls.length, 2, "deveria seguir um redirect mesma-origem");

  // Redirect para OUTRA origem pública → bloqueado ANTES do segundo fetch:
  // Authorization da API key nunca chega a outro host.
  const crossOriginCalls: string[] = [];
  const crossFetcher = async (input: string): Promise<Response> => {
    crossOriginCalls.push(input);
    return new Response(null, { status: 302, headers: { location: "https://openrouter.ai/api/v1/chat/completions" } });
  };
  let threwCross = false;
  try {
    await validatedAiFetch(
      "https://api.z.ai/v1",
      { method: "POST", headers: { Authorization: "Bearer segredo" } },
      { fetcher: crossFetcher, resolver: publicResolver },
    );
  } catch {
    threwCross = true;
  }
  assert(threwCross, "redirect para outra origem deve lançar");
  assertEquals(crossOriginCalls.length, 1, "o host de destino não pode ser chamado");
  assertEquals(crossOriginCalls[0], "https://api.z.ai/v1");

  // Redirect para IP privado → bloqueado com throw (sem segundo fetch).
  let evilCalls = 0;
  const evilFetcher = async (): Promise<Response> => {
    evilCalls += 1;
    return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
  };
  let threw = false;
  try {
    await validatedAiFetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST" }, {
      fetcher: evilFetcher,
      resolver: publicResolver,
    });
  } catch {
    threw = true;
  }
  assert(threw, "redirect para destino privado deve lançar");
  assertEquals(evilCalls, 1, "o destino privado do redirect não pode ser chamado");

  // Redirect para host PÚBLICO que resolve para IP privado → bloqueado por DNS.
  let rebindCalls = 0;
  const rebindFetcher = async (input: string): Promise<Response> => {
    rebindCalls += 1;
    if (input.endsWith("/v1")) {
      return new Response(null, { status: 302, headers: { location: "https://127.0.0.1.nip.io/v2" } });
    }
    return new Response("{}", { status: 200 });
  };
  const mixedResolver = async (hostname: string): Promise<readonly string[]> =>
    hostname.endsWith("nip.io") ? ["127.0.0.1"] : ["93.184.216.34"];
  let threwRebind = false;
  try {
    await validatedAiFetch("https://openrouter.ai/api/v1", { method: "POST" }, {
      fetcher: rebindFetcher,
      resolver: mixedResolver,
    });
  } catch {
    threwRebind = true;
  }
  assert(threwRebind, "redirect para host que resolve para IP privado deve lançar");
  assertEquals(rebindCalls, 1, "o host do redirect não pode ser chamado");
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
    }, { fetcher, resolver: publicResolver });
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
  }, { fetcher: fetcher307, resolver: publicResolver });
  assertEquals(res307.status, 200);
  assertEquals(hops307[0].method, "POST");
  assertEquals(hops307[0].body, "payload");
});

Deno.test("IA-EGRESS-001: callOpenAICompatible bloqueia endpoint privado ANTES de enviar fetch", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (): Promise<Response> => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    let threw = false;
    try {
      await callOpenAICompatible({
        endpoint: "http://169.254.169.254/latest/meta-data/",
        apiKey: "k",
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
  globalThis.fetch = (async (): Promise<Response> => {
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
