/**
 * R2-API-006 (#69) — recuperação de efeitos no replay. Travado: toda entrega
 * drena `drain_inbound_message_effects`; erro de ingest/drain é LANÇADO (500 →
 * reentrega); autoresposta só com `suppression_id` NOVO; palavra de opt-out e
 * citação viajam no mesmo ingest. Atomicidade SQL provada na migration real:
 *   scripts/db-audit/inbound-effects-replay.test.sh
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
  ingestOutcomes?: Array<{ outcome: string; message_id: string | null }>;
  ingestErrors?: Array<unknown>;
  drainResults?: Array<Record<string, unknown> | { error: { code: string; message: string } }>;
}

const SEED = ["sair", "parar", "pare", "stop", "cancelar", "remover", "descadastrar", "unsubscribe", "optout", "nao quero"]
  .map((keyword) => ({ keyword, match_mode: "exact" }));

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
  chain.maybeSingle = () => ({
    data: tabela === "whatsapp_connections" ? { id: "conn-1" }
      : tabela === "talkx_settings" ? { value: "MENSAGEM DO SETTING (fixture)" }
      : null,
    error: null,
  });
  chain.single = chain.maybeSingle;
  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve(tabela === "talkx_optout_keywords" ? { data: SEED, error: null } : { data: [], error: null });
  let ingestIndex = 0;
  let drainIndex = 0;
  return {
    from: (t: string) => (tabela = t, chain),
    rpc: (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      if (nome === "ingest_inbound_message") {
        const erro = cfg.ingestErrors?.[ingestIndex];
        const outcome = cfg.ingestOutcomes?.[ingestIndex] ?? { outcome: "inserted", message_id: "msg-1" };
        ingestIndex += 1;
        if (erro) return { data: null, error: erro };
        return {
          data: [{
            contact_id: "contact-1",
            contact_name: "Contato Fixture",
            assigned_to: null,
            avatar_url: "https://example.invalid/avatar.jpg",
            contact_created: false,
            message_id: outcome.message_id,
            outcome: outcome.outcome,
          }],
          error: null,
        };
      }
      if (nome === "drain_inbound_message_effects") {
        const resultado = cfg.drainResults?.[Math.min(drainIndex, (cfg.drainResults?.length ?? 1) - 1)];
        drainIndex += 1;
        if (resultado && "error" in resultado) return { data: null, error: resultado.error };
        return { data: resultado ?? drainOk(), error: null };
      }
      if (nome === "get_instance_token") return { data: "token-inst-1", error: null };
      return { data: null, error: null };
    },
  } as unknown as EvolutionDbClient;
}

/** Payload GO anonimizado; com `stanzaId` vira resposta citando envio nosso. */
const goIncoming = (texto: string, id: string, stanzaId?: string): Record<string, unknown> => ({
  event: "message",
  instanceName: "inst-go-r2-006",
  data: {
    Info: {
      ID: id,
      Chat: "5511000000000@s.whatsapp.net",
      Sender: "5511000000001@c.us",
      PushName: "Contato Fixture",
      Timestamp: "2026-10-03T12:00:00.000Z",
      IsFromMe: false,
    },
    Message: stanzaId
      ? { extendedTextMessage: { text: texto, contextInfo: { stanzaId } } }
      : { conversation: texto },
  },
});

function traduzir(payload: Record<string, unknown>) {
  const data = translateGoPayload(payload).data as Record<string, unknown>;
  return { data, key: data.key as { id: string; remoteJid?: string; fromMe: boolean } };
}

const originalFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string; init: RequestInit }> = [];

async function entregar(supabase: EvolutionDbClient, texto: string, id: string, stanzaId?: string) {
  const { data, key } = traduzir(goIncoming(texto, id, stanzaId));
  await handleIncomingMessage(supabase, "inst-go-r2-006", data, key, "http://localhost:54321", "svc");
}

