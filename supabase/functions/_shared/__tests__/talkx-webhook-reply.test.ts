/**
 * X028 — contrato executável da ATRIBUIÇÃO DE RESPOSTA do Talk X.
 *
 * R2-API-006 (#69): a atribuição deixou de ser chamada solta depois do
 * ingest — os insumos (contato, telefone, citação) entram na MESMA chamada de
 * `ingest_inbound_message` (pendência na outbox na mesma transação) e
 * `drain_inbound_message_effects` aplica `attribute_talkx_reply` no banco.
 * Travado no contrato novo:
 *
 *   1. a resposta do contato leva o telefone resolvido (`p_phone`) até a RPC
 *      de ingest — sem ele, a atribuição por telefone (LID/duplicado) não casa;
 *   2. o handler AGUARDA a drenagem: só resolve depois que os efeitos
 *      pendentes terminam;
 *   3. mensagem de opt-out não enfileira resposta (`p_opt_out_keyword` vai
 *      preenchido — a exclusão mútua é provada no SQL);
 *   4. RPC atribuindo `attributed=false` não é erro: o handler resolve normal.
 *
 * O SQL é provado na migration real em Postgres descartável:
 *   scripts/db-audit/inbound-effects-replay.test.sh
 * Payloads GO anonimizados em fixture (sem telefone/CPF reais).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleIncomingMessage } from "../evolution-webhook-messages.ts";
import { translateGoPayload } from "../evolution-go-adapter.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

type Chamada = { nome: string; args: Record<string, unknown> };
type RpcHandler = (args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

/** Mock chainable mínimo + thenable (consultas sem terminal resolvem vazio). */
function fakeSupabase(chamadas: Chamada[], rpcHandlers: Record<string, RpcHandler>) {
  let tabela = "";
  const chain: Record<string, unknown> = {};
  const mesmo = () => chain;
  for (const metodo of ["select", "eq", "in", "is", "not", "gte", "order", "limit", "update", "insert", "upsert", "delete"]) {
    chain[metodo] = mesmo;
  }
  chain.maybeSingle = async () =>
    tabela === "whatsapp_connections" ? { data: { id: "conn-1" }, error: null } : { data: null, error: null };
  chain.single = chain.maybeSingle;
  // X030: as palavras de opt-out saíram do regex fixo e agora vêm de
  // `talkx_optout_keywords`. O fixture devolve o seed da X029 para que "SAIR"
  // continue sendo reconhecido como opt-out (e não conte como resposta).
  const SEED_KEYWORDS = [
    "sair", "parar", "pare", "stop", "cancelar",
    "remover", "descadastrar", "unsubscribe", "optout", "nao quero",
  ].map((keyword) => ({ keyword, match_mode: "exact" }));
  // Consultas encadeadas sem terminal (ex.: gate de opt-out em talkx_recipients)
  // resolvem lista vazia — nenhuma campanha recente no fixture.
  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve(
      tabela === "talkx_optout_keywords"
        ? { data: SEED_KEYWORDS, error: null }
        : { data: [], error: null },
    );
  return {
    from: (t: string) => {
      tabela = t;
      return chain;
    },
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      const handler = rpcHandlers[nome];
      return handler ? await handler(args) : { data: null, error: null };
    },
  } as unknown as EvolutionDbClient;
}

