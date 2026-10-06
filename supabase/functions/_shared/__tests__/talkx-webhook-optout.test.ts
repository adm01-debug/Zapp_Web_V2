/**
 * X030 — contrato executável do OPT-OUT no webhook de mensagens.
 *
 * R2-API-006 (#69): os efeitos deixaram de ser chamadas soltas depois do
 * ingest — a palavra casada entra na MESMA chamada de `ingest_inbound_message`
 * (que registra a pendência na outbox na mesma transação) e
 * `drain_inbound_message_effects` aplica a supressão. Travado no contrato novo:
 *
 *   1. "PARE" casa em `talkx_optout_keywords` (mesma normalização da RPC) e a
 *      palavra chega ao ingest como `p_opt_out_keyword` (a campanha NÃO é
 *      resolvida na edge — sem `p_campaign_id` em lugar nenhum);
 *   2. a autoresposta sai UMA vez, pelo token da instância (`get_instance_token`)
 *      e com o texto de `talkx_settings.optout_autoreply`, só quando a drenagem
 *      devolve `suppression_id` novo;
 *   3. repetição (`already_suppressed`) NÃO reenvia a autoresposta;
 *   4. `no_recent_send` (gate de campanha em 30 dias, dentro da RPC) não gera
 *      autoresposta;
 *   5. opt-out NÃO vira resposta (a RPC só enfileira a supressão — a exclusão
 *      mútua é provada no SQL);
 *   6. resposta de botão/lista com id `talkx_optout` (X064) também é opt-out;
 *   7. as palavras ativas são lidas com cache (uma leitura serve vários eventos).
 *
 * O SQL (pendência escrita com a mensagem, supressão aplicada e baixada numa
 * transação, idempotência) é provado na migration real em Postgres descartável:
 *   scripts/db-audit/inbound-effects-replay.test.sh
 * Payloads GO anonimizados em fixture (sem telefone/CPF reais).
 */
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleIncomingMessage,
  resetOptOutKeywordCache,
} from "../evolution-webhook-messages.ts";
import { translateGoPayload } from "../evolution-go-adapter.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

type Chamada = { nome: string; args: Record<string, unknown> };

interface FakeConfig {
  keywords?: Array<{ keyword: string; match_mode: string }>;
  /** Quando setado, a leitura de talkx_optout_keywords falha (fonte indisponivel). */
  keywordsError?: { code: string; message: string };
  /** Retorno da RPC talkx_match_optout (fallback autoritativo). */
  matchOptout?: { data?: unknown; error?: { code: string; message: string } };
  /** Retorno do drain por chamada (suppression_id ou status por reentrega). */
  drainResults?: Array<Record<string, unknown>>;
  autoreply?: unknown;
  instanceToken?: unknown;
  leituras?: string[];
}

/** Seed da X029 (todas `exact`). */
const SEED = [
  "sair", "parar", "pare", "stop", "cancelar",
  "remover", "descadastrar", "unsubscribe", "optout", "nao quero",
].map((keyword) => ({ keyword, match_mode: "exact" }));

const drainOk = (parcial: Record<string, unknown> = {}) => ({
  suppression_id: null, optout_status: null, talkx_reply: null, multiplix_reply: null, pending_failed: 0, ...parcial,
});

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
    if (tabela === "talkx_optout_keywords") {
      return resolve(
        cfg.keywordsError
          ? { data: null, error: cfg.keywordsError }
          : { data: cfg.keywords ?? SEED, error: null },
      );
    }
    if (tabela === "talkx_recipients") return resolve({ data: [], error: null });
    return resolve({ data: [], error: null });
  };
  let ingestIndex = 0;
  let drainIndex = 0;
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
      if (nome === "drain_inbound_message_effects") {
        const seq = cfg.drainResults ?? [drainOk()];
        const valor = seq[Math.min(drainIndex, seq.length - 1)];
        drainIndex += 1;
        return { data: valor, error: null };
      }
      if (nome === "talkx_match_optout") {
        return { data: cfg.matchOptout?.data ?? null, error: cfg.matchOptout?.error ?? null };
      }
      if (nome === "get_instance_token") return { data: cfg.instanceToken ?? null, error: null };
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

