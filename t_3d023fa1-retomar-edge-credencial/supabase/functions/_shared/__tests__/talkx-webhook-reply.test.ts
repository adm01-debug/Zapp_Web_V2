/**
 * X028 — contrato executável da ATRIBUIÇÃO DE RESPOSTA do Talk X.
 *
 * O que fica travado:
 *   1. uma resposta de contato chama a RPC `attribute_talkx_reply` com o
 *      `contact_id` E o telefone resolvido (`p_phone`) — sem o telefone, o
 *      contato que chegou por outro contact_id (LID/duplicado) não seria casado;
 *   2. o handler AGUARDA a RPC: só resolve depois que ela termina (antes era
 *      `void`, fire-and-forget, e o efeito podia se perder no congelamento);
 *   3. resposta que é palavra de opt-out não chama a atribuição.
 *
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

function traduzirMensagem(texto: string, id = "3EB0REPLY") {
  const recebida = translateGoPayload(goIncomingMessage(texto, id));
  const data = recebida.data as Record<string, unknown>;
  const key = data.key as { id: string; remoteJid: string; fromMe: boolean };
  return { data, key };
}

Deno.test("X028: resposta de contato — o handler só resolve depois da RPC (await)", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let atribuicaoConcluida = false;
  const chamadas: Chamada[] = [];

  const supabase = fakeSupabase(chamadas, {
    ingest_inbound_message: async () => ({ data: [inboundResult()], error: null }),
    attribute_talkx_reply: async () => {
      await gate;
      atribuicaoConcluida = true;
      return {
        data: { attributed: true, attribution: "contact", recipient_id: "r1", campaign_id: "c1" },
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

  // Deixa o handler avançar até travar na RPC.
  await new Promise((resolve) => setTimeout(resolve, 25));

  const atribuicoes = chamadas.filter((c) => c.nome === "attribute_talkx_reply");
  assertEquals(atribuicoes.length, 1, "attribute_talkx_reply deve ser chamada");
  assertEquals(atribuicoes[0].args.p_contact_id, "contact-1");
  assertEquals(atribuicoes[0].args.p_phone, "5511000000000", "o telefone resolvido vai em p_phone");
  assertEquals(atribuicoes[0].args.p_message_id, "msg-1");
  assertEquals(handlerResolveu, false, "o handler não pode resolver antes da RPC terminar");

  release();
  await pendente;
  assertEquals(handlerResolveu, true, "o handler resolve depois da RPC");
  assertEquals(atribuicaoConcluida, true);
});

Deno.test("X028: mensagem de opt-out não chama a atribuição", async () => {
  const chamadas: Chamada[] = [];
  const supabase = fakeSupabase(chamadas, {
    ingest_inbound_message: async () => ({ data: [inboundResult()], error: null }),
    attribute_talkx_reply: async () => ({ data: { attributed: true }, error: null }),
  });

  const { data, key } = traduzirMensagem("SAIR", "3EB0OPTOUT");
  await handleIncomingMessage(supabase, "inst-x028-optout", data, key, "http://localhost:54321", "svc");

  assertEquals(
    chamadas.some((c) => c.nome === "attribute_talkx_reply"),
    false,
    "opt-out não pode contar como resposta/engajamento",
  );
  assertEquals(
    chamadas.some((c) => c.nome === "talkx_suppress_contact"),
    false,
    "sem campanha recente no fixture não há supressão",
  );
});

Deno.test("X028: resposta sem destinatário na janela não é erro (RPC attributed=false)", async () => {
  const chamadas: Chamada[] = [];
  const supabase = fakeSupabase(chamadas, {
    ingest_inbound_message: async () => ({ data: [inboundResult()], error: null }),
    attribute_talkx_reply: async () => ({
      data: { attributed: false, attribution: null, reason: "no_recipient_in_window" },
      error: null,
    }),
  });

  const { data, key } = traduzirMensagem("Ainda tenho interesse", "3EB0NOMATCH");
  await handleIncomingMessage(supabase, "inst-x028-nomatch", data, key, "http://localhost:54321", "svc");

  // O handler chama a RPC; quando ela não casa, o retorno é falsy mas o webhook
  // segue normalmente (a resposta do contato nunca falha por causa da atribuição).
  assertEquals(chamadas.filter((c) => c.nome === "attribute_talkx_reply").length, 1);
});
