// IA-050 — circuit breaker por provedor de IA no despacho central.
//
// Defeito provado na auditoria (IA-CIRCUIT-001): `generateWithRouting` retentava
// e devolvia erro explícito, mas NUNCA suspendia um provedor que só falha — cada
// request novo voltava a bater no provedor caído (fetch real + espera + custo).
//
// O que estes testes fixam (vermelho no código sem o mecanismo, verde com ele):
//   (a) falhas consecutivas do MESMO provedor dentro da janela ABREM o circuito:
//       a tentativa é bloqueada SEM fetch ao provedor e devolve erro explícito
//       503/CIRCUIT_OPEN — nunca resposta vazia apresentada como análise;
//   (b) o bloqueio é registrado no ledger com status 'circuit_open' — não é
//       falha do provedor (não alimenta o limiar) nem chamada paga;
//   (c) passado o cooldown, o circuito vai a MEIA-ABERTURA: uma ÚNICA sonda é
//       admitida (token atômico em edge_rate_limits); sonda negada ou falha da
//       sonda mantêm/reabrem o circuito; sucesso fecha;
//   (d) o desligamento NÃO impede o atendimento humano: o desfecho é `ok:false`
//       explícito, sem lançar e sem tocar `ai_providers.is_active`.
//
// Sem rede real nem banco: `globalThis.fetch` é substituído por um espião que
// responde ao PostgREST (ai_providers, ai_usage_logs, rpc/ai_rate_limit_hit) e
// conta as chamadas ao endpoint do provedor.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
//   supabase/functions/_shared/ai-circuit.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { generateWithRouting } from "./ai-generate.ts";

const SUPABASE_URL = "https://projeto-teste.supabase.co";
const PROVIDER_ID = "11111111-2222-4333-8444-555555555555";
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

/** Fixa as credenciais falsas (PostgREST vai para o fetch espiado, nunca à rede). */
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
  /** Linhas do ledger `ai_usage_logs` devolvidas na leitura (mais novas primeiro). */
  ledger: Array<Record<string, unknown>>;
  /** Contador que a RPC `ai_rate_limit_hit` devolve para a sonda (hits após o incremento). */
  probeHits: number;
  /** Status/body que o ENDPOINT DO PROVEDOR devolve. */
  providerStatus: number;
  providerBody: unknown;
}

interface Contadores {
  provedor: number;
  sonda: number;
  leiturasLedger: number;
  insertsLog: Array<Record<string, unknown>>;
}

function stubFetch(estado: EstadoStub): { contadores: Contadores; restaurar: () => void } {
  const contadores: Contadores = { provedor: 0, sonda: 0, leiturasLedger: 0, insertsLog: [] };
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const metodo = init?.method ?? "GET";
    const json = (corpo: unknown, status = 200) =>
      new Response(JSON.stringify(corpo), {
        status,
        headers: { "content-type": "application/json" },
      });

    if (url.startsWith(PROVIDER_ENDPOINT)) {
      contadores.provedor++;
      return Promise.resolve(json(estado.providerBody, estado.providerStatus));
    }
    if (url.includes("/rest/v1/ai_providers")) {
      return Promise.resolve(json([PROVEDOR]));
    }
    if (url.includes("/rest/v1/rpc/ai_rate_limit_hit")) {
      contadores.sonda++;
      return Promise.resolve(json(estado.probeHits));
    }
    if (url.includes("/rest/v1/ai_usage_logs")) {
      if (metodo === "GET") {
        contadores.leiturasLedger++;
        return Promise.resolve(json(estado.ledger));
      }
      const corpo = init?.body ? JSON.parse(String(init.body)) : null;
      contadores.insertsLog.push(Array.isArray(corpo) ? corpo[0] : corpo);
      return Promise.resolve(json([], 201));
    }
    return Promise.reject(new Error(`fetch nao esperado no teste: ${metodo} ${url}`));
  }) as typeof fetch;
  return { contadores, restaurar: () => { globalThis.fetch = original; } };
}

/** N linhas de erro consecutivas, a mais recente com `idadeMs` (ordem desc, como o select). */
function ledgerComErros(quantidade: number, idadeMs: number, passoMs = 1_000) {
  const agora = Date.now();
  return Array.from({ length: quantidade }, (_, i) => ({
    status: "error",
    created_at: new Date(agora - idadeMs - i * passoMs).toISOString(),
  }));
}

function chamarGenerate() {
  return generateWithRouting({
    purpose: "tagging",
    functionName: "ai-circuit-teste",
    userId: null,
    messages: [{ role: "user", content: "oi" }],
    // Orçamento desligado no teste: isola o circuito (reserva é da IA-044).
    budgetTokens: 0,
  });
}

const SUCESSO_PROVEDOR = {
  choices: [{ message: { content: "resposta" } }],
  usage: { prompt_tokens: 3, completion_tokens: 2 },
  model: "modelo-teste",
};

