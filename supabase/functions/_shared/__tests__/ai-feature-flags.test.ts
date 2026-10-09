// SL-009 / IA-009 — kill switch por CAPACIDADE de IA lido no SERVIDOR.
//
// Defeito do cartão (IA-003, achado B8): `feature_flags` era lida SÓ no cliente
// (`src/hooks/system/useFeatureFlag.ts`) e, no servidor, só por `crm-integration`.
// Desligar a flag escondia o botão; quem chamasse a Edge Function direto — ou um
// bundle velho — continuava consumindo provedor pago.
//
// O que estes testes travam:
//   (a) a chave: uma por capacidade do desenho IA-009 (`ai.capability.<cap>`),
//       sem capacidade faltando, sem chave inventada e sem herança de protótipo;
//   (b) o veredito: linha AUSENTE vale LIGADA (o operador não desligou a
//       capacidade — não se depende de seed/migration para ligar a IA); só o
//       `false` booleano explícito DESLIGA; leitura não confiável (erro do
//       PostgREST, exceção do leitor) ou valor não booleano FECHAM (bloqueiam) —
//       nunca se reativa efeito automático a partir de resposta duvidosa;
//   (c) a leitura real do PostgREST (fetch dublado) — a chave certa é pedida a
//       `feature_flags` e cada resposta vira o veredito certo;
//   (e) a fiação: `enforceAiGuards` confere a capacidade ANTES do contador
//       compartilhado (capacidade desligada não reserva orçamento) e o caminho
//       de SERVIÇO de `requireAiIdentityOrService` também passa pelo gate.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
//   supabase/functions/_shared/__tests__/ai-feature-flags.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AI_CAPABILITY_BY_FUNCTION,
  aiCapabilityFlagKey,
  capabilityFlagKeyForFunction,
  enforceAiCapability,
  readCapabilityFlag,
  type AiCapability,
} from "../ai-feature-flags.ts";
import { enforceAiGuards } from "../ai-guards.ts";
import { requireAiIdentityOrService } from "../ai-auth.ts";

const REQ = new Request("https://exemplo.test/functions/v1/ai-suggest-reply", { method: "POST" });

/** Só o que o desenho IA-009 declara: 10 capacidades, nenhuma a mais. */
const CAPACIDADES_DO_DESENHO: AiCapability[] = [
  "suggest_reply",
  "enhance_message",
  "summary",
  "conversation_analysis",
  "auto_tag",
  "churn",
  "classify_tickets",
  "transcribe_audio",
  "voice",
  "chatbot_l1",
];

// ---------------------------------------------------------------------------
// (a) a chave
// ---------------------------------------------------------------------------

Deno.test("a chave é uma por capacidade do desenho IA-009, sem faltar nem inventar", () => {
  const doMapa = new Set(Object.values(AI_CAPABILITY_BY_FUNCTION));
  assertEquals(
    [...doMapa].sort(),
    [...CAPACIDADES_DO_DESENHO].sort(),
    "o mapa de funções->capacidades divergiu do desenho IA-009",
  );
  for (const capacidade of CAPACIDADES_DO_DESENHO) {
    assertEquals(
      aiCapabilityFlagKey(capacidade),
      `ai.capability.${capacidade}`,
      "formato de chave fora do desenho",
    );
  }
});

Deno.test("capabilityFlagKeyForFunction resolve o slug da função para a chave da capacidade", () => {
  assertEquals(capabilityFlagKeyForFunction("ai-suggest-reply"), "ai.capability.suggest_reply");
  assertEquals(capabilityFlagKeyForFunction("ai-transcribe-audio"), "ai.capability.transcribe_audio");
  assertEquals(capabilityFlagKeyForFunction("chatbot-l1"), "ai.capability.chatbot_l1");
});

Deno.test("função sem capacidade declarada não tem chave (não se inventa chave por prefixo)", () => {
  for (const slug of ["ai-proxy", "classify-sticker", "classify-emoji", "ai-jobs-worker"]) {
    assertEquals(capabilityFlagKeyForFunction(slug), null, `${slug} não deveria ter capacidade`);
  }
});

Deno.test("chave herdada do protótipo não vira capacidade (Object.prototype não é mapa)", () => {
  assertEquals(capabilityFlagKeyForFunction("toString"), null);
  assertEquals(capabilityFlagKeyForFunction("constructor"), null);
  assertEquals(capabilityFlagKeyForFunction("hasOwnProperty"), null);
});

// ---------------------------------------------------------------------------
// (b) o veredito do gate
// ---------------------------------------------------------------------------

