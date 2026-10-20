/**
 * Mensagem de ausência no webhook de mensagens (fora do horário comercial).
 *
 * O que fica travado:
 *   1. a DECISÃO é do servidor (PL-04): o webhook chama
 *      `should_send_away_message(contato, conexao)` e só envia quando ela devolve
 *      texto. `is_within_business_hours` e `away_messages` não são mais lidos aqui
 *      — a regra do horário, do atendente e do 24 h vive numa única RPC;
 *   2. havendo texto, a ausência sai pelo pipeline OFICIAL: INSERT em `messages`
 *      (client_message_id + status 'sending') → `record_away_message` (log de
 *      24 h) → `claim_outbound_message` (p_agent_id = dono da conexão) → provedor
 *      → `complete_outbound_message`;
 *   3. `record_away_message` é chamado SÓ DEPOIS do enfileiramento;
 *   4. o `client_message_id` é DETERMINÍSTICO por (contato, dia UTC), derivado da
 *      semente `away-<contact>-<yyyymmdd>` e materializado como UUID (a coluna é
 *      `uuid`); o UNIQUE do banco deduplica, sem consulta prévia;
 *   5. RPC de decisão ausente/com erro, conversa com atendente, conexão sem
 *      dono/perfil ativo e enfileiramento duplicado (23505) NÃO enviam;
 *   6. o provedor recusando (4xx) deixa a linha TERMINAL sem reenvio
 *      (`fail_outbound_message`) e NÃO derruba o processamento da mensagem
 *      recebida.
 *
 * Payloads GO anonimizados (sem telefone/CPF reais).
 */