function comCenario(executa: (chamadas: Chamada[]) => Promise<void>): Promise<void> {
  fetchCalls = [];
  (globalThis as { fetch: typeof fetch }).fetch = ((url: unknown, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
    fetchCalls.push({ url: u, init: init ?? {} });
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;
  Deno.env.set("EVOLUTION_API_URL", "https://evolution.invalid");
  Deno.env.set("EVOLUTION_API_KEY", "chave-global-fixture");
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  resetOptOutKeywordCache();
  const chamadas: Chamada[] = [];
  return executa(chamadas).finally(() => {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
    resetOptOutKeywordCache();
  });
}

Deno.test("R2-API-006: falha no drain é lançada; a reentrega drena e a supressão sai uma única vez", () =>
  comCenario(async () => {
    const chamadas: Chamada[] = [];
    const supabase = fakeSupabase(chamadas, {
      ingestOutcomes: [
        { outcome: "inserted", message_id: "msg-1" },
        { outcome: "duplicate", message_id: "msg-1" },
        { outcome: "duplicate", message_id: "msg-1" },
      ],
      drainResults: [
        { error: { code: "57P01", message: "admin shutdown" } },
        drainOk({ suppression_id: "supp-1", optout_status: "suppressed" }),
        drainOk({ optout_status: "already_suppressed" }),
      ],
    });

    // Entrega 1: o erro de banco NÃO é engolido — a entrega falha e o produtor reenvia.
    await assertRejects(
      () => entregar(supabase, "PARE", "3EB0FAIL"),
      Error,
      "drain_inbound_message_effects falhou",
    );

    // Entrega 2: a linha pendente é drenada e a supressão sai UMA vez.
    await entregar(supabase, "PARE", "3EB0FAIL");
    assertEquals(fetchCalls.length, 1, "a reentrega confirma o opt-out recuperado uma única vez");
    const body = JSON.parse(String(fetchCalls[0].init.body)) as { text?: string };
    assertEquals(body.text, "MENSAGEM DO SETTING (fixture)");

    // Entrega 3: supressão já aplicada — sem segunda confirmação.
    await entregar(supabase, "PARE", "3EB0FAIL");

    const ingests = chamadas.filter((c) => c.nome === "ingest_inbound_message");
    for (const ingest of ingests) {
      assertEquals(ingest.args.p_opt_out_keyword, "pare", "a palavra entra no ingest em TODA entrega");
    }
    const drenagens = chamadas.filter((c) => c.nome === "drain_inbound_message_effects");
    assertEquals(drenagens.length, 3, "cada entrega drena — inclusive as de outcome duplicate");
    assertEquals(drenagens[0].args.p_external_id, "3EB0FAIL");
    assertEquals(fetchCalls.length, 1, "a confirmação nunca sai duas vezes");
  }));

Deno.test("R2-API-006: falha do ingest também é lançada (nada fica meio-aplicado para a reentrega)", () =>
  comCenario(async (chamadas) => {
    const supabase = fakeSupabase(chamadas, {
      ingestErrors: [{ code: "57P01", message: "admin shutdown" }],
    });
    const { data, key } = traduzir(goIncoming("Ainda tenho interesse", "3EB0TXERR"));
    await assertRejects(
      () => handleIncomingMessage(supabase, "inst-go-r2-006", data, key, "http://localhost:54321", "svc"),
      Error,
      "ingest_inbound_message falhou",
    );
    assertEquals(fetchCalls.length, 0);
  }));

Deno.test("R2-API-006: citação e palavra entram na mesma operação do ingest", () =>
  comCenario(async (chamadas) => {
    const supabase = fakeSupabase(chamadas, {
      drainResults: [drainOk({
        talkx_reply: { attributed: true, attribution: "contact", recipient_id: "r1", campaign_id: "c1" },
        multiplix_reply: { attributed: true, attribution: "linked", item_id: "i1", dispatch_id: "d1" },
      })],
    });

    await entregar(supabase, "Tenho interesse, me chama.", "3EB0Q1", "EXT-QUOTED-1");

    const ingest = chamadas.find((c) => c.nome === "ingest_inbound_message")!;
    assertEquals(ingest.args.p_quoted_external_id, "EXT-QUOTED-1", "a citação (stanzaId) viaja no ingest");
    assertEquals(ingest.args.p_opt_out_keyword, null, "texto normal não vira opt-out");
    assertEquals(fetchCalls.length, 0, "sem supressão não há autoresposta");
  }));
