/**
 * Chatbot IA (L1) — disparo da resposta automática pelo webhook de mensagens.
 *
 * O que fica travado:
 *   1. sem atendente + fluxo `ai_l1` ATIVO + flag `ai.capability.chatbot_l1`
 *      ligada → o webhook chama a edge `chatbot-l1` ASSINADA (HMAC-SHA256 do
 *      corpo cru em `x-webhook-signature`) e a resposta do bot sai pelo pipeline
 *      OFICIAL: INSERT em `messages` (client_message_id + status 'sending') →
 *      `claim_outbound_message` → provedor → `complete_outbound_message`;
 *   2. DESLIGADO POR PADRÃO: flag AUSENTE (ou desligada) e conexão sem fluxo
 *      `ai_l1` ativo NÃO chamam a edge e não enviam nada;
 *   3. conversa com atendente atribuído NÃO dispara (e nem toca no banco);
 *   4. reentrega da mesma mensagem NÃO duplica: o `client_message_id` é
 *      determinístico e a resposta existente corta o gatilho antes da IA;
 *   5. a edge recusando (5xx) ou transferindo para humano NÃO envia nada e não
 *      derruba o processamento da mensagem recebida;
 *   6. corrida no enfileiramento (23505) não reenvia ao provedor.
 *
 * Payloads GO anonimizados (sem telefone/CPF reais).
 */
import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  chatbotL1Endpoint,
  chatbotReplyClientMessageId,
  CHATBOT_L1_WORKER,
  handleIncomingMessage,
  readChatbotL1Flag,
  resetOptOutKeywordCache,
} from "../evolution-webhook-messages.ts";
import { invalidateConnectionCache } from "../evolution-helpers.ts";
import { translateGoPayload } from "../evolution-go-adapter.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

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
  /** Linha de `feature_flags` devolvida pela leitura da flag (ausente = null). */
  flag?: { enabled: boolean } | null;
  /** Erro devolvido pela leitura da flag. */
  flagError?: string | null;
  /** Fluxo `ai_l1` ativo da conexão (ausente = null). */
  fluxo?: { id: string } | null;
  /** Já existe resposta com o client_message_id (reentrega). */
  respostaExistente?: boolean;
  /** INSERT em `messages` devolve 23505 (corrida no enfileiramento). */
  duplicada?: boolean;
  /** `assigned_to` devolvido pelo ingest (conversa com atendente). */
  assignedTo?: string | null;
  /** Dono da conexão (null = sem dono). */
  owner?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SEGREDO = "segredo-hmac-fixture";

let idSeq = 0;

function fakeSupabase(chamadas: Chamada[], cfg: FakeConfig) {
  let tabela = "";
  let op = "";
  let colunas = "";
  let filtros: Array<[string, unknown]> = [];

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
        return { data: { id: "owner-1" }, error: null };
      case "feature_flags":
        if (cfg.flagError) return { data: null, error: { message: cfg.flagError } };
        return { data: "flag" in cfg ? cfg.flag : null, error: null };
      case "chatbot_flows":
        return { data: "fluxo" in cfg ? cfg.fluxo : null, error: null };
      case "messages":
        if (op === "insert") {
          return cfg.duplicada
            ? { data: null, error: { code: "23505", message: "duplicate key value" } }
            : { data: { id: "bot-msg-1" }, error: null };
        }
        // Pré-leitura de idempotência por client_message_id.
        return { data: cfg.respostaExistente ? [{ id: "bot-msg-1" }] : [], error: null };
      case "away_messages":
        return { data: null, error: null }; // ausência desligada neste dublê
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
  chain.insert = (v: Record<string, unknown>) => { op = "insert"; registrar("insert", { tabela, values: v }); return chain; };
  chain.update = (v: Record<string, unknown>) => { op = "update"; registrar("update", { tabela, values: v }); return chain; };
  chain.upsert = (v: Record<string, unknown>) => { op = "upsert"; registrar("upsert", { tabela, values: v }); return chain; };
  chain.maybeSingle = () => resolver();
  chain.single = chain.maybeSingle;
  chain.then = (resolve: (value: unknown) => unknown) => resolve(resolver());

  return {
    from: (t: string) => {
      tabela = t;
      op = "";
      colunas = "";
      filtros = [];
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
        case "claim_outbound_message":
          return {
            data: [{
              message_id: "bot-msg-1",
              claim_token: "token-claim-bot",
              whatsapp_instance_name: "inst-bot-1",
              contact_phone: "5511000000000",
              content: "Resposta do bot.",
            }],
            error: null,
          };
        case "get_instance_token":
          return { data: "token-inst-bot", error: null };
        case "complete_outbound_message":
          return { data: [{ id: "bot-msg-1" }], error: null };
        default:
          return { data: null, error: null };
      }
    },
  };
}

