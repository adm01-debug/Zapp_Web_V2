// IA-009 — kill switch de IA por capacidade, provedor e bot, lido NO SERVIDOR.
//
// Defeito provado na auditoria (IA-009 §1): a tabela `feature_flags` era lida só no
// cliente (`useFeatureFlag`). Desligar a flag escondia o botão; quem chamasse a Edge
// Function direto continuava sendo atendido e o provedor continuava sendo cobrado. Não
// existia UMA leitura de flag em `supabase/functions` fora do `crm-integration`.
//
// O que estes testes fixam (vermelho no código sem o mecanismo, verde com ele):
//   (a) capacidade DESLIGADA (ou AUSENTE — falha fechada, §2.5) bloqueia a chamada
//       ANTES de reservar orçamento e ANTES de tocar o provedor: zero fetch, zero
//       resposta apresentada como sucesso, HTTP 503 com código AI_DISABLED;
//   (b) provedor DESLIGADO bloqueia mesmo com a capacidade ligada;
//   (c) leitura da tabela falhando NEGA (nunca libera por indisponibilidade);
//   (d) tudo LIGADO segue exatamente o caminho de antes (a trava não é opcional nem
//       interfere no caminho padrão);
//   (e) a linha do bloqueio sai no ledger como `denied`, o status que `ai-usage.ts` já
//       trata como "sem chamada paga" — o desligamento não consome a cota de ninguém;
//   (f) `ai.bot.<connectionId>` é PAUSA: só `false` pausa; linha ausente não pausa.
//
// Sem rede real nem banco: `globalThis.fetch` é substituído por um espião que responde
// ao PostgREST (ai_providers, feature_flags, ai_usage_logs) e conta as chamadas ao
// endpoint do provedor.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
//   supabase/functions/_shared/ai-kill-switch.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { generateWithRouting } from "./ai-generate.ts";
import {
  AI_CAPABILITY_KEY_PREFIX,
  AI_PROVIDER_KEY_PREFIX,
  botKeyForConnection,
  capabilityKeyForFunction,
  decideAiKillSwitch,
  providerKeyForType,
  type AiFlagEntries,
} from "./ai-kill-switch.ts";

const SUPABASE_URL = "https://projeto-teste.supabase.co";
const PROVIDER_ID = "a1111111-b222-4333-8444-55555555555f";
const PROVIDER_ENDPOINT = "https://provedor-teste.invalid/v1/chat/completions";
const PROVEDOR = {
  id: PROVIDER_ID,
  name: "Provedor Teste",
  provider_type: "openai_compatible",
  api_endpoint: PROVIDER_ENDPOINT,
  api_key_secret_name: "TEST_PROVIDER_KEY",
  model: "modelo-teste",
  system_prompt: null,
  config: null,
  is_active: true,
  is_default: true,
  use_for: ["copilot", "analysis", "summary", "tagging", "auto_reply"],
};

const CAPACIDADE = `${AI_CAPABILITY_KEY_PREFIX}suggest_reply`;
const CAPACIDADE_BOT = `${AI_CAPABILITY_KEY_PREFIX}chatbot_l1`;
const PROVEDOR_CHAVE = `${AI_PROVIDER_KEY_PREFIX}openai`;

/** Entradas de decisão a partir de um mapa simples (ausente = chave fora do mapa). */
function entradas(mapa: Record<string, boolean>): AiFlagEntries {
  return new Map<string, boolean | null>(Object.entries(mapa));
}

function stubEnv(): () => void {
  const prev: Record<string, string | undefined> = {};
  const envs = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-de-teste",
    TEST_PROVIDER_KEY: "chave-de-teste",
  };
  for (const [nome, valor] of Object.entries(envs)) {
    prev[nome] = Deno.env.get(nome);
    Deno.env.set(nome, valor);
  }
  return () => {
    for (const [nome, valor] of Object.entries(prev)) {
      if (valor === undefined) Deno.env.delete(nome);
      else Deno.env.set(nome, valor);
    }
  };
}

