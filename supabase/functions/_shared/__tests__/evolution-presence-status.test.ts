/**
 * Presença ONLINE/OFFLINE real do contato (R2-INB-030).
 *
 * Antes, `handlePresenceUpdate` só aproveitava 'composing' e DESCARTAVA
 * online/offline que a Evolution GO envia (evolution-go-adapter.ts mapeia
 * `presence` -> `presence.update`). Aqui o handler REAL é chamado com o mesmo
 * envelope que o adaptador produz, e o stub do client PostgREST espiona os
 * `update` em `contacts` e o broadcast de digitação.
 *
 * Fixtures sintéticas e anonimizadas: JID de número de exemplo, nunca de cliente.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { handlePresenceUpdate } from "../evolution-webhook-handlers.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

const JID = "5511988887777@s.whatsapp.net";
const GRUPO_JID = "120363000000000000@g.us";
const CONEXAO = { id: "conn-wa-1", instance_id: "instancia-sintetica-01" };
const CONTATO = { id: "contato-1", name: "Contato Sintético", avatar_url: null, assigned_to: null };

interface Update { tabela: string; valor: Record<string, unknown>; filtro: string }
interface Broadcast { contactId: string; isTyping: boolean }

/**
 * Stub: cadeia fluente por tabela. `whatsapp_connections` devolve a conexão;
 * um `select('presence_status')` devolve o estado atual do contato (para a
 * transição online->offline); qualquer outro select de `contacts` devolve o
 * contato. Os `update` e o broadcast são registrados.
 */
function makeStubClient(presencaAtual: string | null = null) {
  const updates: Update[] = [];
  const broadcasts: Broadcast[] = [];
  let colunasSelecionadas = "";

  const client = {
    from(tabela: string) {
      const chain: Record<string, unknown> = {};
      const resolve = () => {
        if (tabela === "whatsapp_connections") return Promise.resolve({ data: CONEXAO, error: null });
        if (colunasSelecionadas.includes("presence_status")) {
          return Promise.resolve({ data: { presence_status: presencaAtual }, error: null });
        }
        return Promise.resolve({ data: CONTATO, error: null });
      };
      chain.select = (cols: string) => { colunasSelecionadas = cols; return chain; };
      chain.update = (valor: Record<string, unknown>) => {
        updates.push({ tabela, valor, filtro: "" });
        return chain;
      };
      for (const metodo of ["eq", "neq", "in", "limit", "order"]) chain[metodo] = () => chain;
      chain.maybeSingle = () => resolve();
      chain.single = () => resolve();
      chain.then = (onFulfilled: (valor: unknown) => unknown) => resolve().then(onFulfilled);
      return chain;
    },
    channel(_nome: string) {
      return {
        send: (msg: { payload?: Broadcast }) => {
          if (msg.payload) broadcasts.push(msg.payload);
          return Promise.resolve();
        },
      };
    },
    removeChannel: () => {},
  } as unknown as EvolutionDbClient;

  return { client, updates, broadcasts };
}

function ultimoUpdate(updates: Update[]) {
  assertEquals(updates.length, 1);
  assertEquals(updates[0].tabela, "contacts");
  return updates[0].valor;
}

Deno.test("online: grava presence_status='online' e presence_updated_at; não toca last_seen_at", async () => {
  const { client, updates } = makeStubClient();
  await handlePresenceUpdate(client, CONEXAO.instance_id, { id: JID, status: "online" });

  const valor = ultimoUpdate(updates);
  assertEquals(valor.presence_status, "online");
  assertEquals(typeof valor.presence_updated_at, "string");
  assertEquals("last_seen_at" in valor, false);
});

Deno.test("available conta como online (o GO às vezes manda 'available')", async () => {
  const { client, updates } = makeStubClient();
  await handlePresenceUpdate(client, CONEXAO.instance_id, { id: JID, status: "available" });
  assertEquals(ultimoUpdate(updates).presence_status, "online");
});

Deno.test("offline após online: grava 'offline' e marca last_seen_at (transição)", async () => {
  const { client, updates } = makeStubClient("online");
  await handlePresenceUpdate(client, CONEXAO.instance_id, { id: JID, status: "offline" });

  const valor = ultimoUpdate(updates);
  assertEquals(valor.presence_status, "offline");
  assertEquals(typeof valor.presence_updated_at, "string");
  assertEquals(typeof valor.last_seen_at, "string");
});

Deno.test("offline quando já estava offline: NÃO reescreve last_seen_at (sem transição)", async () => {
  const { client, updates } = makeStubClient("offline");
  await handlePresenceUpdate(client, CONEXAO.instance_id, { id: JID, status: "offline" });

  const valor = ultimoUpdate(updates);
  assertEquals(valor.presence_status, "offline");
  assertEquals("last_seen_at" in valor, false);
});

Deno.test("'composing' inalterado: só avisa o front, nenhum update em contacts", async () => {
  const { client, updates, broadcasts } = makeStubClient();
  await handlePresenceUpdate(client, CONEXAO.instance_id, {
    id: JID,
    presences: { "5511988887777": { lastKnownPresence: "composing" } },
  });

  assertEquals(updates.length, 0);
  assertEquals(broadcasts.length, 1);
  assertEquals(broadcasts[0].isTyping, true);
});

Deno.test("'paused' inalterado: desliga o indicador de digitação, nenhum update", async () => {
  const { client, updates, broadcasts } = makeStubClient();
  await handlePresenceUpdate(client, CONEXAO.instance_id, {
    id: JID,
    presences: { "5511988887777": { lastKnownPresence: "paused" } },
  });

  assertEquals(updates.length, 0);
  assertEquals(broadcasts[0].isTyping, false);
});

Deno.test("grupo (@g.us) não grava presença de contato", async () => {
  const { client, updates, broadcasts } = makeStubClient();
  await handlePresenceUpdate(client, CONEXAO.instance_id, { id: GRUPO_JID, status: "online" });
  assertEquals(updates.length, 0);
  assertEquals(broadcasts.length, 0);
});
