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
//   (b) o veredito: só o booleano `true` liga; linha ausente, valor de outro
//       tipo, erro de leitura e EXCEÇÃO do leitor desligam (fail-closed);
//   (c) a leitura real do PostgREST (fetch dublado) — a chave certa é pedida a
//       `feature_flags` e cada resposta vira o veredito certo;
//   (d) a migration que cria as chaves com `enabled = true`: sem ela o deploy
//       deste leitor desligaria 100% da IA (ausência de chave = desligado);
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

Deno.test("falha de leitura (null): desliga — ausência de resposta confiável nunca liga IA", async () => {
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

function comAmbiente<T>(fn: () => Promise<T>): Promise<T> {
  Deno.env.set("SUPABASE_URL", "https://projeto-teste.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-key-de-teste");
  return fn();
}

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

Deno.test("leitor real: chave AUSENTE (PGRST116) desliga — não é 'sem opinião'", async () => {
  const { restaurar } = stubFetch(() =>
    new Response(
      JSON.stringify({
        code: "PGRST116",
        details: "The result contains 0 rows",
        hint: null,
        message: "JSON object requested, multiple (or no) rows returned",
      }),
      { status: 406, headers: { "content-type": "application/json" } },
    )
  );
  try {
    await comAmbiente(async () => {
      assertEquals(await readCapabilityFlag(CHAVE), false);
    });
  } finally {
    restaurar();
  }
});

Deno.test("leitor real: valor de outro tipo (\"true\") NÃO liga a capacidade", async () => {
  const { restaurar } = stubFetch(() =>
    new Response(JSON.stringify({ enabled: "true" }), {
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
// (d) a migration que impede o apagão: sem as chaves, ausência = desligado
// ---------------------------------------------------------------------------

Deno.test("migration semente: TODA chave de capacidade existe com enabled = true", async () => {
  const dir = new URL("../../../../supabase/migrations/", import.meta.url);
  const arquivos: string[] = [];
  for await (const entrada of Deno.readDir(dir)) {
    if (entrada.isFile && entrada.name.endsWith(".sql")) arquivos.push(entrada.name);
  }
  assert(arquivos.length > 0, "nenhuma migration encontrada no repositório");

  let encontradas = 0;
  for (const nome of arquivos) {
    const sql = await Deno.readTextFile(new URL(nome, dir));
    const linhasComChave = sql.split("\n").filter((l) => l.includes("ai.capability."));
    if (linhasComChave.length === 0) continue;
    // Só a migration que CRIA as chaves (insert) interessa; rollback/delete não liga nada.
    if (!/insert\s+into\s+public\.feature_flags/i.test(sql)) continue;
    encontradas += 1;
    for (const capacidade of CAPACIDADES_DO_DESENHO) {
      const chave = aiCapabilityFlagKey(capacidade);
      const linha = linhasComChave.find((l) => l.includes(`'${chave}'`));
      assert(
        linha,
        `a migration ${nome} não cria a chave ${chave}: publicar o leitor sem ela desliga a capacidade para sempre`,
      );
      assert(
        /,\s*true\s*,/.test(linha!),
        `a chave ${chave} em ${nome} não entra com enabled = true (deploy desligaria a IA no ato)`,
      );
    }
  }
  assert(
    encontradas > 0,
    "nenhuma migration cria as chaves ai.capability.*: com 'ausência = desligado' o deploy desligaria toda a IA",
  );
});

// ---------------------------------------------------------------------------
// (e) fiação — o gate roda no caminho de execução, antes de reservar orçamento
// ---------------------------------------------------------------------------

Deno.test("ai-guards: enforceAiGuards confere a capacidade antes do contador compartilhado", async () => {
  const fonte = await Deno.readTextFile(new URL("../ai-guards.ts", import.meta.url));
  const posCapacidade = fonte.indexOf("await enforceAiCapability(");
  assert(posCapacidade >= 0, "enforceAiGuards não confere mais a capacidade (o código mudou?)");

  const posIdentidade = fonte.indexOf("if (!userId) return errorResponse(\"Unauthenticated\", 401, req);");
  assert(posIdentidade >= 0, "o 401 de identidade sumiu de enforceAiGuards");
  assert(
    posIdentidade < posCapacidade,
    "o gate de capacidade tem de vir DEPOIS do 401 (não revela estado a quem não está autenticado)",
  );

  const posContador = fonte.indexOf("checkSharedAiRateLimits({", posCapacidade);
  assert(posContador >= 0, "o contador compartilhado sumiu do caminho de enforceAiGuards");
  assert(
    posCapacidade < posContador,
    "a capacidade tem de ser conferida ANTES do contador compartilhado: desligada não pode reservar orçamento",
  );
});

Deno.test("ai-auth: o caminho de SERVIÇO passa pelo gate de capacidade", async () => {
  const fonte = await Deno.readTextFile(new URL("../ai-auth.ts", import.meta.url));
  const posServico = fonte.indexOf("if (isServiceRoleRequest(req)) {");
  assert(posServico >= 0, "o ramo de identidade de serviço sumiu de requireAiIdentityOrService");
  const posCapacidade = fonte.indexOf("await enforceAiCapability(", posServico);
  assert(
    posCapacidade > posServico,
    "o caminho de serviço não passa pelo gate: chamador interno continuaria gastando com a capacidade desligada",
  );
  const posTetoIp = fonte.indexOf("checkRateLimit(", posServico);
  assert(
    posTetoIp > posCapacidade,
    "o gate tem de vir antes do teto por IP (capacidade desligada não consome limite)",
  );
});

// ---------------------------------------------------------------------------
// (f) comportamento no caminho real do guard (rede dublada — nada sai de verdade)
// ---------------------------------------------------------------------------

const USUARIO = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

/** Respostas PostgREST mínimas para exercitar `enforceAiGuards` com a flag em cada estado. */
function responderPostgrest(flagLigada: boolean): (url: string) => Response {
  return (url: string): Response => {
    if (url.includes("/rest/v1/feature_flags")) {
      return new Response(JSON.stringify({ enabled: flagLigada }), {
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
