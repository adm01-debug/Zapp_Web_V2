/**
 * T25 — `handleCallEvent`: mapeamento dos eventos de chamada do Evolution,
 * `p_provider_event_id`, direção (`fromMe`/`isOutgoing`) e instante (`data.date`).
 *
 * Aceite do plano (linha 83): "teste da função com as fixtures". As fixtures são
 * **sintéticas e anonimizadas** em `../__fixtures__/`: medi que não existe
 * `webhook_events` com chamada gravada no banco canônico, então não havia
 * fixture "real" de onde copiar. A forma segue o envelope roteado em
 * `evolution-webhook/index.ts:272` (`event=call`) — `{ event, instance, data }`.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { handleCallEvent } from "../evolution-webhook-handlers.ts";
import {
  direcaoDaChamada,
  deveNotificarChamada,
  instanteDaChamada,
  normalizeEvolutionCallStatus,
} from "../notification-events.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

const CONEXAO = { id: "conn-wa-1", instance_id: "instancia-anonimizada-01", status: "connected" };
const CONTATO = { id: "contato-1", name: "Cliente", avatar_url: null, assigned_to: null };

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

/**
 * Stub do client PostgREST: cadeia fluente que devolve dado por tabela e espiona
 * a `rpc` (mesmo desenho de `cron-secret-authz-l5.test.ts`), para exercitar o
 * handler sem banco.
 */
function makeStubClient() {
  const rpcCalls: RpcCall[] = [];
  const client = {
    from(tabela: string) {
      const resultado =
        tabela === "whatsapp_connections" ? { data: CONEXAO, error: null } : { data: CONTATO, error: null };
      const chain: Record<string, unknown> = {};
      const resolve = () => Promise.resolve(resultado);
      for (const metodo of ["select", "eq", "neq", "in", "limit", "order", "insert", "update"]) {
        chain[metodo] = () => chain;
      }
      chain.maybeSingle = resolve;
      chain.single = resolve;
      // Alguns helpers fazem `await` na própria cadeia.
      chain.then = (onFulfilled: (valor: unknown) => unknown) => resolve().then(onFulfilled);
      return chain;
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as EvolutionDbClient;
  return { client, rpcCalls };
}

function lerFixture(nome: string): { event: string; instance: string; data: Record<string, unknown> } {
  const url = new URL(`../__fixtures__/${nome}`, import.meta.url);
  return JSON.parse(Deno.readTextFileSync(url));
}

const CASOS = [
  { arquivo: "evolution-call-offer.json", status: "ringing", notifica: true },
  { arquivo: "evolution-call-accept.json", status: "answered", notifica: false },
  { arquivo: "evolution-call-reject.json", status: "missed", notifica: false },
  { arquivo: "evolution-call-terminate.json", status: "ended", notifica: false },
];

for (const caso of CASOS) {
  Deno.test(`T25 ${caso.arquivo}: status vira '${caso.status}' e o data.id vai como provider_event_id`, async () => {
    const { client, rpcCalls } = makeStubClient();
    const fixture = lerFixture(caso.arquivo);

    await handleCallEvent(client, fixture.instance, fixture.data);

    assertEquals(rpcCalls.length, 1);
    assertEquals(rpcCalls[0].fn, "record_incoming_call_event");
    assertEquals(rpcCalls[0].args.p_status, caso.status);
    assertEquals(rpcCalls[0].args.p_provider_event_id, fixture.data.id);
    assertEquals(rpcCalls[0].args.p_is_video, false);
    assertEquals(rpcCalls[0].args.p_should_notify, caso.notifica);
    // T26: a direcao derivada do payload chega na RPC (nao mais 'inbound' fixo).
    assertEquals(rpcCalls[0].args.p_direction, "inbound");
    assertEquals(rpcCalls[0].args.p_contact_id, CONTATO.id);
    assertEquals(rpcCalls[0].args.p_whatsapp_connection_id, CONEXAO.id);
  });
}

Deno.test("T25 chamada de SAÍDA (fromMe) não gera notificação de chamada recebida", async () => {
  const { client, rpcCalls } = makeStubClient();
  const fixture = lerFixture("evolution-call-offer.json");

  await handleCallEvent(client, fixture.instance, { ...fixture.data, fromMe: true });

  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].args.p_should_notify, false);
  assertEquals(rpcCalls[0].args.p_direction, "outbound");
});

Deno.test("T25 direção: fromMe e isOutgoing viram 'outbound'; sem marcação vira 'inbound'", () => {
  assertEquals(direcaoDaChamada({ fromMe: true }), "outbound");
  assertEquals(direcaoDaChamada({ isOutgoing: true }), "outbound");
  assertEquals(direcaoDaChamada({ fromMe: false, isOutgoing: false }), "inbound");
  assertEquals(direcaoDaChamada({}), "inbound");
});

Deno.test("T25 instante: usa data.date, e devolve null quando ausente ou inválido", () => {
  assertEquals(instanteDaChamada({ date: "2026-10-02T14:00:00.000Z" }), "2026-10-02T14:00:00.000Z");
  assertEquals(instanteDaChamada({ date: "não-é-data" }), null);
  assertEquals(instanteDaChamada({ date: 42 }), null);
  assertEquals(instanteDaChamada({}), null);
});

Deno.test("T25 deveNotificarChamada: saída nunca notifica, mesmo em offer", () => {
  assertEquals(deveNotificarChamada("offer", "inbound"), true);
  assertEquals(deveNotificarChamada("offer", "outbound"), false);
  assertEquals(deveNotificarChamada("accept", "inbound"), false);
});

Deno.test("T25 mapeamento completo dos status exigidos pelo plano", () => {
  assertEquals(normalizeEvolutionCallStatus("offer"), "ringing");
  assertEquals(normalizeEvolutionCallStatus("ringing"), "ringing");
  assertEquals(normalizeEvolutionCallStatus("accept"), "answered");
  assertEquals(normalizeEvolutionCallStatus("reject"), "missed");
  assertEquals(normalizeEvolutionCallStatus("timeout"), "missed");
  assertEquals(normalizeEvolutionCallStatus("terminate"), "ended");
});