// ---------------------------------------------------------------------------
// (a)+(b) circuito ABRE: tentativa bloqueada sem fetch, erro explícito e log
// ---------------------------------------------------------------------------
Deno.test("IA-050: falhas repetidas na janela abrem o circuito — bloqueio sem fetch, erro explícito", async () => {
  const restaurarEnv = stubEnv();
  const estado: EstadoStub = {
    // 5 erros consecutivos, o mais recente há 5 s (dentro do cooldown): circuito ABERTO.
    ledger: ledgerComErros(5, 5_000),
    probeHits: 1,
    providerStatus: 200,
    providerBody: SUCESSO_PROVEDOR,
  };
  const { contadores, restaurar } = stubFetch(estado);
  try {
    const resultado = await chamarGenerate();

    assertEquals(resultado.ok, false, "circuito aberto tinha de devolver falha explícita");
    assertEquals(resultado.errorCode, "CIRCUIT_OPEN", "o código do bloqueio tem de ser CIRCUIT_OPEN");
    assertEquals(resultado.response.status, 503, "circuito aberto responde 503 (indisponível), não 200");
    assertEquals(resultado.data, null, "nenhum dado pode ser apresentado como resposta do provedor");
    assertEquals(
      contadores.provedor,
      0,
      "com o circuito aberto NENHUMA chamada pode chegar ao provedor (sem fetch)",
    );
    assertEquals(contadores.sonda, 0, "circuito aberto não consome sonda — sonda é da meia-abertura");

    // O bloqueio fica registrado como 'circuit_open' — não é falha do provedor.
    assertEquals(contadores.insertsLog.length, 1, "o bloqueio tinha de ser auditado no ledger");
    assertEquals(
      contadores.insertsLog[0]?.status,
      "circuit_open",
      "bloqueio de circuito não pode entrar como 'error' (senão alimenta o próprio limiar)",
    );
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-050: poucas falhas NÃO abrem o circuito — o provedor é chamado", async () => {
  const restaurarEnv = stubEnv();
  const estado: EstadoStub = {
    ledger: ledgerComErros(2, 5_000), // abaixo do limiar: circuito FECHADO
    probeHits: 1,
    providerStatus: 200,
    providerBody: SUCESSO_PROVEDOR,
  };
  const { contadores, restaurar } = stubFetch(estado);
  try {
    const resultado = await chamarGenerate();
    assertEquals(resultado.ok, true, "provedor saudável tinha de responder normalmente");
    assertEquals(contadores.provedor, 1, "a chamada tinha de chegar ao provedor");
    assertEquals(contadores.sonda, 0, "circuito fechado não usa sonda");
  } finally {
    restaurar();
    restaurarEnv();
  }
});

// ---------------------------------------------------------------------------
// (c) meia-abertura: sonda única, fecha no sucesso, reabre no fracasso
// ---------------------------------------------------------------------------
Deno.test("IA-050: depois do cooldown a meia-abertura admite UMA sonda — sucesso fecha o circuito", async () => {
  const restaurarEnv = stubEnv();
  const estado: EstadoStub = {
    // 5 erros, o mais recente há 120 s (> cooldown de 60 s): MEIA-ABERTURA.
    ledger: ledgerComErros(5, 120_000),
    probeHits: 1, // primeiro hit da janela: a sonda é admitida
    providerStatus: 200,
    providerBody: SUCESSO_PROVEDOR,
  };
  const { contadores, restaurar } = stubFetch(estado);
  try {
    const sonda = await chamarGenerate();
    assertEquals(sonda.ok, true, "a sonda admitida tinha de chegar ao provedor e ter sucesso");
    assertEquals(contadores.provedor, 1, "a sonda é a ÚNICA chamada admitida");
    assertEquals(contadores.sonda, 1, "a admissão da sonda passa pelo contador atômico");

    // A sonda gravou 'success' no ledger: a próxima admissão vê circuito FECHADO
    // (o sucesso quebra a sequência de erros) e chama sem consumir sonda.
    estado.ledger = [
      { status: "success", created_at: new Date().toISOString() },
      ...estado.ledger,
    ];
    const proxima = await chamarGenerate();
    assertEquals(proxima.ok, true, "circuito fechado pelo sucesso da sonda segue atendendo");
    assertEquals(contadores.provedor, 2);
    assertEquals(contadores.sonda, 1, "fechado não consome token de sonda");
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-050: meia-abertura SEM token de sonda bloqueia sem fetch (sonda única por janela)", async () => {
  const restaurarEnv = stubEnv();
  const estado: EstadoStub = {
    ledger: ledgerComErros(5, 120_000),
    probeHits: 2, // a janela de recuperação já gastou a sonda: este request espera
    providerStatus: 200,
    providerBody: SUCESSO_PROVEDOR,
  };
  const { contadores, restaurar } = stubFetch(estado);
  try {
    const resultado = await chamarGenerate();
    assertEquals(resultado.ok, false);
    assertEquals(resultado.errorCode, "CIRCUIT_OPEN");
    assertEquals(resultado.response.status, 503);
    assertEquals(
      contadores.provedor,
      0,
      "o segundo request da mesma janela NÃO pode virar segunda sonda",
    );
  } finally {
    restaurar();
    restaurarEnv();
  }
});

Deno.test("IA-050: sonda que FALHA reabre o circuito — a admissão seguinte já bloqueia", async () => {
  const restaurarEnv = stubEnv();
  const estado: EstadoStub = {
    ledger: ledgerComErros(5, 120_000),
    probeHits: 1,
    providerStatus: 400, // falha permanente: sem retentativa (rápido) e ainda conta como erro
    providerBody: { error: "provedor quebrou" },
  };
  const { contadores, restaurar } = stubFetch(estado);
  try {
    const sonda = await chamarGenerate();
    assertEquals(sonda.ok, false, "a sonda falhou no provedor");
    assertEquals(sonda.response.status, 400, "o erro real do provedor atravessa para o chamador");
    assertEquals(contadores.provedor, 1, "a sonda foi tentada uma única vez");

    // O fracasso da sonda virou linha 'error' nova (mais recente): o circuito
    // volta a ABERTO e a admissão seguinte bloqueia sem fetch nem sonda.
    estado.ledger = [
      { status: "error", created_at: new Date().toISOString() },
      ...estado.ledger,
    ];
    const proxima = await chamarGenerate();
    assertEquals(proxima.ok, false);
    assertEquals(proxima.errorCode, "CIRCUIT_OPEN");
    assertEquals(contadores.provedor, 1, "circuito reaberto não pode gerar nova chamada");
    assertEquals(contadores.sonda, 1, "circuito reaberto não consome sonda nova");
  } finally {
    restaurar();
    restaurarEnv();
  }
});

// ---------------------------------------------------------------------------
// (d) derivação pura do estado: limites de escopo do circuito
// ---------------------------------------------------------------------------
Deno.test("IA-050: deriveCircuitVerdict — limiar, janela, cooldown e o que NÃO é falha de provedor", async () => {
  const { deriveCircuitVerdict } = await import("./ai-circuit.ts");
  const agora = Date.now();
  const iso = (idadeMs: number) => new Date(agora - idadeMs).toISOString();

  // Abaixo do limiar → fechado.
  assertEquals(
    deriveCircuitVerdict(
      [{ status: "error", created_at: iso(1_000) }, { status: "error", created_at: iso(2_000) }],
      agora,
      { failureThreshold: 3, windowMs: 300_000, cooldownMs: 60_000 },
    ).state,
    "closed",
  );

  // No limiar, falha recente → aberto.
  const aberto = deriveCircuitVerdict(
    [
      { status: "error", created_at: iso(1_000) },
      { status: "error", created_at: iso(2_000) },
      { status: "error", created_at: iso(3_000) },
    ],
    agora,
    { failureThreshold: 3, windowMs: 300_000, cooldownMs: 60_000 },
  );
  assertEquals(aberto.state, "open");
  assertEquals(aberto.consecutiveFailures, 3);

  // No limiar, última falha além do cooldown → meia-abertura.
  assertEquals(
    deriveCircuitVerdict(
      [
        { status: "error", created_at: iso(120_000) },
        { status: "error", created_at: iso(121_000) },
        { status: "error", created_at: iso(122_000) },
      ],
      agora,
      { failureThreshold: 3, windowMs: 300_000, cooldownMs: 60_000 },
    ).state,
    "half_open",
  );

  // Sucesso no topo quebra a sequência → fechado mesmo com erros logo abaixo.
  assertEquals(
    deriveCircuitVerdict(
      [
        { status: "success", created_at: iso(500) },
        { status: "error", created_at: iso(1_000) },
        { status: "error", created_at: iso(2_000) },
        { status: "error", created_at: iso(3_000) },
      ],
      agora,
      { failureThreshold: 3, windowMs: 300_000, cooldownMs: 60_000 },
    ).state,
    "closed",
  );

  // 'circuit_open'/'denied' NÃO são desfecho do provedor: não contam como falha
  // e NÃO quebram a sequência (senão o próprio bloqueio esvaziava o circuito).
  const ignorados = deriveCircuitVerdict(
    [
      { status: "circuit_open", created_at: iso(500) },
      { status: "denied", created_at: iso(700) },
      { status: "error", created_at: iso(1_000) },
      { status: "error", created_at: iso(2_000) },
      { status: "error", created_at: iso(3_000) },
    ],
    agora,
    { failureThreshold: 3, windowMs: 300_000, cooldownMs: 60_000 },
  );
  assertEquals(ignorados.state, "open", "linhas sem chamada ao provedor têm de ser ignoradas");
  assertEquals(ignorados.consecutiveFailures, 3);

  // Falhas FORA da janela não abrem o circuito.
  assertEquals(
    deriveCircuitVerdict(
      [
        { status: "error", created_at: iso(400_000) },
        { status: "error", created_at: iso(401_000) },
        { status: "error", created_at: iso(402_000) },
      ],
      agora,
      { failureThreshold: 3, windowMs: 300_000, cooldownMs: 60_000 },
    ).state,
    "closed",
  );

  // Linha malformada não derruba a derivação.
  assertEquals(
    deriveCircuitVerdict(
      [{ status: "error", created_at: "lixo" }, { status: null, created_at: iso(1) }],
      agora,
      { failureThreshold: 1, windowMs: 300_000, cooldownMs: 60_000 },
    ).state,
    "closed",
  );
});