interface EstadoStub {
  /** Linhas de `feature_flags` existentes (`key` → `enabled`). Ausente = não existe. */
  flags: Record<string, boolean>;
  /** Status HTTP da leitura de `feature_flags` (500 = leitura falhando). */
  flagsStatus?: number;
  /** Contador que a RPC do circuito devolve (sonda da meia-abertura). */
  probeHits?: number;
}

interface Contadores {
  provedor: number;
  leiturasFlags: number;
  insertsLog: Array<Record<string, unknown>>;
}

/** Lê as chaves que o `.in('key', [...])` pediu (`in.(a,b,c)`), como o PostgREST recebe. */
function chavesPedidas(url: URL): string[] {
  const raw = url.searchParams.get("key") ?? "";
  const m = /^in\.\((.*)\)$/.exec(raw);
  return m ? m[1].split(",").map((k) => k.trim()).filter((k) => k !== "") : [];
}

function stubFetch(estado: EstadoStub): { contadores: Contadores; restaurar: () => void } {
  const contadores: Contadores = { provedor: 0, leiturasFlags: 0, insertsLog: [] };
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const urlTexto = String(input);
    const url = new URL(urlTexto);
    const metodo = init?.method ?? "GET";
    const json = (corpo: unknown, status = 200) =>
      new Response(JSON.stringify(corpo), {
        status,
        headers: { "content-type": "application/json" },
      });

    if (urlTexto.startsWith(PROVIDER_ENDPOINT)) {
      contadores.provedor++;
      return Promise.resolve(json({
        choices: [{ message: { content: "resposta" } }],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
        model: "modelo-teste",
      }));
    }
    if (url.pathname.endsWith("/rest/v1/ai_providers")) {
      return Promise.resolve(json([PROVEDOR]));
    }
    if (url.pathname.endsWith("/rest/v1/feature_flags")) {
      contadores.leiturasFlags++;
      if (estado.flagsStatus && estado.flagsStatus >= 400) {
        return Promise.resolve(json({ message: "indisponivel" }, estado.flagsStatus));
      }
      // Fiel ao PostgREST: devolve SÓ as linhas que existem. Chave ausente não vem.
      const rows = chavesPedidas(url)
        .filter((key) => Object.prototype.hasOwnProperty.call(estado.flags, key))
        .map((key) => ({ key, enabled: estado.flags[key] }));
      return Promise.resolve(json(rows));
    }
    if (url.pathname.includes("/rest/v1/rpc/ai_rate_limit_hit")) {
      return Promise.resolve(json(estado.probeHits ?? 1));
    }
    if (url.pathname.endsWith("/rest/v1/ai_usage_logs")) {
      if (metodo === "GET") return Promise.resolve(json([]));
      const corpo = init?.body ? JSON.parse(String(init.body)) : null;
      const linha = Array.isArray(corpo) ? corpo[0] : corpo;
      if (linha && typeof linha === "object") contadores.insertsLog.push(linha);
      return Promise.resolve(json([], 201));
    }
    return Promise.reject(new Error(`fetch nao esperado no teste: ${metodo} ${urlTexto}`));
  }) as typeof fetch;
  return { contadores, restaurar: () => { globalThis.fetch = undefined as unknown as typeof fetch; globalThis.fetch = original; } };
}

/** Chamada real ao despacho central, com o orçamento desligado (reserva é da IA-044). */
function chamarGenerate() {
  return generateWithRouting({
    purpose: "copilot",
    functionName: "ai-suggest-reply",
    userId: null,
    messages: [{ role: "user", content: "oi" }],
    budgetTokens: 0,
  });
}

