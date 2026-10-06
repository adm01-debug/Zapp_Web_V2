/**
 * R2-API-045 (#219) — contrato executável do consumidor da mensagem de ausência.
 *
 * O que fica travado:
 *   1. fora do expediente + `is_enabled` → a mensagem sai UMA vez, pelo token da
 *      INSTÂNCIA (`get_instance_token`), com o número normalizado do contato;
 *   2. `is_enabled = false`, conteúdo vazio, dentro do expediente, sem
 *      `business_hours` ou sem token de instância → NENHUM POST;
 *   3. quem escreve várias vezes no mesmo período fechado não recebe a mesma
 *      mensagem de novo (janela de 24 h por contato);
 *   4. `{variavel}` que não existe ou texto que fica vazio → NÃO envia (cliente
 *      real nunca recebe placeholder nem mensagem vazia);
 *   5. R2-API-008 — só HTTP 2xx é anunciado como enviada; 4xx/5xx é `rejected` e
 *      queda de transporte é `unknown`;
 *   6. o webhook de entrada (handleIncomingMessage) é quem dispara o consumidor:
 *      mensagem recebida fora do horário → 1 POST; replay/edição do mesmo evento
 *      e opt-out → nenhum.
 *
 * Relógio e payload são fixtures (contato sintético), Evolution falsa: nada sai
 * para a rede.
 */
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  businessHoursState,
  maybeSendAwayMessage,
  minutesOfDay,
  parseAwayConfig,
  parseBusinessHours,
  renderAwayContent,
} from "../away-message.ts";
import type { BusinessHourRow } from "../away-message.ts";
import { handleIncomingMessage, resetOptOutKeywordCache } from "../evolution-webhook-messages.ts";
import { translateGoPayload } from "../evolution-go-adapter.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

type Chamada = { nome: string; args: Record<string, unknown> };
type Filtro = { tabela: string; coluna: string; valor: unknown };

interface FakeConfig {
  away?: unknown;
  hours?: unknown[];
  respostasAnteriores?: unknown[];
  erroAway?: { message: string } | null;
  erroHoras?: { message: string } | null;
  erroMensagens?: { message: string } | null;
  instanceToken?: unknown;
  keywords?: Array<{ keyword: string; match_mode: string }>;
  recentSend?: unknown[];
  suppressions?: unknown[];
  autoreply?: unknown;
  ingestOutcome?: "inserted" | "updated" | "duplicate";
  filtros?: Filtro[];
}

/** Seed da X029 (todas `exact`), igual ao teste do opt-out. */
const SEED = [
  "sair", "parar", "pare", "stop", "cancelar",
  "remover", "descadastrar", "unsubscribe", "optout", "nao quero",
].map((keyword) => ({ keyword, match_mode: "exact" }));

/** Todos os dias fechados: o relógio real nunca importa para o veredito. */
const TODOS_FECHADOS = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
  day_of_week: dia, is_open: false, open_time: "09:00:00", close_time: "18:00:00",
}));

const SEMANA_9_18: BusinessHourRow[] = [1, 2, 3, 4, 5].map((dia) => ({
  day_of_week: dia, is_open: true, open_time: "09:00:00", close_time: "18:00:00",
}));

/**
 * Dublê do client admin. Cada `from(tabela)` cria a PRÓPRIA cadeia, com a tabela
 * capturada no fecho: nenhum handler concorrente (o fire-and-forget do webhook)
 * consegue trocar a tabela no meio de um `await`.
 */