/** Payload GO anonimizado de mensagem recebida (evento `message`). */
function goIncomingMessage(texto: string, id = "3EB0REPLY"): Record<string, unknown> {
  return {
    event: "message",
    instanceName: "inst-go-x028",
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

function inboundResult() {
  return {
    contact_id: "contact-1",
    contact_name: "Contato Fixture",
    assigned_to: null,
    avatar_url: "https://example.invalid/avatar.jpg",
    contact_created: false,
    message_id: "msg-1",
    outcome: "inserted",
  };
}

const drainResult = (parcial: Record<string, unknown> = {}) => ({
  suppression_id: null, optout_status: null, talkx_reply: null, multiplix_reply: null, pending_failed: 0, ...parcial,
});

function traduzirMensagem(texto: string, id = "3EB0REPLY") {
  const recebida = translateGoPayload(goIncomingMessage(texto, id));
  const data = recebida.data as Record<string, unknown>;
  const key = data.key as { id: string; remoteJid: string; fromMe: boolean };
  return { data, key };
}

Deno.test("X028: resposta de contato — o handler só resolve depois da drenagem (await)", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let drenagemConcluida = false;
  const chamadas: Chamada[] = [];

  const supabase = fakeSupabase(chamadas, {
    ingest_inbound_message: async () => ({ data: [inboundResult()], error: null }),
    drain_inbound_message_effects: async () => {
      await gate;
      drenagemConcluida = true;
      return {
        data: drainResult({
          talkx_reply: { attributed: true, attribution: "contact", recipient_id: "r1", campaign_id: "c1" },
        }),
        error: null,
      };
    },
  });

  const { data, key } = traduzirMensagem("Tenho interesse, me chama.");
  let handlerResolveu = false;
  const pendente = handleIncomingMessage(supabase, "inst-x028-await", data, key, "http://localhost:54321", "svc")
    .then(() => {
      handlerResolveu = true;
    });

  // Deixa o handler avançar até travar na RPC de drenagem.
  await new Promise((resolve) => setTimeout(resolve, 25));

  const drenagens = chamadas.filter((c) => c.nome === "drain_inbound_message_effects");
  assertEquals(drenagens.length, 1, "drain_inbound_message_effects deve ser chamada");
  assertEquals(drenagens[0].args.p_external_id, "3EB0REPLY");
  assertEquals(drenagens[0].args.p_connection_id, "conn-1");
  assertEquals(handlerResolveu, false, "o handler não pode resolver antes da drenagem terminar");

  const ingests = chamadas.filter((c) => c.nome === "ingest_inbound_message");
  assertEquals(ingests[0].args.p_phone, "5511000000000", "o telefone resolvido alimenta a atribuição");
  assertEquals(ingests[0].args.p_opt_out_keyword, null);

  release();
  await pendente;
  assertEquals(handlerResolveu, true, "o handler resolve depois da drenagem");
  assertEquals(drenagemConcluida, true);
});

Deno.test("X028: mensagem de opt-out não enfileira atribuição", async () => {
  const chamadas: Chamada[] = [];
  const supabase = fakeSupabase(chamadas, {
    ingest_inbound_message: async () => ({ data: [inboundResult()], error: null }),
    drain_inbound_message_effects: async () => ({
      data: drainResult({ optout_status: "no_recent_send" }),
      error: null,
    }),
  });

  const { data, key } = traduzirMensagem("SAIR", "3EB0OPTOUT");
  await handleIncomingMessage(supabase, "inst-x028-optout", data, key, "http://localhost:54321", "svc");

  const ingests = chamadas.filter((c) => c.nome === "ingest_inbound_message");
  assertEquals(
    ingests[0].args.p_opt_out_keyword,
    "sair",
    "a palavra de opt-out entra no ingest — a RPC enfileira SÓ a supressão",
  );
  assertEquals(
    chamadas.some((c) => c.nome === "attribute_talkx_reply"),
    false,
    "opt-out não pode contar como resposta/engajamento",
  );
});

Deno.test("X028: resposta sem destinatário na janela não é erro (drenagem attributed=false)", async () => {
  const chamadas: Chamada[] = [];
  const supabase = fakeSupabase(chamadas, {
    ingest_inbound_message: async () => ({ data: [inboundResult()], error: null }),
    drain_inbound_message_effects: async () => ({
      data: drainResult({
        talkx_reply: { attributed: false, attribution: null, reason: "no_recipient_in_window" },
      }),
      error: null,
    }),
  });

  const { data, key } = traduzirMensagem("Ainda tenho interesse", "3EB0NOMATCH");
  await handleIncomingMessage(supabase, "inst-x028-nomatch", data, key, "http://localhost:54321", "svc");

  // O handler chama a drenagem; quando ela não casa, o retorno é falsy mas o
  // webhook segue normalmente (a resposta do contato nunca falha por causa da
  // atribuição).
  assertEquals(chamadas.filter((c) => c.nome === "drain_inbound_message_effects").length, 1);
});