function goIncoming(texto: string, id: string): Record<string, unknown> {
  return {
    event: "Message",
    instance: "inst-go-bot",
    data: {
      Info: {
        ID: id,
        Chat: "5511000000000@s.whatsapp.net",
        Sender: "5511000000001@c.us",
        PushName: "Contato Fixture",
        Timestamp: "2026-10-15T12:00:00.000Z",
        IsFromMe: false,
      },
      Message: { conversation: texto },
    },
  };
}

const originalFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string; init: RequestInit }> = [];
let assinaturaValida: boolean | null = null;
let statusEdge = 200;
let payloadEdge: Record<string, unknown> = { handled: true, response: "Resposta do bot." };

async function hmacHex(corpo: string, segredo: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function instalarFetchFalso(): void {
  fetchCalls = [];
  assinaturaValida = null;
  (globalThis as { fetch: typeof fetch }).fetch = (async (url: unknown, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
    fetchCalls.push({ url: u, init: init ?? {} });
    if (u.includes("/functions/v1/chatbot-l1")) {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const corpo = String(init?.body ?? "");
      const esperado = `sha256=${await hmacHex(corpo, SEGREDO)}`;
      assinaturaValida = headers["x-webhook-signature"] === esperado;
      return new Response(JSON.stringify(payloadEdge), {
        status: statusEdge,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Provedor (Evolution).
    return new Response(JSON.stringify({ key: { id: "PROV-BOT-1" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

function restaurarFetch(): void {
  (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
}

function prepararAmbiente(): void {
  Deno.env.set("EVOLUTION_API_URL", "https://evolution.invalid");
  Deno.env.set("EVOLUTION_API_KEY", "chave-global-fixture");
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  Deno.env.set("CHATBOT_L1_WEBHOOK_SECRET", SEGREDO);
}

async function rodarRecebida(chamadas: Chamada[], cfg: FakeConfig) {
  const instance = `inst-go-bot-${idSeq++}`;
  invalidateConnectionCache(instance);
  const supabase = fakeSupabase(chamadas, cfg);
  const recebida = translateGoPayload(goIncoming("Bom dia, tudo bem?", `MSG-IN-${idSeq++}`));
  const data = recebida.data as Record<string, unknown>;
  const key = data.key as { id: string; remoteJid?: string; fromMe: boolean };
  await handleIncomingMessage(
    supabase as unknown as EvolutionDbClient,
    instance,
    data,
    key,
    "http://localhost:54321",
    "svc",
  );
  return { chamadas };
}

function rpcs(chamadas: Chamada[], nome: string) {
  return chamadas.filter((c) => c.tipo === "rpc" && c.nome === nome);
}

function chamadasEdge() {
  return fetchCalls.filter((c) => c.url.includes("/functions/v1/chatbot-l1"));
}

function chamadasProvedor() {
  return fetchCalls.filter((c) => !c.url.includes("/functions/v1/chatbot-l1"));
}

function insertResposta(chamadas: Chamada[]) {
  return chamadas.find(
    (c) => c.tipo === "insert" && c.tabela === "messages" && "client_message_id" in (c.values ?? {}),
  );
}

Deno.test("CHATBOT-L1: client_message_id é determinístico, UUID e distinto por mensagem", () => {
  const a = chatbotReplyClientMessageId("contact-1", "conn-1", "msg-in-1");
  const b = chatbotReplyClientMessageId("contact-1", "conn-1", "msg-in-1");
  const c = chatbotReplyClientMessageId("contact-1", "conn-1", "msg-in-2");
  const d = chatbotReplyClientMessageId("contact-2", "conn-1", "msg-in-1");
  assertEquals(a, b, "mesma mensagem → mesmo id");
  assertMatch(a, UUID_RE, "id precisa ser UUID (o UNIQUE do banco é sobre uuid)");
  assertEquals(a === c, false, "mensagens diferentes não podem colidir");
  assertEquals(a === d, false, "contatos diferentes não podem colidir");
  assertEquals(chatbotL1Endpoint("http://localhost:54321/"), "http://localhost:54321/functions/v1/chatbot-l1");
});

Deno.test("CHATBOT-L1: sem atendente + fluxo ativo + flag ligada → chama a edge ASSINADA e envia pelo pipeline oficial", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  statusEdge = 200;
  payloadEdge = { handled: true, response: "Resposta do bot." };
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { flag: { enabled: true }, fluxo: { id: "flow-1" } });

    // 1) Chamada ASSINADA à edge, com o payload do contrato.
    const edge = chamadasEdge();
    assertEquals(edge.length, 1, "1 POST para a edge chatbot-l1");
    assertEquals(edge[0].url, "http://localhost:54321/functions/v1/chatbot-l1");
    assertEquals(assinaturaValida, true, "x-webhook-signature é o HMAC-SHA256 do corpo cru");
    const corpo = JSON.parse(String(edge[0].init.body)) as Record<string, string>;
    assertEquals(corpo.contactId, "contact-1");
    assertEquals(corpo.connectionId, "conn-1");
    assertEquals(corpo.message, "Bom dia, tudo bem?");

    // 2) Resposta no pipeline oficial, com o client_message_id determinístico.
    const inserida = insertResposta(chamadas);
    assert(inserida, "enfileira a resposta no contrato oficial");
    assertEquals(inserida?.values?.status, "sending", "nasce 'sending' para o claim");
    assertEquals(inserida?.values?.sender, "agent");
    assertEquals(inserida?.values?.agent_id, "owner-1", "agent_id = dono da conexão");
    assertEquals(inserida?.values?.whatsapp_connection_id, "conn-1");
    assertEquals(inserida?.values?.content, "Resposta do bot.");
    assertEquals(
      inserida?.values?.client_message_id,
      chatbotReplyClientMessageId("contact-1", "conn-1", "msg-in-1"),
      "id determinístico da mensagem recebida",
    );

    const claim = rpcs(chamadas, "claim_outbound_message");
    assertEquals(claim.length, 1, "claim oficial 1x");
    assertEquals(claim[0].args?.p_agent_id, "owner-1");
    assertEquals(claim[0].args?.p_worker, CHATBOT_L1_WORKER);
    assertEquals(claim[0].args?.p_message_id, "bot-msg-1");

    const provedor = chamadasProvedor();
    assertEquals(provedor.length, 1, "1 POST ao provedor");
    const body = JSON.parse(String(provedor[0].init.body)) as { text?: string; number?: string };
    assertEquals(body.text, "Resposta do bot.");
    assertEquals(body.number, "5511000000000");
    const headers = provedor[0].init.headers as Record<string, string>;
    assertEquals(headers.apikey, "token-inst-bot", "sai pelo token da instância");

    assertEquals(rpcs(chamadas, "complete_outbound_message").length, 1, "recibo persistido no pipeline");
    assertEquals(rpcs(chamadas, "fail_outbound_message").length, 0, "nada falhou");
  } finally {
    restaurarFetch();
  }
});

Deno.test("CHATBOT-L1: DESLIGADO POR PADRÃO — flag ausente não chama a edge nem envia", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { flag: null, fluxo: { id: "flow-1" } });
    assertEquals(chamadasEdge().length, 0, "sem linha de flag → nada responde");
    assertEquals(insertResposta(chamadas), undefined, "nada enfileirado");
    assertEquals(chamadasProvedor().length, 0, "nada enviado");
  } finally {
    restaurarFetch();
  }
});

Deno.test("CHATBOT-L1: flag desligada e leitura com erro (fail-closed) não respondem", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const desligada: Chamada[] = [];
    await rodarRecebida(desligada, { flag: { enabled: false }, fluxo: { id: "flow-1" } });
    assertEquals(chamadasEdge().length, 0, "enabled=false não responde");

    const comErro: Chamada[] = [];
    await rodarRecebida(comErro, { flagError: "boom", fluxo: { id: "flow-1" } });
    assertEquals(chamadasEdge().length, 0, "erro de leitura fecha o gatilho");
  } finally {
    restaurarFetch();
  }
});

Deno.test("CHATBOT-L1: conexão sem fluxo ai_l1 ativo não responde", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { flag: { enabled: true }, fluxo: null });
    assertEquals(chamadasEdge().length, 0, "sem fluxo ativo → nada responde");
    const leituraFluxo = chamadas.find(
      (c) => c.tipo === "select" && c.tabela === "chatbot_flows",
    );
    assert(leituraFluxo, "consulta o fluxo da conexão");
    assertEquals(
      leituraFluxo?.filtros?.find(([col]) => col === "trigger_type")?.[1],
      "ai_l1",
      "o fluxo consultado é o ai_l1",
    );
    assertEquals(leituraFluxo?.filtros?.find(([col]) => col === "is_active")?.[1], true);
  } finally {
    restaurarFetch();
  }
});

Deno.test("CHATBOT-L1: conversa com atendente atribuído não dispara nem toca no banco", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { flag: { enabled: true }, fluxo: { id: "flow-1" }, assignedTo: "atendente-1" });
    assertEquals(chamadasEdge().length, 0, "com atendente → o bot não responde");
    assertEquals(
      chamadas.some((c) => c.tipo === "select" && c.tabela === "feature_flags"),
      false,
      "com atendente nem consulta a flag (corta antes)",
    );
  } finally {
    restaurarFetch();
  }
});