function fakeSupabase(chamadas: Chamada[], cfg: FakeConfig) {
  const registrar = (tabela: string) => ({
    select: () => fila(tabela),
    insert: () => fila(tabela),
    update: () => fila(tabela),
    upsert: () => fila(tabela),
    delete: () => fila(tabela),
  });
  function fila(tabela: string): unknown {
    const chain: Record<string, unknown> = {};
    const mesmo = () => chain;
    for (const metodo of ["select", "eq", "in", "is", "not", "order", "limit", "update", "insert", "upsert", "delete"]) {
      chain[metodo] = mesmo;
    }
    chain.gte = (coluna: string, valor: unknown) => {
      cfg.filtros?.push({ tabela, coluna, valor });
      return chain;
    };
    chain.maybeSingle = () => {
      if (tabela === "whatsapp_connections") return { data: { id: "conn-1" }, error: null };
      if (tabela === "away_messages") return { data: cfg.away ?? null, error: cfg.erroAway ?? null };
      if (tabela === "talkx_settings") return { data: { value: cfg.autoreply ?? null }, error: null };
      return { data: null, error: null };
    };
    chain.single = chain.maybeSingle;
    chain.then = (resolve: (value: unknown) => unknown) => {
      if (tabela === "business_hours") return resolve({ data: cfg.hours ?? [], error: cfg.erroHoras ?? null });
      if (tabela === "messages") return resolve({ data: cfg.respostasAnteriores ?? [], error: cfg.erroMensagens ?? null });
      if (tabela === "talkx_optout_keywords") return resolve({ data: cfg.keywords ?? SEED, error: null });
      if (tabela === "talkx_recipients") return resolve({ data: cfg.recentSend ?? [], error: null });
      return resolve({ data: [], error: null });
    };
    return chain;
  }

  let supressao = 0;
  return {
    from: (tabela: string) => registrar(tabela),
    rpc: (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      if (nome === "ingest_inbound_message") {
        return {
          data: [{
            contact_id: "contact-1",
            contact_name: "Contato Fixture",
            assigned_to: null,
            avatar_url: "https://example.invalid/avatar.jpg",
            contact_created: false,
            message_id: "msg-1",
            outcome: cfg.ingestOutcome ?? "inserted",
          }],
          error: null,
        };
      }
      if (nome === "get_instance_token") return { data: cfg.instanceToken ?? null, error: null };
      if (nome === "talkx_suppress_contact") {
        const seq = cfg.suppressions ?? ["supp-1"];
        const valor = seq[Math.min(supressao, seq.length - 1)];
        supressao += 1;
        return { data: valor, error: null };
      }
      if (nome === "attribute_talkx_reply") return { data: { attributed: true }, error: null };
      if (nome === "attribute_multiplix_item_reply") return { data: { attributed: false }, error: null };
      return { data: null, error: null };
    },
  } as unknown as EvolutionDbClient;
}

const originalFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string; init: RequestInit }> = [];

