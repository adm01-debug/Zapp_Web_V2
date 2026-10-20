/**
 * X030 — contrato executável do OPT-OUT no webhook de mensagens.
 *
 * O que fica travado:
 *   1. "PARE" casa em `talkx_optout_keywords` (mesma normalização da RPC),
 *      chama `talkx_suppress_contact` UMA vez e envia a autoresposta com o
 *      texto de `talkx_settings.optout_autoreply`;
 *   2. a autoresposta sai pelo token da instância (`get_instance_token`) e a
 *      campanha NÃO é resolvida na edge (sem `p_campaign_id`);
 *   3. repetição (supressão idempotente, RPC devolve NULL) NÃO reenvia a
 *      autoresposta;
 *   4. contato sem envio Talk X nos últimos 30 dias não gera nada;
 *   5. a mensagem de opt-out NÃO chama `attribute_talkx_reply`;
 *   6. resposta de botão/lista com id `talkx_optout` (X064) também é opt-out;
 *   7. as palavras ativas são lidas com cache (uma leitura serve vários eventos);
 *   8. R2-API-008 — a confirmação só é anunciada como enviada quando o provedor
 *      ACEITA (HTTP 2xx); 4xx/5xx e queda de transporte não podem ser logadas
 *      como envio bem-sucedido.
 *
 * Payloads GO anonimizados em fixture (sem telefone/CPF reais).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleIncomingMessage,
  resetOptOutKeywordCache,
} from "../evolution-webhook-messages.ts";
import { translateGoPayload } from "../evolution-go-adapter.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

type Chamada = { nome: string; args: Record<string, unknown> };

interface FakeConfig {
  keywords?: Array<{ keyword: string; match_mode: string }>;
  recentSend?: Array<{ id: string }>;
  /** Retorno de `talkx_suppress_contact` por chamada (id ou null na repetição). */
  suppressions?: Array<unknown>;
  autoreply?: unknown;
  instanceToken?: unknown;
  leituras?: string[];
}

/** Seed da X029 (todas `exact`). */
const SEED = [
  "sair", "parar", "pare", "stop", "cancelar",
  "remover", "descadastrar", "unsubscribe", "optout", "nao quero",
].map((keyword) => ({ keyword, match_mode: "exact" }));

function fakeSupabase(chamadas: Chamada[], cfg: FakeConfig) {
  let tabela = "";
  const chain: Record<string, unknown> = {};
  const mesmo = () => chain;
  for (const metodo of ["select", "eq", "in", "is", "not", "gte", "order", "limit", "update", "insert", "upsert", "delete"]) {
    chain[metodo] = mesmo;
  }
  chain.maybeSingle = () => {
    if (tabela === "whatsapp_connections") return { data: { id: "conn-1" }, error: null };
    if (tabela === "talkx_settings") return { data: { value: cfg.autoreply ?? null }, error: null };
    return { data: null, error: null };
  };
  chain.single = chain.maybeSingle;
  chain.then = (resolve: (value: unknown) => unknown) => {
    cfg.leituras?.push(tabela);
    if (tabela === "talkx_optout_keywords") return resolve({ data: cfg.keywords ?? SEED, error: null });
    if (tabela === "talkx_recipients") return resolve({ data: cfg.recentSend ?? [], error: null });
    return resolve({ data: [], error: null });
  };
  let suppressionIndex = 0;
  let ingestIndex = 0;
  return {
    from: (t: string) => {
      tabela = t;
      return chain;
    },
    rpc: (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      if (nome === "ingest_inbound_message") {
        ingestIndex += 1;
        return {
          data: [{
            contact_id: "contact-1",
            contact_name: "Contato Fixture",
            assigned_to: null,
            avatar_url: "https://example.invalid/avatar.jpg",
            contact_created: false,
            message_id: `msg-${ingestIndex}`,
            outcome: "inserted",
          }],
          error: null,
        };
      }
      if (nome === "talkx_suppress_contact") {
        const seq = cfg.suppressions ?? ["supp-1"];
        const valor = seq[Math.min(suppressionIndex, seq.length - 1)];
        suppressionIndex += 1;
        return { data: valor, error: null };
      }
      if (nome === "get_instance_token") return { data: cfg.instanceToken ?? null, error: null };
      if (nome === "attribute_talkx_reply") return { data: { attributed: true }, error: null };
      if (nome === "attribute_multiplix_item_reply") return { data: { attributed: false }, error: null };
      return { data: null, error: null };
    },
  } as unknown as EvolutionDbClient;
}