// ---------------------------------------------------------------------------
// (f) decisão PURA — cada borda sem I/O
// ---------------------------------------------------------------------------
Deno.test("IA-009: chave de capacidade ausente NEGA (falha fechada) e a ligada LIBERA", () => {
  const alvo = { functionName: "ai-suggest-reply", providerType: "openai_compatible" };

  const ausente = decideAiKillSwitch(entradas({ [PROVEDOR_CHAVE]: true }), alvo);
  assertEquals(ausente.allowed, false, "capacidade sem linha nao pode liberar");
  assertEquals(ausente.code, "flag_absent");
  assertEquals(ausente.key, CAPACIDADE, "a decisao tem de apontar a chave ausente");

  const desligada = decideAiKillSwitch(entradas({ [CAPACIDADE]: false, [PROVEDOR_CHAVE]: true }), alvo);
  assertEquals(desligada.allowed, false);
  assertEquals(desligada.code, "capability_disabled");

  const ligada = decideAiKillSwitch(entradas({ [CAPACIDADE]: true, [PROVEDOR_CHAVE]: true }), alvo);
  assertEquals(ligada.allowed, true, "com as duas chaves ligadas a chamada segue");
  assertEquals(ligada.code, null);
});

Deno.test("IA-009: provedor desligado bloqueia mesmo com a capacidade ligada; leitura falhando nega", () => {
  const alvo = { functionName: "ai-suggest-reply", providerType: "openai_compatible" };

  const provedorDesligado = decideAiKillSwitch(
    entradas({ [CAPACIDADE]: true, [PROVEDOR_CHAVE]: false }),
    alvo,
  );
  assertEquals(provedorDesligado.allowed, false);
  assertEquals(provedorDesligado.code, "provider_disabled");
  assertEquals(provedorDesligado.key, PROVEDOR_CHAVE);

  const semProvedor = decideAiKillSwitch(entradas({ [CAPACIDADE]: true }), alvo);
  assertEquals(semProvedor.allowed, false, "provedor sem linha nao pode liberar");
  assertEquals(semProvedor.code, "flag_absent");

  // Falha de leitura vence TUDO: nem com as duas chaves ligadas a IA age sem prova.
  const falha = decideAiKillSwitch(
    entradas({ [CAPACIDADE]: true, [PROVEDOR_CHAVE]: true }),
    alvo,
    "timeout no PostgREST",
  );
  assertEquals(falha.allowed, false, "leitura falhando tem de negar (nunca liberar)");
  assertEquals(falha.code, "flag_read_error");
});

Deno.test("IA-009: bot é PAUSA explícita — só `false` interrompe; linha ausente não pausa", () => {
  const conexao = "22222222-2222-4222-8222-222222222222";
  const botKey = botKeyForConnection(conexao);
  assert(botKey, "um UUID de conexao tem de produzir a chave de pausa do bot");
  assertEquals(botKeyForConnection(conexao), botKey);
  const alvo = { functionName: "chatbot-l1", connectionId: conexao };

  const semLinha = decideAiKillSwitch(entradas({ [CAPACIDADE_BOT]: true }), alvo);
  assertEquals(semLinha.allowed, true, "conexao sem linha de pausa continua com a automacao normal");

  const pausado = decideAiKillSwitch(
    entradas({ [CAPACIDADE_BOT]: true, [botKey]: false }),
    alvo,
  );
  assertEquals(pausado.allowed, false);
  assertEquals(pausado.code, "bot_paused");
  assertEquals(pausado.key, botKey);
});

Deno.test("IA-009: chave da capacidade sai do slug do desenho e, sem slug, do próprio nome da função", () => {
  assertEquals(capabilityKeyForFunction("ai-suggest-reply"), CAPACIDADE);
  assertEquals(capabilityKeyForFunction("chatbot-l1"), `${AI_CAPABILITY_KEY_PREFIX}chatbot_l1`);
  // Função que consome provedor sem slug no desenho NÃO fica sem chave de desligamento.
  assertEquals(capabilityKeyForFunction("classify-emoji"), `${AI_CAPABILITY_KEY_PREFIX}classify-emoji`);
  // Chave fora do formato do CHECK da tabela não existe: nega em vez de consultar lixo.
  assertEquals(capabilityKeyForFunction("Função Inválida!"), null);
  // IA-009 §2.2: a chave é `ai.provider.openai` (nome do desenho), e o banco diz
  // `provider_type = openai_compatible` — sem a tradução o desligamento do desenho
  // consultaria uma chave que ninguém desliga.
  assertEquals(providerKeyForType("openai_compatible"), PROVEDOR_CHAVE);
  assertEquals(providerKeyForType("google_gemini"), `${AI_PROVIDER_KEY_PREFIX}gemini`);
  assertEquals(providerKeyForType("elevenlabs"), `${AI_PROVIDER_KEY_PREFIX}elevenlabs`);
  assertEquals(providerKeyForType("anthropic"), `${AI_PROVIDER_KEY_PREFIX}anthropic`);
  // Tipo fora do desenho continua com chave própria: nenhum provedor escapa.
  assertEquals(providerKeyForType("custom_webhook"), `${AI_PROVIDER_KEY_PREFIX}custom_webhook`);
});