import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AWAY_MESSAGE_WORKER,
  awayClientMessageId,
  awayDayKey,
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
  /** Texto devolvido pela decisão do PL-04 (null = não envia). */
  decisao?: string | null;
  /** `should_send_away_message` devolve erro quando definido (RPC ausente etc.). */
  decisaoErro?: string | null;
  /** `record_away_message` devolve erro quando definido. */
  recordErro?: string | null;
  /** `created_by` da conexão (undefined = dono fixture; null = sem dono). */
  owner?: string | null;
  ownerAtivo?: boolean;
  /** INSERT em `messages` devolve 23505 (já enfileirada no dia). */
  duplicada?: boolean;
  assignedTo?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TEXTO_AUSENCIA = "Estamos fora do horário. Voltamos amanhã!";

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
      case "profiles":
        return { data: cfg.ownerAtivo === false ? null : { id: "owner-1" }, error: null };
      case "messages":
        if (op === "insert") {
          return cfg.duplicada
            ? { data: null, error: { code: "23505", message: "duplicate key value" } }
            : { data: { id: "away-msg-1" }, error: null };
        }
        return { data: [], error: null };
      case "talkx_optout_keywords":
        return { data: [], error: null };
      default:
        return { data: null, error: null };
    }
  };

  const chain: Record<string, unknown> = {};
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
        case "should_send_away_message":
          if (cfg.decisaoErro) return { data: null, error: { code: "PGRST202", message: cfg.decisaoErro } };
          return { data: "decisao" in cfg ? cfg.decisao : TEXTO_AUSENCIA, error: null };
        case "record_away_message":
          if (cfg.recordErro) return { data: null, error: { code: "42883", message: cfg.recordErro } };
          return { data: "log-1", error: null };
        case "claim_outbound_message":
          return {
            data: [{
              message_id: "away-msg-1",
              claim_token: "token-claim-1",
              whatsapp_instance_name: "inst-go-away",
              contact_phone: "5511000000000",
              content: TEXTO_AUSENCIA,
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

const AGORA = Date.parse("2026-10-03T12:00:00.000Z");

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

function indiceDe(chamadas: Chamada[], pred: (c: Chamada) => boolean): number {
  return chamadas.findIndex(pred);
}

Deno.test("AWAY: client_message_id determinístico por (contato, dia), válido e sem colisão", () => {
  const a = awayClientMessageId("contact-1", "20261003");
  const b = awayClientMessageId("contact-1", "20261003");
  const c = awayClientMessageId("contact-1", "20261004");
  const d = awayClientMessageId("contact-2", "20261003");
  assertEquals(a, b, "mesmo (contato, dia) → mesmo id");
  assertMatch(a, UUID_RE, "id precisa ser UUID (o UNIQUE do banco é sobre uuid)");
  assertEquals(a === c, false, "dias diferentes não podem colidir");
  assertEquals(a === d, false, "contatos diferentes não podem colidir");
});

Deno.test("AWAY: awayDayKey usa o dia UTC no formato yyyymmdd", () => {
  assertEquals(awayDayKey(Date.parse("2026-10-03T00:00:00.000Z")), "20261003");
  assertEquals(awayDayKey(Date.parse("2026-10-03T23:59:59.000Z")), "20261003");
  assertEquals(awayDayKey(Date.parse("2026-10-04T00:00:00.000Z")), "20261004");
});

Deno.test("AWAY: decisão com texto → enfileira, registra e entrega pelo pipeline 1x", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso(200);
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    const { t0 } = await rodarRecebida(chamadas, { decisao: TEXTO_AUSENCIA });

    const decisao = rpcs(chamadas, "should_send_away_message");
    assertEquals(decisao.length, 1, "consulta a decisão do PL-04 1x");
    assertEquals(decisao[0].args?.p_contact_id, "contact-1");
    assertEquals(decisao[0].args?.p_connection_id, "conn-1");
    assertEquals(
      rpcs(chamadas, "is_within_business_hours").length,
      0,
      "o horário comercial não é mais decidido no webhook",
    );

    const inserida = insertAway(chamadas);
    assertEquals(!!inserida, true, "enfileira a ausência no contrato oficial");
    assertEquals(inserida?.values?.status, "sending", "nasce 'sending' para o claim");
    assertEquals(inserida?.values?.sender, "agent");
    assertEquals(inserida?.values?.agent_id, "owner-1", "agent_id = dono da conexão");
    assertEquals(inserida?.values?.whatsapp_connection_id, "conn-1");
    assertEquals(inserida?.values?.content, TEXTO_AUSENCIA);
    assertEquals(String(inserida?.values?.client_message_id), awayClientMessageId("contact-1", awayDayKey(t0)));

    const record = rpcs(chamadas, "record_away_message");
    assertEquals(record.length, 1, "registra o envio (log de 24 h) 1x");
    assertEquals(record[0].args?.p_contact_id, "contact-1");
    assertEquals(record[0].args?.p_connection_id, "conn-1");

    const claim = rpcs(chamadas, "claim_outbound_message");
    assertEquals(claim.length, 1, "claim oficial 1x");
    assertEquals(claim[0].args?.p_agent_id, "owner-1");
    assertEquals(claim[0].args?.p_message_id, "away-msg-1");
    assertEquals(claim[0].args?.p_worker, AWAY_MESSAGE_WORKER);

    assertEquals(rpcs(chamadas, "get_instance_token").length, 1, "token da instância resolvido (sender oficial)");
    assertEquals(fetchCalls.length, 1, "1 POST ao provedor");
    assertEquals(fetchCalls[0].url, "https://evolution.invalid/send/text");
    const headers = fetchCalls[0].init.headers as Record<string, string>;
    assertEquals(headers.apikey, "token-inst-away", "sai pelo token da instância");
    const body = JSON.parse(String(fetchCalls[0].init.body)) as { text?: string; number?: string };
    assertEquals(body.text, TEXTO_AUSENCIA);
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

Deno.test("AWAY: o registro só acontece DEPOIS do enfileiramento", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso(200);
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { decisao: TEXTO_AUSENCIA });

    const iInsert = indiceDe(chamadas, (c) => c.tipo === "insert" && c.tabela === "messages");
    const iRecord = indiceDe(chamadas, (c) => c.tipo === "rpc" && c.nome === "record_away_message");
    assertEquals(iInsert >= 0, true, "enfileirou");
    assertEquals(iRecord >= 0, true, "registrou");
    assertEquals(iInsert < iRecord, true, "record_away_message vem depois do INSERT");
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("AWAY: decisão NULL (dentro do horário / sem direito) não envia nada", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso(200);
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { decisao: null });
    assertEquals(insertAway(chamadas), undefined, "não enfileira sem texto");
    assertEquals(rpcs(chamadas, "record_away_message").length, 0, "não registra");
    assertEquals(rpcs(chamadas, "claim_outbound_message").length, 0);
    assertEquals(fetchCalls.length, 0);
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("AWAY: decisão indisponível (RPC ausente) não envia e o webhook segue", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso(200);
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { decisaoErro: "function public.should_send_away_message does not exist" });
    assertEquals(insertAway(chamadas), undefined, "sem decisão, não envia");
    assertEquals(fetchCalls.length, 0);
    assertEquals(rpcs(chamadas, "attribute_talkx_reply").length, 1, "a mensagem recebida segue processada");
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("AWAY: falha no record_away_message não impede a entrega", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso(200);
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { decisao: TEXTO_AUSENCIA, recordErro: "function does not exist" });
    assertEquals(rpcs(chamadas, "record_away_message").length, 1, "tentou registrar");
    assertEquals(rpcs(chamadas, "claim_outbound_message").length, 1, "a entrega continua");
    assertEquals(fetchCalls.length, 1);
    assertEquals(rpcs(chamadas, "complete_outbound_message").length, 1);
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
    await rodarRecebida(chamadas, { decisao: TEXTO_AUSENCIA, duplicada: true });
    assertEquals(rpcs(chamadas, "record_away_message").length, 0, "não registra o que não enfileirou");
    assertEquals(rpcs(chamadas, "claim_outbound_message").length, 0, "não clama o que já foi enfileirado");
    assertEquals(fetchCalls.length, 0);
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("AWAY: conversa com atendente atribuído nem consulta a decisão", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso(200);
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { assignedTo: "atendente-1", decisao: TEXTO_AUSENCIA });
    assertEquals(insertAway(chamadas), undefined, "conversa com atendente ativo não envia");
    assertEquals(rpcs(chamadas, "should_send_away_message").length, 0, "atendente é checado antes da decisão");
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("AWAY: conexão sem dono/perfil ativo não enfileira (fail-closed)", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso(200);
  try {
    prepararAmbiente();

    const semDono: Chamada[] = [];
    await rodarRecebida(semDono, { owner: null, decisao: TEXTO_AUSENCIA });
    assertEquals(insertAway(semDono), undefined, "sem created_by não enfileira");

    const donoInativo: Chamada[] = [];
    await rodarRecebida(donoInativo, { ownerAtivo: false, decisao: TEXTO_AUSENCIA });
    assertEquals(insertAway(donoInativo), undefined, "dono sem perfil ativo não enfileira");
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
    await rodarRecebida(chamadas, { decisao: TEXTO_AUSENCIA });

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