/** Payload GO anonimizado de mensagem recebida (evento `message`). */
function goIncoming(texto: string, id = "3EB0X030"): Record<string, unknown> {
  return {
    event: "message",
    instanceName: "inst-go-x030",
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

/** Payload GO de resposta de botão/lista (só o id selecionado, sem texto). */
function goButton(idSelecionado: string, id = "3EB0BTN"): Record<string, unknown> {
  const payload = goIncoming("", id);
  (payload.data as Record<string, unknown>).Message = {
    buttonsResponseMessage: { selectedButtonId: idSelecionado, selectedDisplayText: "Sair" },
  };
  return payload;
}

function traduzir(payload: Record<string, unknown>) {
  const recebida = translateGoPayload(payload);
  const data = recebida.data as Record<string, unknown>;
  const key = data.key as { id: string; remoteJid?: string; fromMe: boolean };
  return { data, key };
}

const originalFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string; init: RequestInit }> = [];

/**
 * Substitui o fetch global para capturar a autoresposta sem rede.
 * `status` simula a resposta do provedor (2xx = aceita, 4xx/5xx = recusada);
 * `falhaDeTransporte` simula queda/timeout (o fetch rejeita, sem resposta HTTP).
 */
function instalarFetchFalso(status = 200, falhaDeTransporte: string | null = null): void {
  fetchCalls = [];
  (globalThis as { fetch: typeof fetch }).fetch = ((url: unknown, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
    fetchCalls.push({ url: u, init: init ?? {} });
    if (falhaDeTransporte) return Promise.reject(new Error(falhaDeTransporte));
    return Promise.resolve(new Response(JSON.stringify(
      status >= 400 ? { error: "provedor recusou (fixture)" } : { ok: true },
    ), {
      status,
      headers: { "Content-Type": "application/json" },
    }));
  }) as typeof fetch;
}

function restaurarFetch(): void {
  (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
}

interface LogsCapturados {
  linhas: string[];
  texto: () => string;
  restaurar: () => void;
}

/** Captura console.warn/console.error para ler o que a função ANUNCIA. */
function coletarLogs(): LogsCapturados {
  const linhas: string[] = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  const juntar = (...args: unknown[]) => args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ");
  console.warn = (...args: unknown[]) => { linhas.push(juntar(...args)); };
  console.error = (...args: unknown[]) => { linhas.push(juntar(...args)); };
  return {
    linhas,
    texto: () => linhas.join("\n"),
    restaurar: () => {
      console.warn = originalWarn;
      console.error = originalError;
    },
  };
}

function prepararAmbiente(): void {
  Deno.env.set("EVOLUTION_API_URL", "https://evolution.invalid");
  Deno.env.set("EVOLUTION_API_KEY", "chave-global-fixture");
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
}

Deno.test("X030: 'PARE' suprime 1x, responde com o setting e não atribui resposta", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const leituras: string[] = [];
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      keywords: SEED,
      recentSend: [{ id: "recip-1" }],
      suppressions: ["supp-1"],
      autoreply: "MENSAGEM DO SETTING (fixture)",
      instanceToken: "token-inst-1",
      leituras,
    });

    const { data, key } = traduzir(goIncoming("PARE", "3EB0PARE"));
    await handleIncomingMessage(supabase, "inst-go-x030-a", data, key, "http://localhost:54321", "svc");

    const supressoes = chamadas.filter((c) => c.nome === "talkx_suppress_contact");
    assertEquals(supressoes.length, 1, "talkx_suppress_contact deve ser chamada 1 vez");
    assertEquals(supressoes[0].args.p_reason, "Opt-out via mensagem: pare");
    assertEquals(supressoes[0].args.p_reason_code, "opt_out");
    assertEquals(supressoes[0].args.p_origin, "auto_optout");
    assertEquals("p_campaign_id" in supressoes[0].args, false, "a campanha é resolvida NA RPC, não na edge");

    const tokens = chamadas.filter((c) => c.nome === "get_instance_token");
    assertEquals(tokens.length, 1, "resolve o token da instância que recebeu a mensagem");
    assertEquals(tokens[0].args.p_instance_id, "inst-go-x030-a");

    assertEquals(fetchCalls.length, 1, "1 POST de autoresposta");
    assertEquals(fetchCalls[0].url, "https://evolution.invalid/send/text");
    const headers = fetchCalls[0].init.headers as Record<string, string>;
    assertEquals(headers.apikey, "token-inst-1", "autoresposta sai pelo token da instância");
    const body = JSON.parse(String(fetchCalls[0].init.body)) as { text?: string; number?: string };
    assertEquals(body.text, "MENSAGEM DO SETTING (fixture)", "autoresposta usa talkx_settings.optout_autoreply");
    assertEquals(body.number, "5511000000000");

    assertEquals(
      chamadas.some((c) => c.nome === "attribute_talkx_reply"),
      false,
      "opt-out não conta como resposta/engajamento",
    );
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("X030: repetição (supressão idempotente) não reenvia a autoresposta; cache lê as palavras 1x", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const leituras: string[] = [];
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      keywords: SEED,
      recentSend: [{ id: "recip-1" }],
      suppressions: ["supp-1", null],
      autoreply: "MENSAGEM DO SETTING (fixture)",
      instanceToken: "token-inst-1",
      leituras,
    });

    const a = traduzir(goIncoming("PARE", "3EB0REP1"));
    await handleIncomingMessage(supabase, "inst-go-x030-b", a.data, a.key, "http://localhost:54321", "svc");
    const b = traduzir(goIncoming("PARE", "3EB0REP2"));
    await handleIncomingMessage(supabase, "inst-go-x030-b", b.data, b.key, "http://localhost:54321", "svc");

    assertEquals(chamadas.filter((c) => c.nome === "talkx_suppress_contact").length, 2);
    assertEquals(fetchCalls.length, 1, "a segunda mensagem (já suprimida) não reenvia a confirmação");
    assertEquals(
      leituras.filter((t) => t === "talkx_optout_keywords").length,
      1,
      "as palavras ativas vêm do cache de 5 min (uma leitura serve os dois eventos)",
    );
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("X030: contato sem envio em 30 dias não gera supressão nem autoresposta", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      keywords: SEED,
      recentSend: [],
      suppressions: ["supp-1"],
      autoreply: "MENSAGEM DO SETTING (fixture)",
      instanceToken: "token-inst-1",
    });

    const { data, key } = traduzir(goIncoming("PARE", "3EB0NOGATE"));
    await handleIncomingMessage(supabase, "inst-go-x030-c", data, key, "http://localhost:54321", "svc");

    assertEquals(chamadas.some((c) => c.nome === "talkx_suppress_contact"), false, "sem envio em 30 dias não suprime");
    assertEquals(fetchCalls.length, 0, "sem supressão não há autoresposta");
    assertEquals(
      chamadas.some((c) => c.nome === "attribute_talkx_reply"),
      false,
      "a palavra de opt-out não conta como resposta mesmo quando o gate de 30 dias barra a supressão",
    );
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("X030: resposta de botão com id 'talkx_optout' (X064) aciona o opt-out", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      keywords: SEED,
      recentSend: [{ id: "recip-1" }],
      suppressions: ["supp-btn"],
      autoreply: "MENSAGEM DO SETTING (fixture)",
      instanceToken: "token-inst-1",
    });

    const { data, key } = traduzir(goButton("talkx_optout", "3EB0BTN1"));
    await handleIncomingMessage(supabase, "inst-go-x030-d", data, key, "http://localhost:54321", "svc");

    const supressoes = chamadas.filter((c) => c.nome === "talkx_suppress_contact");
    assertEquals(supressoes.length, 1, "botão talkx_optout suprime como uma palavra");
    assertEquals(supressoes[0].args.p_reason, "Opt-out via mensagem: talkx_optout");
    assertEquals("p_campaign_id" in supressoes[0].args, false);
    assertEquals(fetchCalls.length, 1, "botão de opt-out também envia a confirmação");
    assertEquals(
      chamadas.some((c) => c.nome === "attribute_talkx_reply"),
      false,
      "botão de opt-out não conta como resposta",
    );
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("X030: resposta que NÃO é opt-out continua sendo atribuída ao Talk X", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      keywords: SEED,
      recentSend: [],
      suppressions: [],
      autoreply: "MENSAGEM DO SETTING (fixture)",
      instanceToken: "token-inst-1",
    });

    const { data, key } = traduzir(goIncoming("Ainda tenho interesse", "3EB0RESP"));
    await handleIncomingMessage(supabase, "inst-go-x030-e", data, key, "http://localhost:54321", "svc");

    assertEquals(chamadas.some((c) => c.nome === "talkx_suppress_contact"), false);
    const atribuicoes = chamadas.filter((c) => c.nome === "attribute_talkx_reply");
    assertEquals(atribuicoes.length, 1, "resposta normal é atribuída à campanha");
    assertEquals(atribuicoes[0].args.p_contact_id, "contact-1");
    assertEquals(atribuicoes[0].args.p_phone, "5511000000000");
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("R2-API-008: HTTP 500 do provedor NÃO é anunciado como confirmação enviada", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso(500);
  const logs = coletarLogs();
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      keywords: SEED,
      recentSend: [{ id: "recip-1" }],
      suppressions: ["supp-1"],
      autoreply: "MENSAGEM DO SETTING (fixture)",
      instanceToken: "token-inst-1",
    });

    const { data, key } = traduzir(goIncoming("PARE", "3EB0HTTP500"));
    await handleIncomingMessage(supabase, "inst-go-x030-http500", data, key, "http://localhost:54321", "svc");

    assertEquals(fetchCalls.length, 1, "a tentativa de confirmação aconteceu");
    assertEquals(
      chamadas.filter((c) => c.nome === "talkx_suppress_contact").length,
      1,
      "a supressão continua valendo mesmo com a confirmação recusada pelo provedor",
    );
    const texto = logs.texto();
    assertEquals(
      texto.includes("Confirmacao enviada"),
      false,
      "HTTP 500 não pode ser anunciado como envio bem-sucedido",
    );
    assertEquals(/rejected/i.test(texto), true, "a recusa do provedor precisa ficar registrada");
    assertEquals(texto.includes("500"), true, "o registro traz a evidência do provedor (status)");
  } finally {
    logs.restaurar();
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("R2-API-008: HTTP 200 do provedor É anunciado como confirmação enviada", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso(200);
  const logs = coletarLogs();
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      keywords: SEED,
      recentSend: [{ id: "recip-1" }],
      suppressions: ["supp-1"],
      autoreply: "MENSAGEM DO SETTING (fixture)",
      instanceToken: "token-inst-1",
    });

    const { data, key } = traduzir(goIncoming("PARE", "3EB0HTTP200"));
    await handleIncomingMessage(supabase, "inst-go-x030-http200", data, key, "http://localhost:54321", "svc");

    const texto = logs.texto();
    assertEquals(
      texto.includes("Confirmacao enviada"),
      true,
      "2xx é aceite do provedor: a confirmação pode ser anunciada",
    );
    assertEquals(/accepted/i.test(texto), true, "o envio aceito é classificado como 'accepted'");
  } finally {
    logs.restaurar();
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("R2-API-008: queda de transporte não é anunciada como confirmação enviada", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso(200, "timeout simulado (fixture)");
  const logs = coletarLogs();
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      keywords: SEED,
      recentSend: [{ id: "recip-1" }],
      suppressions: ["supp-1"],
      autoreply: "MENSAGEM DO SETTING (fixture)",
      instanceToken: "token-inst-1",
    });

    const { data, key } = traduzir(goIncoming("PARE", "3EB0NETERR"));
    await handleIncomingMessage(supabase, "inst-go-x030-neterr", data, key, "http://localhost:54321", "svc");

    assertEquals(fetchCalls.length, 1, "a tentativa de confirmação aconteceu");
    const texto = logs.texto();
    assertEquals(
      texto.includes("Confirmacao enviada"),
      false,
      "sem resposta HTTP não dá para afirmar que a confirmação saiu",
    );
    assertEquals(/unknown/i.test(texto), true, "sem status do provedor o desfecho é classificado como 'unknown'");
  } finally {
    logs.restaurar();
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});
