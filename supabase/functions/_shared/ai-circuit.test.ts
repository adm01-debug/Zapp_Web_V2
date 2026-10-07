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
// A rota devolve letras maiúsculas de propósito: circuito e logger precisam
// convergir para a mesma chave UUID canônica em minúsculas.
const PROVIDER_ID = "A1111111-B222-4333-8444-55555555555F";
const PROVIDER_KEY = PROVIDER_ID.toLowerCase();
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
  consultasLedger: string[];
  insertsLog: Array<Record<string, unknown>>;
}

function stubFetch(estado: EstadoStub): { contadores: Contadores; restaurar: () => void } {
  const contadores: Contadores = {
    provedor: 0,
    sonda: 0,
    leiturasLedger: 0,
    consultasLedger: [],
    insertsLog: [],
  };
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
        contadores.consultasLedger.push(url);
        // Fiel ao PostgREST: a leitura devolve o que as insercoes ANTERIORES
        // gravaram (mais novo primeiro), nunca uma fixture estatica — e isso que
        // faz o circuito reagir ao que ele mesmo auditou.
        return Promise.resolve(json(ordenarLedger(estado.ledger)));
      }
      const corpo = init?.body ? JSON.parse(String(init.body)) : null;
      const linha = Array.isArray(corpo) ? corpo[0] : corpo;
      contadores.insertsLog.push(linha);
      if (linha && typeof linha === "object") {
        // O banco preenche `created_at` (default now()); sem a coluna a linha
        // gravada seria invisivel para a leitura do circuito (`status`+`created_at`).
        estado.ledger.unshift({
          ...(linha as Record<string, unknown>),
          created_at: new Date().toISOString(),
        });
      }
      return Promise.resolve(json([], 201));
    }
    return Promise.reject(new Error(`fetch nao esperado no teste: ${metodo} ${url}`));
  }) as typeof fetch;
  return { contadores, restaurar: () => { globalThis.fetch = original; } };
}

/** Prova o elo do circuito com o ledger real: mesma chave e só desfechos reais. */
function assertConsultaLedger(contadores: Contadores): void {
  assert(contadores.consultasLedger.length > 0, "o circuito tinha de consultar ai_usage_logs");
  const consulta = new URL(contadores.consultasLedger.at(-1)!);
  assertEquals(
    consulta.searchParams.get("metadata->>provider_id"),
    `eq.${PROVIDER_KEY}`,
    "o GET precisa filtrar metadata.provider_id pela chave canônica do provedor",
  );
  assertEquals(
    consulta.searchParams.get("status"),
    "in.(success,error)",
    "o GET precisa considerar somente os desfechos success/error do provedor",
  );
}

/** Prova que todos os desfechos gravam a mesma chave que o circuito consulta. */
function assertLogComProvider(contadores: Contadores, status: string): void {
  const linha = contadores.insertsLog.find((item) => item?.status === status);
  assert(linha, `faltou insert de ai_usage_logs com status ${status}`);
  const metadata = linha.metadata as Record<string, unknown> | undefined;
  assertEquals(
    metadata?.provider_id,
    PROVIDER_KEY,
    `o log ${status} precisa gravar a mesma chave minúscula consultada pelo circuito`,
  );
}