// ---------------------------------------------------------------------------
// (a)(b)(c)(d)(e) fim a fim no despacho central
// ---------------------------------------------------------------------------
Deno.test("IA-009: capacidade desligada bloqueia SEM fetch ao provedor e sai explícita no ledger", async () => {
  const restaurarEnv = stubEnv();
  const { contadores, restaurar } = stubFetch({ flags: { [CAPACIDADE]: false, [PROVEDOR_CHAVE]: true } });
  try {
    const resultado = await chamarGenerate();

    assertEquals(resultado.ok, false, "capacidade desligada nao pode devolver sucesso");
    assertEquals(resultado.errorCode, "AI_DISABLED");
    assertEquals(resultado.response.status, 503);
    assertEquals(resultado.data, null, "nada do provedor pode ser apresentado como resposta");
    assertEquals(contadores.provedor, 0, "o provedor NEM pode ser chamado com a IA desligada");
    assertEquals(contadores.leiturasFlags, 1, "a flag tem de ser lida no servidor, uma vez por chamada");

    const corpo = JSON.parse(await resultado.response.text()) as { error?: { code?: string; message?: string } };
    assertEquals(corpo.error?.code, "AI_DISABLED", "o codigo do bloqueio tem de ser explicito no corpo");
    assert((corpo.error?.message ?? "").includes(CAPACIDADE), "a mensagem tem de dizer QUAL chave desligou");

    const linha = contadores.insertsLog[0];
    assert(linha, "o bloqueio tem de ser auditado no ledger");
    assertEquals(linha.status, "denied", "'denied' e o status que nao consome a cota de quem chamou");
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-009: provedor desligado bloqueia (e a leitura falhando também) — nunca libera por omissão", async () => {
  const restaurarEnv = stubEnv();

  const primeiro = stubFetch({ flags: { [CAPACIDADE]: true, [PROVEDOR_CHAVE]: false } });
  try {
    const resultado = await chamarGenerate();
    assertEquals(resultado.ok, false);
    assertEquals(resultado.errorCode, "AI_DISABLED");
    assertEquals(primeiro.contadores.provedor, 0, "provedor desligado nao pode ser chamado");
  } finally {
    primeiro.restaurar();
  }

  // Tabela ilegível: nenhuma prova de que a IA está ligada → nega (desenho §2.5).
  const segundo = stubFetch({ flags: {}, flagsStatus: 500 });
  try {
    const resultado = await chamarGenerate();
    assertEquals(resultado.ok, false, "erro de leitura nao pode liberar a IA");
    assertEquals(resultado.errorCode, "AI_DISABLED");
    assertEquals(segundo.contadores.provedor, 0, "sem prova de liberacao o provedor nao pode ser chamado");
    assertEquals(segundo.contadores.insertsLog[0]?.status, "denied");
  } finally {
    segundo.restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-009: com capacidade e provedor LIGADOS o caminho é o de sempre (trava não interfere)", async () => {
  const restaurarEnv = stubEnv();
  const { contadores, restaurar } = stubFetch({ flags: { [CAPACIDADE]: true, [PROVEDOR_CHAVE]: true } });
  try {
    const resultado = await chamarGenerate();

    assertEquals(resultado.ok, true, "com as chaves ligadas a IA tem de responder normalmente");
    assertEquals(resultado.response.status, 200);
    assertEquals(contadores.provedor, 1, "a chamada tinha de chegar ao provedor");
    assertEquals(contadores.insertsLog[0]?.status, "success");
  } finally {
    restaurar();
    restaurarEnv();
  }
});