Deno.test("capacidade ligada (true): o gate libera e nenhuma resposta é devolvida", async () => {
  const res = await enforceAiCapability({
    functionName: "ai-suggest-reply",
    req: REQ,
    readFlag: () => Promise.resolve(true),
  });
  assertEquals(res, null);
});

Deno.test("capacidade desligada (false): 503 com motivo explícito, não resposta vazia", async () => {
  const res = await enforceAiCapability({
    functionName: "ai-suggest-reply",
    req: REQ,
    readFlag: () => Promise.resolve(false),
  });
  assert(res instanceof Response, "capacidade desligada tem de bloquear");
  assertEquals(res!.status, 503);
  const corpo = await res!.json() as { error: string; code: string };
  assertEquals(corpo.code, "AI_CAPABILITY_DISABLED");
  assertEquals(typeof corpo.error, "string");
});

Deno.test("falha de leitura (null): fecha — ausência de resposta confiável nunca liga IA", async () => {
  const res = await enforceAiCapability({
    functionName: "ai-suggest-reply",
    req: REQ,
    readFlag: () => Promise.resolve(null),
  });
  assert(res instanceof Response, "leitura não confiável tem de bloquear");
  assertEquals(res!.status, 503);
});

Deno.test("leitor que LANÇA: o gate não propaga a exceção e bloqueia", async () => {
  const res = await enforceAiCapability({
    functionName: "ai-suggest-reply",
    req: REQ,
    readFlag: () => {
      throw new Error("PostgREST fora");
    },
  });
  assert(res instanceof Response, "exceção do leitor tem de virar bloqueio, não erro 500");
  assertEquals(res!.status, 503);
});

Deno.test("o gate lê a chave da capacidade da função chamada (não uma chave fixa)", async () => {
  const lidas: string[] = [];
  const res = await enforceAiCapability({
    functionName: "chatbot-l1",
    req: REQ,
    readFlag: (key) => {
      lidas.push(key);
      return Promise.resolve(true);
    },
  });
  assertEquals(res, null);
  assertEquals(lidas, ["ai.capability.chatbot_l1"]);
});

Deno.test("função sem capacidade declarada: gate não bloqueia e nem chega a ler flag", async () => {
  let leituras = 0;
  const res = await enforceAiCapability({
    functionName: "ai-proxy",
    req: REQ,
    readFlag: () => {
      leituras += 1;
      return Promise.resolve(false);
    },
  });
  assertEquals(res, null, "função fora do mapa não pode ser barrada por este gate");
  assertEquals(leituras, 0, "nenhuma leitura de flag deve acontecer para função fora do mapa");
});

// ---------------------------------------------------------------------------
// (c) leitura real do PostgREST (fetch dublado — nenhuma rede sai de verdade)
// ---------------------------------------------------------------------------

type Captura = { metodo: string; url: string };

/** Dubla `globalThis.fetch` e devolve a resposta que o caso precisa (roteia pela URL). */
function stubFetch(resposta: (url: string) => Response): { capturas: Captura[]; restaurar: () => void } {
  const capturas: Captura[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    capturas.push({
      metodo: init?.method ?? (input instanceof Request ? input.method : "GET"),
      url,
    });
    return Promise.resolve(resposta(url));
  }) as typeof fetch;
  return { capturas, restaurar: () => { globalThis.fetch = original; } };
}

/** Devolve uma variável de ambiente ao estado anterior (valor, ou ausência). */
function restaurarEnv(nome: string, valor: string | undefined): void {
  if (valor === undefined) Deno.env.delete(nome);
  else Deno.env.set(nome, valor);
}

/**
 * Semeia o ambiente do leitor real durante `fn` e RESTAURA ao fim. O processo do
 * `deno test` é compartilhado entre os casos: sem a restauração, uma variável
 * semeada aqui vaza para o caso seguinte (e o caso que espera a env ausente
 * passaria a ler o valor de teste).
 */
async function comAmbiente<T>(fn: () => Promise<T>): Promise<T> {
  const antes = {
    url: Deno.env.get("SUPABASE_URL"),
    chave: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  };
  Deno.env.set("SUPABASE_URL", "https://projeto-teste.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-key-de-teste");
  try {
    return await fn();
  } finally {
    restaurarEnv("SUPABASE_URL", antes.url);
    restaurarEnv("SUPABASE_SERVICE_ROLE_KEY", antes.chave);
  }
}

