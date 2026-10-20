/**
 * Mensagem de ausência no webhook de mensagens (fora do horário comercial).
 *
 * O que fica travado:
 *   1. fora do horário + `away_messages.is_enabled` + conversa SEM atendente →
 *      a ausência sai pelo pipeline OFICIAL: INSERT em `messages`
 *      (client_message_id + status 'sending') → `claim_outbound_message`
 *      (p_agent_id = dono da conexão) → provedor → `complete_outbound_message`;
 *   2. dentro do horário comercial (`is_within_business_hours` = true) NÃO envia;
 *   3. `is_enabled = false`, conexão sem dono/perfil ativo, conversa com
 *      atendente atribuído e cooldown ativo NÃO enviam;
 *   4. o `client_message_id` é DETERMINÍSTICO por (contato, janela) e o cooldown
 *      confere a janela atual E a anterior — a borda da janela não fura o limite;
 *   5. o provedor recusando (4xx) deixa a linha TERMINAL sem reenvio
 *      (`fail_outbound_message`) e NÃO derruba o processamento da mensagem
 *      recebida.
 *
 * Payloads GO anonimizados (sem telefone/CPF reais).
 */
import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AWAY_MESSAGE_COOLDOWN_HOURS,
  awayClientMessageId,
  awayWindowIndex,
  handleIncomingMessage,
  resetOptOutKeywordCache,
} from "./evolution-webhook-messages.ts";
import { invalidateConnectionCache } from "./evolution-helpers.ts";
import { translateGoPayload } from "./evolution-go-adapter.ts";
import type { EvolutionDbClient } from "./evolution-types.ts";

type Chamada = {
  tipo: "rpc" | "insert" | "update" | "upsert" | "select";
  tabela?: string;
  nome?: string;
  args?: Record<string, unknown>;
  values?: Record<string, unknown>;
  colunas?: string;
  filtros?: Array<[string, unknown]>;
};