/** Ordena o ledger da leitura como o `select` ordena: mais novo primeiro. */
function ordenarLedger(linhas: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return [...linhas].sort((a, b) =>
    Date.parse(String(b.created_at ?? "")) - Date.parse(String(a.created_at ?? ""))
  );
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
    assertConsultaLedger(contadores);

    // O bloqueio fica registrado como 'circuit_open' — não é falha do provedor.
    assertEquals(contadores.insertsLog.length, 1, "o bloqueio tinha de ser auditado no ledger");
    assertEquals(
      contadores.insertsLog[0]?.status,
      "circuit_open",
      "bloqueio de circuito não pode entrar como 'error' (senão alimenta o próprio limiar)",
    );
    assertLogComProvider(contadores, "circuit_open");
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
    assertConsultaLedger(contadores);
    assertLogComProvider(contadores, "success");
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

Deno.test("IA-050: sonda que FALHA (5xx do provedor) reabre o circuito — a admissão seguinte já bloqueia", async () => {
  const restaurarEnv = stubEnv();
  const estado: EstadoStub = {
    ledger: ledgerComErros(5, 120_000),
    probeHits: 1,
    providerStatus: 503, // falha TRANSITÓRIA do provedor (IA-042): retenta e conta como 'error'
    providerBody: { error: "provedor indisponivel" },
  };
  const { contadores, restaurar } = stubFetch(estado);
  try {
    const sonda = await chamarGenerate();
    assertEquals(sonda.ok, false, "a sonda falhou no provedor");
    assertEquals(sonda.response.status, 503, "o erro real do provedor atravessa para o chamador");
    assert(contadores.provedor >= 1, "a sonda foi tentada");
    assertConsultaLedger(contadores);
    assertLogComProvider(contadores, "error");

    // O 5xx é FALHA DO PROVEDOR: entra no ledger como 'error' — é o desfecho que
    // reabre o circuito. A admissão seguinte bloqueia sem fetch nem sonda nova.
    const ultimoLog = contadores.insertsLog.at(-1) as { status?: string };
    assertEquals(ultimoLog?.status, "error", "5xx do provedor tem de contar como falha");
    const aposSonda = contadores.provedor;
    estado.ledger = [
      { status: "error", created_at: new Date().toISOString() },
      ...estado.ledger,
    ];
    const proxima = await chamarGenerate();
    assertEquals(proxima.ok, false);
    assertEquals(proxima.errorCode, "CIRCUIT_OPEN");
    assertEquals(contadores.provedor, aposSonda, "circuito reaberto não pode gerar nova chamada");
    assertEquals(contadores.sonda, 1, "circuito reaberto não consome sonda nova");
  } finally {
    restaurar();
    restaurarEnv();
  }
});

// ---------------------------------------------------------------------------
// (a') 4xx do PEDIDO não é falha do provedor: NÃO abre o circuito — e a mesma
// ledger realimentada prova que a falha TRANSITÓRIA do provedor continua abrindo
// ---------------------------------------------------------------------------
Deno.test("IA-050: seis 4xx do pedido não abrem o circuito e a falha transitória ainda abre", async () => {
  const restaurarEnv = stubEnv();
  const estado: EstadoStub = {
    // Ledger VAZIO: tudo o que a leitura devolver veio dos INSERTs desta execução
    // (o stub de leitura REALIMENTA o ledger — nada de fixture estática).
    ledger: [],
    probeHits: 1,
    providerStatus: 400, // pedido inválido (ex.: prompt malformado) — culpa do chamador
    providerBody: { error: "pedido invalido" },
  };
  const { contadores, restaurar } = stubFetch(estado);
  try {
    // (1) SEIS rejeições 4xx do MESMO chamador. Cada admissão LÊ o ledger, e a
    // leitura devolve o que as inserções anteriores gravaram.
    for (let tentativa = 1; tentativa <= 6; tentativa++) {
      const r = await chamarGenerate();
      assertEquals(r.ok, false, `tentativa ${tentativa}: o 4xx é falha explícita`);
      assertEquals(r.response.status, 400, "o 400 real do provedor atravessa para o chamador");
      // Sem a correção o limiar já teria bloqueado: aqui o provedor SEGUE sendo chamado.
      assertEquals(
        contadores.provedor,
        tentativa,
        "cada 4xx do pedido tem de chegar ao provedor (o circuito não abre)",
      );
      assertEquals(
        contadores.insertsLog.length,
        tentativa,
        "cada tentativa tem de ser auditada no ledger",
      );
    }

    // A leitura do circuito rodou a cada admissão, e as linhas gravadas entraram
    // no ledger como 'request_error' — auditadas, não silenciadas.
    assert(contadores.leiturasLedger >= 6, "o circuito tem de LER o ledger a cada admissão");
    for (const linha of contadores.insertsLog) {
      assertEquals(
        (linha as { status?: string }).status,
        "request_error",
        "4xx causado pelo pedido não pode contar como falha do provedor",
      );
    }

    // Derivação sobre o ledger REALIMENTADO (o mesmo que a leitura devolveu):
    // 'request_error' não conta como falha nem quebra a sequência.
    const { deriveCircuitVerdict } = await import("./ai-circuit.ts");
    const linhasDoLedger = estado.ledger.map((l) => ({
      status: (l.status ?? null) as string | null,
      created_at: (l.created_at ?? null) as string | null,
    }));
    const veredito = deriveCircuitVerdict(linhasDoLedger, Date.now(), {
      failureThreshold: 5,
      windowMs: 300_000,
      cooldownMs: 60_000,
    });
    assertEquals(veredito.state, "closed", "seis 4xx do pedido não podem abrir o circuito");
    assertEquals(veredito.consecutiveFailures, 0);

    // E as seis tentativas seguem RECONCILIADAS como falha do pedido (não somem).
    const { reconciliarConsumo } = await import("./ai-usage.ts");
    const reconciliacao = reconciliarConsumo(
      contadores.insertsLog.map((linha, i) => ({
        id: `log-${i}`,
        status: (linha as { status?: string }).status ?? null,
      })),
    );
    assertEquals(reconciliacao.falhas, 6, "as seis rejeições continuam contadas como falha");

    // (2) A MESMA ledger, agora com falha TRANSITÓRIA do provedor (5xx): o
    // circuito volta a contar e ABRE no limiar — o 4xx não o cegou.
    estado.providerStatus = 503;
    estado.providerBody = { error: "provedor indisponivel" };
    let abriu = false;
    let ultimoStatus: string | undefined;
    for (let tentativa = 0; tentativa < 6 && !abriu; tentativa++) {
      const r = await chamarGenerate();
      if (r.errorCode === "CIRCUIT_OPEN") {
        abriu = true;
        break;
      }
      assertEquals(r.ok, false, "o 5xx do provedor é falha explícita");
      ultimoStatus = (contadores.insertsLog.at(-1) as { status?: string })?.status;
    }
    assert(abriu, "a falha transitória do provedor tem de abrir o circuito no limiar");
    assertEquals(ultimoStatus, "error", "o 5xx do provedor entra no ledger como 'error'");
    const provedorAposAbrir = contadores.provedor;
    const bloqueada = await chamarGenerate();
    assertEquals(
      bloqueada.errorCode,
      "CIRCUIT_OPEN",
      "circuito aberto bloqueia a admissão seguinte",
    );
    assertEquals(bloqueada.response.status, 503);
    assertEquals(
      contadores.provedor,
      provedorAposAbrir,
      "circuito aberto não faz fetch ao provedor",
    );
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