/** Substitui o fetch global para capturar a autoresposta sem rede. */
function instalarFetchFalso(): void {
  fetchCalls = [];
  (globalThis as { fetch: typeof fetch }).fetch = ((url: unknown, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
    fetchCalls.push({ url: u, init: init ?? {} });
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
      status: 200,
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

Deno.test("X030: 'PARE' suprime 1x, responde com o setting e não atribui resposta", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const leituras: string[] = [];
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      keywords: SEED,
      drainResults: [drainOk({ suppression_id: "supp-1", optout_status: "suppressed" })],
      autoreply: "MENSAGEM DO SETTING (fixture)",
      instanceToken: "token-inst-1",
      leituras,
    });

    const { data, key } = traduzir(goIncoming("PARE", "3EB0PARE"));
    await handleIncomingMessage(supabase, "inst-go-x030-a", data, key, "http://localhost:54321", "svc");

    const ingests = chamadas.filter((c) => c.nome === "ingest_inbound_message");
    assertEquals(ingests.length, 1, "o ingest acontece uma vez");
    assertEquals(
      ingests[0].args.p_opt_out_decision,
      "matched",
      "o contrato de decisão viaja no ingest — 'matched' quando a palavra casa",
    );
    assertEquals(
      ingests[0].args.p_opt_out_keyword,
      "pare",
      "a palavra casada entra na MESMA chamada do ingest (efeito na mesma transação)",
    );
    assertEquals(
      "p_campaign_id" in ingests[0].args,
      false,
      "a campanha é resolvida NA RPC (talkx_suppress_contact herda do envio), não na edge",
    );

    const drenagens = chamadas.filter((c) => c.nome === "drain_inbound_message_effects");
    assertEquals(drenagens.length, 1, "a drenagem aplica o efeito pendente");
    assertEquals(drenagens[0].args.p_external_id, "3EB0PARE");

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
      drainResults: [
        drainOk({ suppression_id: "supp-1", optout_status: "suppressed" }),
        drainOk({ optout_status: "already_suppressed" }),
      ],
      autoreply: "MENSAGEM DO SETTING (fixture)",
      instanceToken: "token-inst-1",
      leituras,
    });

    const a = traduzir(goIncoming("PARE", "3EB0REP1"));
    await handleIncomingMessage(supabase, "inst-go-x030-b", a.data, a.key, "http://localhost:54321", "svc");
    const b = traduzir(goIncoming("PARE", "3EB0REP2"));
    await handleIncomingMessage(supabase, "inst-go-x030-b", b.data, b.key, "http://localhost:54321", "svc");

    assertEquals(chamadas.filter((c) => c.nome === "drain_inbound_message_effects").length, 2);
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
      // O gate de 30 dias é avaliado DENTRO de drain_inbound_message_effects;
      // aqui o fixture reflete a decisão da RPC.
      drainResults: [drainOk({ optout_status: "no_recent_send" })],
      autoreply: "MENSAGEM DO SETTING (fixture)",
      instanceToken: "token-inst-1",
    });

    const { data, key } = traduzir(goIncoming("PARE", "3EB0NOGATE"));
    await handleIncomingMessage(supabase, "inst-go-x030-c", data, key, "http://localhost:54321", "svc");

    const ingests = chamadas.filter((c) => c.nome === "ingest_inbound_message");
    assertEquals(ingests[0].args.p_opt_out_keyword, "pare", "a palavra continua entrando no ingest");
    assertEquals(fetchCalls.length, 0, "sem supressão aplicada não há autoresposta");
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
      drainResults: [drainOk({ suppression_id: "supp-btn", optout_status: "suppressed" })],
      autoreply: "MENSAGEM DO SETTING (fixture)",
      instanceToken: "token-inst-1",
    });

    const { data, key } = traduzir(goButton("talkx_optout", "3EB0BTN1"));
    await handleIncomingMessage(supabase, "inst-go-x030-d", data, key, "http://localhost:54321", "svc");

    const ingests = chamadas.filter((c) => c.nome === "ingest_inbound_message");
    assertEquals(ingests.length, 1);
    assertEquals(ingests[0].args.p_opt_out_keyword, "talkx_optout", "botão talkx_optout suprime como uma palavra");
    assertEquals("p_campaign_id" in ingests[0].args, false);
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
      drainResults: [drainOk({
        talkx_reply: { attributed: true, attribution: "contact", recipient_id: "r1", campaign_id: "c1" },
      })],
      autoreply: "MENSAGEM DO SETTING (fixture)",
      instanceToken: "token-inst-1",
    });

    const { data, key } = traduzir(goIncoming("Ainda tenho interesse", "3EB0RESP"));
    await handleIncomingMessage(supabase, "inst-go-x030-e", data, key, "http://localhost:54321", "svc");

    const ingests = chamadas.filter((c) => c.nome === "ingest_inbound_message");
    assertEquals(ingests[0].args.p_opt_out_decision, "not_matched", "sem casamento o ingest recebe 'not_matched'");
    assertEquals(ingests[0].args.p_opt_out_keyword, null, "sem palavra de opt-out a RPC enfileira as respostas");
    assertEquals(ingests[0].args.p_phone, "5511000000000", "o telefone resolvido alimenta a atribuição por telefone");
    assertEquals(
      chamadas.filter((c) => c.nome === "drain_inbound_message_effects").length,
      1,
      "a drenagem aplica a atribuição pendente",
    );
    assertEquals(fetchCalls.length, 0, "sem supressão não há autoresposta");
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("X030/#190: falha na leitura E na RPC vira 'indeterminate' no ingest — nunca atribui resposta", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      keywordsError: { code: "57P01", message: "admin shutdown" },
      matchOptout: { error: { code: "57P01", message: "admin shutdown" } },
      // A fonte autoritativa segue fora do ar: a resolução fica pendente na
      // outbox e a entrega falha para a Evolution reentregar.
      drainResults: [drainOk({ pending_failed: 1 })],
      autoreply: "MENSAGEM DO SETTING (fixture)",
    });

    const { data, key } = traduzir(goIncoming("PARE", "3EB0IND1"));
    await assertRejects(
      () => handleIncomingMessage(supabase, "inst-go-x030-ind", data, key, "http://localhost:54321", "svc"),
      Error,
      "pendente",
      "resolução indeterminada não é engolida: a entrega falha e o produtor reenvia",
    );

    const ingests = chamadas.filter((c) => c.nome === "ingest_inbound_message");
    assertEquals(ingests.length, 1, "o ingest acontece uma vez");
    assertEquals(
      ingests[0].args.p_opt_out_decision,
      "indeterminate",
      "falha nas duas fontes NÃO pode significar 'não casou': o ingest recebe 'indeterminate'",
    );
    assertEquals(ingests[0].args.p_opt_out_keyword, null, "sem decisão não há palavra casada");
    assertEquals(
      chamadas.some((c) => c.nome === "attribute_talkx_reply" || c.nome === "attribute_multiplix_item_reply"),
      false,
      "estado indeterminado não libera atribuição Talk X nem Multiplix",
    );
    assertEquals(fetchCalls.length, 0, "sem supressão não há autoresposta");
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});