Deno.test("comAmbiente devolve o ambiente como estava (não vaza SUPABASE_URL/CHAVE entre casos)", async () => {
  const urlAntes = Deno.env.get("SUPABASE_URL");
  const chaveAntes = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  try {
    // 1) processo começa SEM as variáveis (estado do CI): tem de voltar vazio.
    Deno.env.delete("SUPABASE_URL");
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    await comAmbiente(async () => {
      assertEquals(Deno.env.get("SUPABASE_URL"), "https://projeto-teste.supabase.co");
      assertEquals(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), "service-role-key-de-teste");
    });
    assertEquals(
      Deno.env.get("SUPABASE_URL"),
      undefined,
      "ambiente semeado pelo comAmbiente não pode vazar para o caso seguinte",
    );
    assertEquals(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), undefined);

    // 2) quando já havia valor, o valor ANTERIOR volta (não o de teste).
    Deno.env.set("SUPABASE_URL", "https://ambiente-anterior.supabase.co");
    await comAmbiente(async () => {
      assertEquals(Deno.env.get("SUPABASE_URL"), "https://projeto-teste.supabase.co");
    });
    assertEquals(Deno.env.get("SUPABASE_URL"), "https://ambiente-anterior.supabase.co");
  } finally {
    if (urlAntes === undefined) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", urlAntes);
    if (chaveAntes === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", chaveAntes);
  }
});

const CHAVE = "ai.capability.suggest_reply";