Deno.test("CHATBOT-L1: reentrega da mesma mensagem não gasta IA nem duplica a resposta", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { flag: { enabled: true }, fluxo: { id: "flow-1" }, respostaExistente: true });
    assertEquals(chamadasEdge().length, 0, "resposta já existe → a IA não é acionada");
    assertEquals(insertResposta(chamadas), undefined, "nada é reenfileirado");
    assertEquals(chamadasProvedor().length, 0, "nada é reenviado");
  } finally {
    restaurarFetch();
  }
});

Deno.test("CHATBOT-L1: 23505 no enfileiramento (corrida) não reenvia ao provedor", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { flag: { enabled: true }, fluxo: { id: "flow-1" }, duplicada: true });
    assertEquals(chamadasEdge().length, 1, "a IA foi consultada 1x");
    assertEquals(chamadasProvedor().length, 0, "UNIQUE cortou o reenvio");
    assertEquals(rpcs(chamadas, "complete_outbound_message").length, 0);
  } finally {
    restaurarFetch();
  }
});

Deno.test("CHATBOT-L1: edge recusando (5xx) e transferência para humano não enviam nada e não derrubam o webhook", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    statusEdge = 500;
    const recusada: Chamada[] = [];
    await rodarRecebida(recusada, { flag: { enabled: true }, fluxo: { id: "flow-1" } });
    assertEquals(chamadasProvedor().length, 0, "5xx da edge não envia nada");
    assertEquals(insertResposta(recusada), undefined, "nada enfileirado");

    statusEdge = 200;
    payloadEdge = { handled: true, transfer_to_human: true };
    const transferida: Chamada[] = [];
    await rodarRecebida(transferida, { flag: { enabled: true }, fluxo: { id: "flow-1" } });
    assertEquals(insertResposta(transferida), undefined, "transferência para humano não envia resposta do bot");
    assertEquals(chamadasProvedor().length, 0);
  } finally {
    restaurarFetch();
  }
});