Deno.test("X030/#190: leitura fora do ar e RPC autoritativa decide — 'matched' e 'not_matched'", async () => {
  resetOptOutKeywordCache();
  instalarFetchFalso();
  try {
    prepararAmbiente();
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      keywordsError: { code: "57P01", message: "admin shutdown" },
      // A RPC decide 'pare' para o primeiro texto e null para o segundo.
      matchOptout: { data: "pare" },
      drainResults: [drainOk({ suppression_id: "supp-ind", optout_status: "suppressed" })],
      autoreply: "MENSAGEM DO SETTING (fixture)",
      instanceToken: "token-inst-1",
    });

    const a = traduzir(goIncoming("PARE", "3EB0IND2"));
    await handleIncomingMessage(supabase, "inst-go-x030-ind2", a.data, a.key, "http://localhost:54321", "svc");

    const matchRpc = chamadas.filter((c) => c.nome === "talkx_match_optout");
    assertEquals(matchRpc.length, 1, "leitura indisponível: a RPC autoritativa decide");
    const ingest = chamadas.find((c) => c.nome === "ingest_inbound_message")!;
    assertEquals(ingest.args.p_opt_out_decision, "matched");
    assertEquals(ingest.args.p_opt_out_keyword, "pare", "a palavra decidida pela RPC viaja no ingest");
    assertEquals(fetchCalls.length, 1, "supressão decidida pela RPC gera a confirmação uma vez");

    // RPC decide "não casou": o estado vira not_matched (nunca indeterminate).
    chamadas.length = 0;
    const supabase2 = fakeSupabase(chamadas, {
      keywordsError: { code: "57P01", message: "admin shutdown" },
      matchOptout: { data: null },
      drainResults: [drainOk()],
    });
    const b = traduzir(goIncoming("Quero saber mais", "3EB0IND3"));
    await handleIncomingMessage(supabase2, "inst-go-x030-ind3", b.data, b.key, "http://localhost:54321", "svc");
    const ingest2 = chamadas.find((c) => c.nome === "ingest_inbound_message")!;
    assertEquals(ingest2.args.p_opt_out_decision, "not_matched", "RPC respondeu null: decisão é not_matched");
    assertEquals(ingest2.args.p_opt_out_keyword, null);
  } finally {
    restaurarFetch();
    resetOptOutKeywordCache();
  }
});