Deno.test("leitor real: linha enabled=true liga e a consulta vai à feature_flags com a chave certa", async () => {
  const { capturas, restaurar } = stubFetch(() =>
    new Response(JSON.stringify({ enabled: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
  try {
    await comAmbiente(async () => {
      assertEquals(await readCapabilityFlag(CHAVE), true);
    });
    const consulta = capturas.find((c) => c.url.includes("/rest/v1/feature_flags"));
    assert(consulta, `nenhuma consulta a feature_flags: ${JSON.stringify(capturas)}`);
    assert(
      consulta!.url.includes("key=eq.ai.capability.suggest_reply"),
      `a chave pedida não é a da capacidade: ${consulta!.url}`,
    );
    assert(consulta!.url.includes("select=enabled"), `a consulta não pede a coluna enabled: ${consulta!.url}`);
  } finally {
    restaurar();
  }
});

Deno.test("leitor real: linha enabled=false desliga", async () => {
  const { restaurar } = stubFetch(() =>
    new Response(JSON.stringify({ enabled: false }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
  try {
    await comAmbiente(async () => {
      assertEquals(await readCapabilityFlag(CHAVE), false);
    });
  } finally {
    restaurar();
  }
});

Deno.test("leitor real: chave AUSENTE (0 linhas) LIGA — ausência não é desligamento", async () => {
  // PostgREST + `.maybeSingle()` devolvem `[]` (que o cliente vira `data = null`)
  // quando a linha não existe. Isso não é falha nem desligamento: nenhuma linha
  // criada significa que o operador não desligou a capacidade, logo ela segue ligada.
  const { restaurar } = stubFetch(() =>
    new Response("[]", { status: 200, headers: { "content-type": "application/json" } })
  );
  try {
    await comAmbiente(async () => {
      assertEquals(
        await readCapabilityFlag(CHAVE),
        true,
        "linha ausente tem de valer LIGADA (sem depender de seed/migration)",
      );
    });
  } finally {
    restaurar();
  }
});

Deno.test("leitor real: valor não booleano não é leitura confiável — fecha (null)", async () => {
  // A coluna é booleana; um valor de outro tipo ("true" string) não é decisão
  // interpretável. Não se liga IA a partir dele: o leitor devolve null e o gate fecha.
  const { restaurar } = stubFetch(() =>
    new Response(JSON.stringify({ enabled: "true" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
  try {
    await comAmbiente(async () => {
      assertEquals(await readCapabilityFlag(CHAVE), null);
    });
  } finally {
    restaurar();
  }
});

Deno.test("leitor real: erro do PostgREST devolve null (indeterminado) — e null bloqueia", async () => {
  const { restaurar } = stubFetch(() =>
    new Response(JSON.stringify({ message: "boom" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  );
  try {
    await comAmbiente(async () => {
      assertEquals(await readCapabilityFlag(CHAVE), null);
    });
  } finally {
    restaurar();
  }
});

// ---------------------------------------------------------------------------
// (e) fiação — o gate roda no CAMINHO DE EXECUÇÃO real (rede dublada), antes de
//     reservar orçamento. Cada teste chama a função de produção de verdade.
// ---------------------------------------------------------------------------

Deno.test("enforceAiGuards: sem identidade responde 401 e NÃO lê a flag (gate depois da identidade)", async () => {
  const { capturas, restaurar } = stubFetch(responderPostgrest(true));
  try {
    await comAmbiente(async () => {
      const res = await enforceAiGuards({
        functionName: "ai-suggest-reply",
        userId: undefined as unknown as string,
        req: REQ,
      });
      assert(res instanceof Response, "sem userId o guard tem de responder, não seguir");
      assertEquals(res!.status, 401);
    });
    assert(
      !capturas.some((c) => c.url.includes("feature_flags")),
      "o 401 não pode depender da leitura da flag: a identidade vem primeiro",
    );
  } finally {
    restaurar();
  }
});

Deno.test("requireAiIdentityOrService: caminho de SERVIÇO com capacidade DESLIGADA → 503", async () => {
  const { restaurar } = stubFetch(responderPostgrest(false));
  try {
    await comAmbiente(async () => {
      const req = new Request("https://exemplo.test/functions/v1/ai-transcribe-audio", {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      });
      const res = await requireAiIdentityOrService(req, "ai-transcribe-audio");
      assert(res instanceof Response, "o worker interno tem de ser barrado com a capacidade desligada");
      assertEquals((res as Response).status, 503);
    });
  } finally {
    restaurar();
  }
});

Deno.test("requireAiIdentityOrService: serviço com chave AUSENTE segue como identidade de serviço", async () => {
  const { restaurar } = stubFetch(responderPostgrest(null));
  try {
    await comAmbiente(async () => {
      const req = new Request("https://exemplo.test/functions/v1/ai-transcribe-audio", {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      });
      // servicePerMinute: 0 desliga o teto por IP (em memória) — não é o alvo deste teste.
      const res = await requireAiIdentityOrService(req, "ai-transcribe-audio", { servicePerMinute: 0 });
      assertEquals(res, { kind: "service", userId: null });
    });
  } finally {
    restaurar();
  }
});

// ---------------------------------------------------------------------------
// (f) comportamento no caminho real do guard (rede dublada — nada sai de verdade)
// ---------------------------------------------------------------------------

const USUARIO = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

/**
 * Respostas PostgREST mínimas para exercitar `enforceAiGuards` com a flag em cada
 * estado. `flag === null` representa a CHAVE AUSENTE (PostgREST devolve `[]`).
 */
function responderPostgrest(flag: boolean | null): (url: string) => Response {
  return (url: string): Response => {
    if (url.includes("/rest/v1/feature_flags")) {
      const corpo = flag === null ? "[]" : JSON.stringify({ enabled: flag });
      return new Response(corpo, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/rpc/ai_rate_limit_hit")) {
      return new Response("1", { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/rest/v1/ai_usage_logs")) {
      return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
    }
    return new Response(JSON.stringify({ message: `rota nao dublada: ${url}` }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  };
}

Deno.test("enforceAiGuards: capacidade LIGADA segue o fluxo normal e consulta o contador compartilhado", async () => {
  const { capturas, restaurar } = stubFetch(responderPostgrest(true));
  try {
    await comAmbiente(async () => {
      const res = await enforceAiGuards({ functionName: "ai-suggest-reply", userId: USUARIO, req: REQ });
      assertEquals(res, null, "capacidade ligada não pode ser barrada pelo kill switch");
    });
    assert(
      capturas.some((c) => c.url.includes("ai_rate_limit_hit")),
      "o contador compartilhado deveria ser consultado com a capacidade ligada",
    );
  } finally {
    restaurar();
  }
});

Deno.test("enforceAiGuards: chave AUSENTE não barra a IA (ausência = ligada)", async () => {
  const { capturas, restaurar } = stubFetch(responderPostgrest(null));
  try {
    await comAmbiente(async () => {
      const res = await enforceAiGuards({ functionName: "ai-suggest-reply", userId: USUARIO, req: REQ });
      assertEquals(res, null, "sem linha na feature_flags a capacidade segue ligada (nada de seed obrigatório)");
    });
    assert(
      capturas.some((c) => c.url.includes("ai_rate_limit_hit")),
      "com a chave ausente o fluxo normal tem de continuar (o contador é consultado)",
    );
  } finally {
    restaurar();
  }
});

Deno.test("enforceAiGuards: capacidade DESLIGADA devolve 503 e não toca o contador compartilhado", async () => {
  const { capturas, restaurar } = stubFetch(responderPostgrest(false));
  try {
    await comAmbiente(async () => {
      const res = await enforceAiGuards({ functionName: "ai-suggest-reply", userId: USUARIO, req: REQ });
      assert(res instanceof Response, "capacidade desligada tem de barrar a chamada de IA no servidor");
      assertEquals(res!.status, 503);
    });
    assert(
      !capturas.some((c) => c.url.includes("ai_rate_limit_hit")),
      "capacidade desligada tocou o contador compartilhado: reservou orçamento antes de conferir a flag",
    );
    assert(
      !capturas.some((c) => c.url.includes("ai_usage_logs")),
      "capacidade desligada consultou a cota: a checagem tem de vir antes de qualquer efeito",
    );
  } finally {
    restaurar();
  }
});