interface FakeConfig {
  away?: { content: string; is_enabled: boolean } | null;
  aberto?: boolean;
  /** `is_within_business_hours` devolve erro quando definido. */
  bhError?: string | null;
  cooldownHit?: boolean;
  /** `created_by` da conexão (undefined = dono fixture; null = sem dono). */
  owner?: string | null;
  ownerAtivo?: boolean;
  /** INSERT em `messages` devolve 23505 (já enfileirada na janela). */
  duplicada?: boolean;
  assignedTo?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let idSeq = 0;

function fakeSupabase(chamadas: Chamada[], cfg: FakeConfig) {
  let tabela = "";
  let op = "";
  let colunas = "";
  let filtros: Array<[string, unknown]> = [];
  let values: Record<string, unknown> = {};

  const registrar = (tipo: Chamada["tipo"], extra: Partial<Chamada> = {}) => {
    chamadas.push({ tipo, ...extra });
  };

  const resolver = (): { data: unknown; error: { code?: string; message?: string } | null } => {
    if (op === "") registrar("select", { tabela, colunas, filtros: [...filtros] });
    switch (tabela) {
      case "whatsapp_connections":
        if (colunas.includes("created_by")) {
          const owner = "owner" in cfg ? cfg.owner : "owner-1";
          return { data: owner === null ? null : { created_by: owner }, error: null };
        }
        return { data: { id: "conn-1" }, error: null };
      case "away_messages":
        return { data: "away" in cfg ? cfg.away : { content: "Estamos fora do horário.", is_enabled: true }, error: null };
      case "profiles":
        return { data: cfg.ownerAtivo === false ? null : { id: "owner-1" }, error: null };
      case "messages":
        if (op === "insert") {
          return cfg.duplicada
            ? { data: null, error: { code: "23505", message: "duplicate key value" } }
            : { data: { id: "away-msg-1" }, error: null };
        }
        return { data: cfg.cooldownHit ? [{ id: "prev-away" }] : [], error: null };
      case "talkx_optout_keywords":
        return { data: [], error: null };
      default:
        return { data: null, error: null };
    }
  };

  const chain: Record<string, unknown> = {};
  const mesmo = () => chain;
  for (const metodo of ["eq", "is", "not", "gte", "order", "limit"]) {
    chain[metodo] = (col: string, val: unknown) => {
      filtros.push([col, val]);
      return chain;
    };
  }
  chain.select = (cols = "") => { colunas = String(cols); return chain; };
  chain.in = (col: string, vals: unknown) => { filtros.push([col, vals]); return chain; };
  chain.insert = (v: Record<string, unknown>) => { op = "insert"; values = v; registrar("insert", { tabela, values: v }); return chain; };
  chain.update = (v: Record<string, unknown>) => { op = "update"; values = v; registrar("update", { tabela, values: v }); return chain; };
  chain.upsert = (v: Record<string, unknown>) => { op = "upsert"; values = v; registrar("upsert", { tabela, values: v }); return chain; };
  chain.maybeSingle = () => resolver();
  chain.single = chain.maybeSingle;
  chain.then = (resolve: (value: unknown) => unknown) => resolve(resolver());
  void mesmo;

  return {
    from: (t: string) => {
      tabela = t;
      op = "";
      colunas = "";
      filtros = [];
      values = {};
      return chain;
    },
    rpc: (nome: string, args: Record<string, unknown>) => {
      registrar("rpc", { nome, args });
      switch (nome) {
        case "ingest_inbound_message":
          return {
            data: [{
              contact_id: "contact-1",
              contact_name: "Contato Fixture",
              assigned_to: cfg.assignedTo ?? null,
              avatar_url: "https://example.invalid/avatar.jpg",
              contact_created: false,
              message_id: "msg-in-1",
              outcome: "inserted",
            }],
            error: null,
          };
        case "is_within_business_hours":
          if (cfg.bhError) return { data: null, error: { message: cfg.bhError } };
          return { data: cfg.aberto ?? false, error: null };
        case "claim_outbound_message":
          return {
            data: [{
              message_id: "away-msg-1",
              claim_token: "token-claim-1",
              whatsapp_instance_name: "inst-go-away",
              contact_phone: "5511000000000",
              content: "Estamos fora do horário.",
            }],
            error: null,
          };
        case "get_instance_token":
          return { data: "token-inst-away", error: null };
        case "complete_outbound_message":
          return { data: { id: "away-msg-1" }, error: null };
        case "fail_outbound_message":
          return { data: null, error: null };
        case "attribute_talkx_reply":
          return { data: { attributed: false }, error: null };
        case "attribute_multiplix_item_reply":
          return { data: { attributed: false }, error: null };
        case "enqueue_ai_job":
          return { data: "job-1", error: null };
        default:
          return { data: null, error: null };
      }
    },
  } as unknown as EvolutionDbClient;
}

/** Payload GO anonimizado de mensagem recebida (evento `message`). */
function goIncoming(texto: string, instance: string, id = "3EB0AWAY"): Record<string, unknown> {
  return {
    event: "message",
    instanceName: instance,
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
  const key = data.key as { id: string; remoteJid?: string; fromMe: boolean };
  return { data, key };
}

const originalFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string; init: RequestInit }> = [];

function instalarFetchFalso(status = 200): void {
  fetchCalls = [];
  (globalThis as { fetch: typeof fetch }).fetch = ((url: unknown, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
    fetchCalls.push({ url: u, init: init ?? {} });
    const corpo = status >= 400
      ? { error: "provedor recusou (fixture)" }
      : { key: { id: "PROV-AWAY-1" } };
    return Promise.resolve(new Response(JSON.stringify(corpo), {
      status,
      headers: { "Content-Type": "application/json" },
    }));
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

async function rodarRecebida(
  chamadas: Chamada[],
  cfg: FakeConfig,
  texto = "Bom dia, tudo bem?",
) {
  const instance = `inst-go-away-${idSeq++}`;
  invalidateConnectionCache(instance);
  const supabase = fakeSupabase(chamadas, cfg);
  const { data, key } = traduzir(goIncoming(texto, instance));
  const t0 = Date.now();
  await handleIncomingMessage(supabase, instance, data, key, "http://localhost:54321", "svc");
  const t1 = Date.now();
  return { chamadas, supabase, t0, t1 };
}

function rpcs(chamadas: Chamada[], nome: string) {
  return chamadas.filter((c) => c.tipo === "rpc" && c.nome === nome);
}

function insertAway(chamadas: Chamada[]) {
  return chamadas.find((c) => c.tipo === "insert" && c.tabela === "messages");
}

Deno.test("AWAY: client_message_id é determinístico, válido e por janela", () => {
  const a = awayClientMessageId("contact-1", 12345);
  const b = awayClientMessageId("contact-1", 12345);
  const c = awayClientMessageId("contact-1", 12346);
  const d = awayClientMessageId("contact-2", 12345);
  assertEquals(a, b, "mesmo (contato, janela) → mesmo id");
  assertMatch(a, UUID_RE, "id precisa ser UUID (o UNIQUE do banco é sobre uuid)");
  assertEquals(a === c, false, "janelas diferentes não podem colidir");
  assertEquals(a === d, false, "contatos diferentes não podem colidir");
});

Deno.test("AWAY: a janela de cooldown cobre a duração cheia entre duas ausências", () => {
  const janelaMs = AWAY_MESSAGE_COOLDOWN_HOURS * 3_600_000;
  const w = 1000;
  const inicioDaJanela = w * janelaMs; // base alinhada à borda da janela
  assertEquals(awayWindowIndex(inicioDaJanela), w);
  assertEquals(awayWindowIndex(inicioDaJanela + janelaMs - 1), w, "ainda na janela corrente");
  assertEquals(awayWindowIndex(inicioDaJanela + janelaMs), w + 1, "virou a janela");
});

Deno.test("AWAY: fora do horário, sem atendente → envia pelo pipeline oficial 1x", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso(200);
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    const { t0, t1 } = await rodarRecebida(chamadas, { away: { content: "Estamos fora do horário.", is_enabled: true } });

    assertEquals(rpcs(chamadas, "is_within_business_hours").length, 1, "consulta o horário comercial 1x");

    const inserida = insertAway(chamadas);
    assertEquals(!!inserida, true, "enfileira a ausência no contrato oficial");
    assertEquals(inserida?.values?.status, "sending", "nasce 'sending' para o claim");
    assertEquals(inserida?.values?.sender, "agent");
    assertEquals(inserida?.values?.agent_id, "owner-1", "agent_id = dono da conexão");
    assertEquals(inserida?.values?.whatsapp_connection_id, "conn-1");
    assertEquals(inserida?.values?.content, "Estamos fora do horário.");

    // Cooldown: a leitura confere a janela ATUAL e a ANTERIOR (borda coberta).
    const leituraCooldown = chamadas.find(
      (c) => c.tipo === "select" && c.tabela === "messages" && c.filtros?.some(([col]) => col === "client_message_id"),
    );
    const idsConferidos = leituraCooldown?.filtros?.find(([col]) => col === "client_message_id")?.[1] as string[] | undefined;
    assertEquals(Array.isArray(idsConferidos), true);
    const janelas = [awayWindowIndex(t0), awayWindowIndex(t1)];
    const idsEsperados = janelas.map((w) => awayClientMessageId("contact-1", w));
    assertEquals(idsConferidos?.includes(idsEsperados[0]), true, "confere a janela atual");
    assertEquals(
      idsConferidos?.includes(awayClientMessageId("contact-1", idsEsperados.length ? janelas[0] - 1 : 0)),
      true,
      "confere a janela anterior (cooldown não fura a borda)",
    );
    assertEquals(idsConferidos?.includes(String(inserida?.values?.client_message_id)), true, "o id conferido é o mesmo enfileirado");

    const claim = rpcs(chamadas, "claim_outbound_message");
    assertEquals(claim.length, 1, "claim oficial 1x");
    assertEquals(claim[0].args?.p_agent_id, "owner-1");
    assertEquals(claim[0].args?.p_message_id, "away-msg-1");

    assertEquals(rpcs(chamadas, "get_instance_token").length, 1, "token da instância resolvido (sender oficial)");
    assertEquals(fetchCalls.length, 1, "1 POST ao provedor");
    assertEquals(fetchCalls[0].url, "https://evolution.invalid/send/text");
    const headers = fetchCalls[0].init.headers as Record<string, string>;
    assertEquals(headers.apikey, "token-inst-away", "sai pelo token da instância");
    const body = JSON.parse(String(fetchCalls[0].init.body)) as { text?: string; number?: string };
    assertEquals(body.text, "Estamos fora do horário.");
    assertEquals(body.number, "5511000000000");

    const completo = rpcs(chamadas, "complete_outbound_message");
    assertEquals(completo.length, 1, "recibo persistido no pipeline");
    assertEquals(completo[0].args?.p_external_id, "PROV-AWAY-1");
    assertEquals(rpcs(chamadas, "fail_outbound_message").length, 0, "sucesso não passa por fail");
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("AWAY: dentro do horário comercial não envia nada", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso(200);
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { aberto: true, away: { content: "Estamos fora do horário.", is_enabled: true } });
    assertEquals(insertAway(chamadas), undefined, "não enfileira dentro do horário");
    assertEquals(rpcs(chamadas, "claim_outbound_message").length, 0);
    assertEquals(fetchCalls.length, 0);
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("AWAY: configuração desabilitada, atendente atribuído e cooldown barram o envio", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso(200);
  try {
    prepararAmbiente();

    const desabilitada: Chamada[] = [];
    await rodarRecebida(desabilitada, { away: { content: "Estamos fora do horário.", is_enabled: false } });
    assertEquals(insertAway(desabilitada), undefined, "is_enabled=false não envia");

    const semConfig: Chamada[] = [];
    await rodarRecebida(semConfig, { away: null });
    assertEquals(insertAway(semConfig), undefined, "conexão sem away_messages não envia");

    const comAtendente: Chamada[] = [];
    await rodarRecebida(comAtendente, {
      assignedTo: "atendente-1",
      away: { content: "Estamos fora do horário.", is_enabled: true },
    });
    assertEquals(insertAway(comAtendente), undefined, "conversa com atendente ativo não envia");
    assertEquals(rpcs(comAtendente, "is_within_business_hours").length, 0, "atendente é checado antes do horário");

    const emCooldown: Chamada[] = [];
    await rodarRecebida(emCooldown, {
      cooldownHit: true,
      away: { content: "Estamos fora do horário.", is_enabled: true },
    });
    assertEquals(insertAway(emCooldown), undefined, "cooldown ativo não envia");
    assertEquals(fetchCalls.length === 0, true, "nenhum POST ao provedor nesses casos");
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("AWAY: conexão sem dono/perfil ativo não envia (fail-closed)", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso(200);
  try {
    prepararAmbiente();

    const semDono: Chamada[] = [];
    await rodarRecebida(semDono, { owner: null, away: { content: "Estamos fora do horário.", is_enabled: true } });
    assertEquals(insertAway(semDono), undefined, "sem created_by não enfileira");

    const donoInativo: Chamada[] = [];
    await rodarRecebida(donoInativo, {
      ownerAtivo: false,
      away: { content: "Estamos fora do horário.", is_enabled: true },
    });
    assertEquals(insertAway(donoInativo), undefined, "dono sem perfil ativo não enfileira");
    assertEquals(fetchCalls.length, 0);
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("AWAY: enfileiramento duplicado (23505) não reenvia (dedupe pelo UNIQUE)", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso(200);
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, {
      duplicada: true,
      away: { content: "Estamos fora do horário.", is_enabled: true },
    });
    assertEquals(rpcs(chamadas, "claim_outbound_message").length, 0, "não clama o que já foi enfileirado");
    assertEquals(fetchCalls.length, 0);
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("AWAY: provedor recusando (4xx) deixa a linha terminal e não derruba o webhook", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso(400);
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    // Se a ausência derrubasse o handler, este await lançaria e o teste falharia.
    await rodarRecebida(chamadas, { away: { content: "Estamos fora do horário.", is_enabled: true } });

    assertEquals(fetchCalls.length, 1, "tentou enviar");
    const falha = rpcs(chamadas, "fail_outbound_message");
    assertEquals(falha.length, 1, "marca a linha como terminal");
    assertEquals(falha[0].args?.p_retryable, false, "não é retentável: sem reenvio automático");
    assertEquals(rpcs(chamadas, "complete_outbound_message").length, 0, "não confirma o que foi recusado");
    assertEquals(rpcs(chamadas, "attribute_talkx_reply").length, 1, "a mensagem recebida segue processada");
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("AWAY: erro na leitura do horário comercial não envia (fail-closed)", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso(200);
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, {
      bhError: "chamador sem sessao de usuario",
      away: { content: "Estamos fora do horário.", is_enabled: true },
    });
    assertEquals(insertAway(chamadas), undefined, "sem saber o horário, não envia");
    assertEquals(fetchCalls.length, 0);
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});