Deno.test("CHATBOT-L1: sem CHATBOT_L1_WEBHOOK_SECRET o gatilho não dispara", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    Deno.env.delete("CHATBOT_L1_WEBHOOK_SECRET");
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { flag: { enabled: true }, fluxo: { id: "flow-1" } });
    assertEquals(chamadasEdge().length, 0, "sem segredo não assina → não chama");
    assertEquals(
      chamadas.some((c) => c.tipo === "select" && c.tabela === "feature_flags"),
      false,
      "nem chega na flag",
    );
  } finally {
    Deno.env.set("CHATBOT_L1_WEBHOOK_SECRET", SEGREDO);
    restaurarFetch();
  }
});

Deno.test("CHATBOT-L1: a flag lida é a chave de capacidade canônica da edge", async () => {
  const chamadas: Chamada[] = [];
  const supabase = fakeSupabase(chamadas, { flag: { enabled: true } });
  const ligada = await readChatbotL1Flag(supabase as unknown as EvolutionDbClient);
  assertEquals(ligada, true);
  const leitura = chamadas.find((c) => c.tipo === "select" && c.tabela === "feature_flags");
  assert(leitura, "lê feature_flags");
  assertEquals(leitura?.filtros?.find(([col]) => col === "key")?.[1], "ai.capability.chatbot_l1");

  const ausente: Chamada[] = [];
  const semFlag = await readChatbotL1Flag(fakeSupabase(ausente, { flag: null }) as unknown as EvolutionDbClient);
  assertEquals(semFlag, false, "ausência da linha = desligado");
});