function instalarFetchFalso(status = 200, falhaDeTransporte: string | null = null): void {
  fetchCalls = [];
  (globalThis as { fetch: typeof fetch }).fetch = ((url: unknown, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
    fetchCalls.push({ url: u, init: init ?? {} });
    if (falhaDeTransporte) return Promise.reject(new Error(falhaDeTransporte));
    return Promise.resolve(new Response(JSON.stringify(
      status >= 400 ? { error: "provedor recusou (fixture)" } : { ok: true },
    ), { status, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;
}

function restaurarFetch(): void {
  (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
}

function prepararAmbiente(): void {
  Deno.env.set("EVOLUTION_API_URL", "https://evolution.invalid");
  Deno.env.set("EVOLUTION_API_KEY", "chave-global-fixture");
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
}

interface LogsCapturados { texto: () => string; restaurar: () => void; }

function coletarLogs(): LogsCapturados {
  const linhas: string[] = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  const juntar = (...args: unknown[]) => args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ");
  console.warn = (...args: unknown[]) => { linhas.push(juntar(...args)); };
  console.error = (...args: unknown[]) => { linhas.push(juntar(...args)); };
  return {
    texto: () => linhas.join("\n"),
    restaurar: () => { console.warn = originalWarn; console.error = originalError; },
  };
}

/** Payload GO anonimizado de mensagem recebida. */
function goIncoming(texto: string, id = "3EB0AWAY"): Record<string, unknown> {
  return {
    event: "message",
    instanceName: "inst-go-away",
    data: {
      Info: {
        ID: id,
        Chat: "5511000000000@s.whatsapp.net",
        Sender: "5511000000001@c.us",
        PushName: "Contato Fixture",
        Timestamp: "2026-10-03T12:00:00.000Z",
        IsFromMe: false,
      },
      Message: { conversation: texto },
    },
  };
}

function traduzir(payload: Record<string, unknown>) {
  const recebida = translateGoPayload(payload);
  const data = recebida.data as Record<string, unknown>;
  const key = data.key as { id: string; remoteJid?: string; remoteJidAlt?: string; fromMe: boolean };
  return { data, key };
}

/** Mensagem de ausência habilitada, com o texto do diálogo. */
const AWAY = { content: "Estamos fora do horário de atendimento. Retornaremos em breve!", is_enabled: true };

// ── Regras puras ────────────────────────────────────────────────────────────

Deno.test("R2-API-045: businessHoursState separa aberto, fechado e indeterminado", () => {
  // segunda 10:00 e 20:00 em America/Sao_Paulo (UTC-3, sem horário de verão)
  assertEquals(businessHoursState(SEMANA_9_18, new Date("2026-10-05T13:00:00Z")), "open");
  assertEquals(businessHoursState(SEMANA_9_18, new Date("2026-10-05T23:00:00Z")), "closed");
  // domingo não tem linha aberta
  assertEquals(businessHoursState(SEMANA_9_18, new Date("2026-10-04T13:00:00Z")), "closed");
  // sem horário configurado e fuso inválido NÃO podem virar "fechado" (envio)
  assertEquals(businessHoursState([], new Date()), "unknown");
  assertEquals(businessHoursState(SEMANA_9_18, new Date(), "Fuso/Inexistente"), "unknown");
});

Deno.test("R2-API-045: janela que vira a meia-noite continua aberta na madrugada", () => {
  const madrugada: BusinessHourRow[] = [
    { day_of_week: 1, is_open: true, open_time: "22:00", close_time: "06:00" },
  ];
  // segunda 22:00 → dentro da janela de segunda
  assertEquals(businessHoursState(madrugada, new Date("2026-10-06T01:00:00Z")), "open");
  // terça 03:00 → madrugada da janela que começou na segunda
  assertEquals(businessHoursState(madrugada, new Date("2026-10-06T06:00:00Z")), "open");
  // terça 12:00 e segunda 12:00 → fechado
  assertEquals(businessHoursState(madrugada, new Date("2026-10-06T15:00:00Z")), "closed");
  assertEquals(businessHoursState(madrugada, new Date("2026-10-05T15:00:00Z")), "closed");
});

Deno.test("R2-API-045: leitura de away_messages/business_hours é defensiva", () => {
  assertEquals(minutesOfDay("09:00"), 540);
  assertEquals(minutesOfDay("18:00:00"), 1080);
  assertEquals(minutesOfDay("09:70"), null);
  assertEquals(minutesOfDay(null), null);

  assertEquals(parseAwayConfig(null), null);
  assertEquals(parseAwayConfig({ content: "   ", is_enabled: true }), null);
  assertEquals(parseAwayConfig({ content: "Fora do ar", is_enabled: true }), { content: "Fora do ar", isEnabled: true });
  assertEquals(parseAwayConfig({ content: "Fora do ar", is_enabled: false }), { content: "Fora do ar", isEnabled: false });

  const horas = parseBusinessHours([
    { day_of_week: 1, is_open: true, open_time: "09:00:00", close_time: "18:00:00" },
    { day_of_week: 9, is_open: true, open_time: "09:00:00", close_time: "18:00:00" },
    { nada: true },
  ]);
  assertEquals(horas.length, 1);
  assertEquals(parseBusinessHours(null), []);
});

Deno.test("R2-API-045: variável não suportada ou texto vazio nunca vai para o cliente", () => {
  const ok = renderAwayContent("Olá {nome}! Voltamos às {horario_abertura}.", {
    nome: "Contato Fixture", horario_abertura: "09:00",
  });
  assertEquals(ok, { status: "ok", content: "Olá Contato Fixture! Voltamos às 09:00." });

  // nome ausente: o token sai e o espaço antes da pontuação é limpo
  assertEquals(
    renderAwayContent("Olá {nome}, estamos fora.", { nome: null }),
    { status: "ok", content: "Olá, estamos fora." },
  );
  assertEquals(renderAwayContent("Fale com {atendente}.", {}).status, "invalid");
  assertEquals(renderAwayContent("{nome}", { nome: null }).status, "invalid");
  assertEquals(renderAwayContent("   ", {}).status, "invalid");
});

// ── Consumidor (decisão + entrega) ──────────────────────────────────────────

Deno.test("R2-API-045: fora do expediente envia 1x pelo token da instância", async () => {
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    const filtros: Filtro[] = [];
    const supabase = fakeSupabase(chamadas, {
      away: AWAY, hours: TODOS_FECHADOS, instanceToken: "token-inst-1", filtros,
    });

    const saida = await maybeSendAwayMessage(supabase, {
      connectionId: "conn-1",
      instance: "inst-away-a",
      phone: "5511000000000",
      contactId: "contact-1",
      contactName: "Contato Fixture",
      now: new Date("2026-10-05T23:00:00Z"),
    });

    assertEquals(saida, "sent");
    assertEquals(fetchCalls.length, 1, "1 POST de mensagem de ausência");
    assertEquals(fetchCalls[0].url, "https://evolution.invalid/send/text");
    const headers = fetchCalls[0].init.headers as Record<string, string>;
    assertEquals(headers.apikey, "token-inst-1", "sai pelo token da instância, não pela key global");
    const body = JSON.parse(String(fetchCalls[0].init.body)) as { text?: string; number?: string };
    assertEquals(body.text, AWAY.content);
    assertEquals(body.number, "5511000000000");

    const tokens = chamadas.filter((c) => c.nome === "get_instance_token");
    assertEquals(tokens.length, 1);
    assertEquals(tokens[0].args.p_instance_id, "inst-away-a");
    // a janela de 24 h é medida a partir do relógio injetado
    const corte = filtros.find((f) => f.tabela === "messages" && f.coluna === "created_at");
    assertEquals(corte?.valor, "2026-10-04T23:00:00.000Z");
  } finally {
    restaurarFetch();
  }
});

Deno.test("R2-API-045: variáveis do diálogo são substituídas antes de enviar", async () => {
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const supabase = fakeSupabase([], {
      away: { content: "{nome}, voltamos às {horario_fechamento}.", is_enabled: true },
      hours: TODOS_FECHADOS,
      instanceToken: "token-inst-1",
    });

    const saida = await maybeSendAwayMessage(supabase, {
      connectionId: "conn-1",
      instance: "inst-away-b",
      phone: "5511000000000",
      contactId: "contact-1",
      contactName: "Contato Fixture",
      now: new Date("2026-10-05T23:00:00Z"), // segunda 20:00 → {horario_fechamento} = 18:00
    });

    assertEquals(saida, "sent");
    const body = JSON.parse(String(fetchCalls[0].init.body)) as { text?: string };
    assertEquals(body.text, "Contato Fixture, voltamos às 18:00.");
  } finally {
    restaurarFetch();
  }
});

Deno.test("R2-API-045: desabilitada, dentro do expediente, sem horário ou sem token não envia", async () => {
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const casos: Array<{ nome: string; cfg: FakeConfig; now: string }> = [
      { nome: "is_enabled = false", cfg: { away: { ...AWAY, is_enabled: false }, hours: TODOS_FECHADOS, instanceToken: "t" }, now: "2026-10-05T23:00:00Z" },
      { nome: "conteúdo vazio", cfg: { away: { content: "   ", is_enabled: true }, hours: TODOS_FECHADOS, instanceToken: "t" }, now: "2026-10-05T23:00:00Z" },
      { nome: "variável não suportada", cfg: { away: { content: "Fale com {atendente}", is_enabled: true }, hours: TODOS_FECHADOS, instanceToken: "t" }, now: "2026-10-05T23:00:00Z" },
      { nome: "dentro do expediente", cfg: { away: AWAY, hours: SEMANA_9_18, instanceToken: "t" }, now: "2026-10-05T13:00:00Z" },
      { nome: "sem business_hours", cfg: { away: AWAY, hours: [], instanceToken: "t" }, now: "2026-10-05T23:00:00Z" },
      { nome: "sem token da instância", cfg: { away: AWAY, hours: TODOS_FECHADOS, instanceToken: null }, now: "2026-10-05T23:00:00Z" },
      { nome: "sem configuração salva", cfg: { away: null, hours: TODOS_FECHADOS, instanceToken: "t" }, now: "2026-10-05T23:00:00Z" },
    ];

    for (const caso of casos) {
      const supabase = fakeSupabase([], caso.cfg);
      const saida = await maybeSendAwayMessage(supabase, {
        connectionId: "conn-1",
        instance: `inst-away-${caso.nome}`,
        phone: "5511000000000",
        contactId: "contact-1",
        contactName: "Contato Fixture",
        now: new Date(caso.now),
      });
      assertEquals(saida, "skipped", `caso "${caso.nome}" não pode enviar`);
    }
    assertEquals(fetchCalls.length, 0, "nenhum POST em nenhum dos casos");
  } finally {
    restaurarFetch();
  }
});

Deno.test("R2-API-045: quem já recebeu a mensagem nas últimas 24h não recebe de novo", async () => {
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const supabase = fakeSupabase([], {
      away: AWAY, hours: TODOS_FECHADOS, instanceToken: "token-inst-1",
      respostasAnteriores: [{ id: "msg-away-anterior" }],
    });

    const saida = await maybeSendAwayMessage(supabase, {
      connectionId: "conn-1",
      instance: "inst-away-backoff",
      phone: "5511000000000",
      contactId: "contact-1",
      contactName: "Contato Fixture",
      now: new Date("2026-10-05T23:05:00Z"),
    });

    assertEquals(saida, "skipped");
    assertEquals(fetchCalls.length, 0, "a segunda mensagem do mesmo contato não repete o aviso");
  } finally {
    restaurarFetch();
  }
});

Deno.test("R2-API-045: falha ao conferir resposta anterior é conservadora (não envia)", async () => {
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const supabase = fakeSupabase([], {
      away: AWAY, hours: TODOS_FECHADOS, instanceToken: "token-inst-1",
      erroMensagens: { message: "connection reset by peer" },
    });

    const saida = await maybeSendAwayMessage(supabase, {
      connectionId: "conn-1",
      instance: "inst-away-erro",
      phone: "5511000000000",
      contactId: "contact-1",
      contactName: "Contato Fixture",
      now: new Date("2026-10-05T23:00:00Z"),
    });

    assertEquals(saida, "skipped");
    assertEquals(fetchCalls.length, 0, "sem prova de que não respondemos, não arrisca duplicar");
  } finally {
    restaurarFetch();
  }
});

Deno.test("R2-API-008: recusa do provedor e queda de transporte não são anunciadas como enviada", async () => {
  const logs = coletarLogs();
  try {
    prepararAmbiente();
    const pedido = {
      connectionId: "conn-1",
      phone: "5511000000000",
      contactId: "contact-1",
      contactName: "Contato Fixture",
      now: new Date("2026-10-05T23:00:00Z"),
    };

    instalarFetchFalso(500);
    const supabase = fakeSupabase([], { away: AWAY, hours: TODOS_FECHADOS, instanceToken: "token-inst-1" });
    const rejeitada = await maybeSendAwayMessage(supabase, { ...pedido, instance: "inst-away-500" });
    assertEquals(rejeitada, "rejected");
    assertStringIncludes(logs.texto(), "rejected");
    assertStringIncludes(logs.texto(), "500");

    restaurarFetch();
    instalarFetchFalso(200, "timeout simulado (fixture)");
    const supabase2 = fakeSupabase([], { away: AWAY, hours: TODOS_FECHADOS, instanceToken: "token-inst-1" });
    const desconhecida = await maybeSendAwayMessage(supabase2, { ...pedido, instance: "inst-away-timeout" });
    assertEquals(desconhecida, "unknown");
    assertStringIncludes(logs.texto(), "unknown");
    assertEquals(
      logs.texto().includes("Mensagem de ausência enviada"),
      false,
      "sem 2xx não dá para afirmar que a mensagem saiu",
    );
  } finally {
    restaurarFetch();
    logs.restaurar();
  }
});

Deno.test("R2-API-045: com 2xx a mensagem de ausência é anunciada como enviada", async () => {
  instalarFetchFalso(200);
  const logs = coletarLogs();
  try {
    prepararAmbiente();
    const supabase = fakeSupabase([], { away: AWAY, hours: TODOS_FECHADOS, instanceToken: "token-inst-1" });
    const saida = await maybeSendAwayMessage(supabase, {
      connectionId: "conn-1",
      instance: "inst-away-ok",
      phone: "5511000000000",
      contactId: "contact-1",
      contactName: "Contato Fixture",
      now: new Date("2026-10-05T23:00:00Z"),
    });
    assertEquals(saida, "sent");
    assertStringIncludes(logs.texto(), "accepted");
  } finally {
    restaurarFetch();
    logs.restaurar();
  }
});

// ── Ligação com o webhook de entrada ────────────────────────────────────────

Deno.test("R2-API-045: mensagem recebida fora do expediente fecha o ciclo configuração→entrega", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, { away: AWAY, hours: TODOS_FECHADOS, instanceToken: "token-inst-1" });

    const { data, key } = traduzir(goIncoming("Bom dia, preciso de uma ajuda", "3EB0AWAY1"));
    await handleIncomingMessage(supabase, "inst-go-away-1", data, key, "http://localhost:54321", "svc");

    assertEquals(fetchCalls.length, 1, "o webhook de entrada é quem dispara o consumidor");
    const body = JSON.parse(String(fetchCalls[0].init.body)) as { text?: string; number?: string };
    assertEquals(body.text, AWAY.content);
    assertEquals(body.number, "5511000000000");
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("R2-API-045: replay e edição do mesmo evento não reenviam a mensagem de ausência", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    for (const outcome of ["duplicate", "updated"] as const) {
      const supabase = fakeSupabase([], { away: AWAY, hours: TODOS_FECHADOS, instanceToken: "token-inst-1", ingestOutcome: outcome });
      const { data, key } = traduzir(goIncoming("Bom dia", `3EB0${outcome}`));
      await handleIncomingMessage(supabase, `inst-go-away-${outcome}`, data, key, "http://localhost:54321", "svc");
      assertEquals(fetchCalls.length, 0, `evento ${outcome} não produz aviso de ausência`);
    }
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("R2-API-045: pedido de descadastro fora do expediente não recebe aviso de ausência", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      away: AWAY,
      hours: TODOS_FECHADOS,
      instanceToken: "token-inst-1",
      recentSend: [{ id: "recip-1" }],
      suppressions: ["supp-1"],
      autoreply: "DESCADASTRO CONFIRMADO (fixture)",
    });

    const { data, key } = traduzir(goIncoming("PARE", "3EB0PARE"));
    await handleIncomingMessage(supabase, "inst-go-away-optout", data, key, "http://localhost:54321", "svc");

    assertEquals(fetchCalls.length, 1, "só a confirmação do descadastro sai");
    const body = JSON.parse(String(fetchCalls[0].init.body)) as { text?: string };
    assertEquals(body.text, "DESCADASTRO CONFIRMADO (fixture)");
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});
