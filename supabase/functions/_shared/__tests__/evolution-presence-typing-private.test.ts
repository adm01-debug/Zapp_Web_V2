/**
 * PD-68 — contrato executável do "digitando" do contato.
 *
 * O defeito (evolution-webhook-handlers.ts:218, antes): o webhook publicava o
 * broadcast `contact_typing` em canal PÚBLICO (`typing:<id>` sem opção) — um
 * cliente anônimo lia e forjava "digitando" alheio — e o ramo também aceitava
 * JID de difusão (`@broadcast`, inclui `status@broadcast`), que não é contato.
 *
 * O que fica travado:
 *   1. o canal é PRIVADO (`{ config: { private: true } }`) — a RLS de
 *      realtime.messages decide quem lê e quem envia (migration 20261013210002);
 *   2. `@broadcast`/`status@broadcast` e grupo (`@g.us`) são ignorados, sem
 *      tocar no banco;
 *   3. fail-closed: sem instância registrada ou sem contato, NADA é publicado
 *      (o emissor é autenticado pelo gate do webhook e pela instância conhecida);
 *   4. isTyping propagado (composing → true; outro estado → false) e o canal é
 *      descartado depois do envio.
 *
 * Sem a correção, os casos 1, 2 e 3 falham (o 4 é guarda de regressão).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { invalidateConnectionCache } from "../evolution-helpers.ts";
import { handlePresenceUpdate } from "../evolution-webhook-handlers.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

const CONEXAO = { id: "conn-1" };
const CONTATO = { id: "contato-1", avatar_url: null, assigned_to: null, name: "Contato Sintético" };
const JID = "5511999999999@s.whatsapp.net";

interface CanalAberto {
  nome: string;
  opcoes?: Record<string, unknown>;
}

interface FakeDb {
  client: EvolutionDbClient;
  /** Canais abertos por `supabase.channel(nome, opcoes)`, na ordem. */
  canais: CanalAberto[];
  /** Broadcasts enviados (um por `channel.send`). */
  enviados: Array<Record<string, unknown>>;
  /** Canais passados a `removeChannel` (descartados após o envio). */
  removidos: unknown[];
  /** Tabelas tocadas — prova que `@broadcast` não chegou ao banco. */
  consultas: string[];
}

/**
 * Client chainable mínimo. `conexao`/`contato` são as linhas devolvidas por
 * `maybeSingle`/`single`; `null` reproduz "instância sem conexão" / "contato
 * inexistente". O `channel` registra nome E opções para provar o `private`.
 */
function fakeDb(opts: { conexao?: { id: string } | null; contato?: typeof CONTATO | null }): FakeDb {
  const conexao = opts.conexao === undefined ? CONEXAO : opts.conexao;
  const contato = opts.contato === undefined ? CONTATO : opts.contato;
  const canais: CanalAberto[] = [];
  const enviados: Array<Record<string, unknown>> = [];
  const removidos: unknown[] = [];
  const consultas: string[] = [];

  const builder = (tabela: string) => {
    const b: Record<string, unknown> = {};
    const self = () => b;
    for (const metodo of [
      "select", "eq", "in", "is", "not", "gte", "like", "match",
      "filter", "order", "limit", "update", "upsert", "insert", "delete",
    ]) {
      b[metodo] = self;
    }
    const linha = tabela === "whatsapp_connections" ? conexao : contato;
    b.single = () => Promise.resolve({ data: linha, error: null });
    b.maybeSingle = b.single;
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve({ data: linha ? [linha] : [], error: null }).then(res, rej);
    return b;
  };

  const client = {
    from: (tabela: string) => {
      consultas.push(tabela);
      return builder(tabela);
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
    channel: (nome: string, opcoes?: Record<string, unknown>) => {
      canais.push({ nome, opcoes });
      return {
        send: (args: Record<string, unknown>) => {
          enviados.push(args);
          return Promise.resolve("ok");
        },
      };
    },
    removeChannel: (canal: unknown) => {
      removidos.push(canal);
    },
  } as unknown as EvolutionDbClient;

  return { client, canais, enviados, removidos, consultas };
}

function presencia(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: JID, presences: { "1": { lastKnownPresence: "composing" } }, ...over };
}

// Nomes de instância distintos por teste: o lookup tem cache de módulo.
Deno.test("T1 — composing do contato abre canal PRIVADO typing:<id> e envia contact_typing", async () => {
  invalidateConnectionCache();
  const db = fakeDb({});
  await handlePresenceUpdate(db.client, "inst-t1", presencia());

  assertEquals(db.canais.length, 1);
  assertEquals(db.canais[0].nome, `typing:${CONTATO.id}`);
  assertEquals(db.canais[0].opcoes, { config: { private: true } });
  assertEquals(db.enviados.length, 1);
  assertEquals(db.enviados[0].type, "broadcast");
  assertEquals(db.enviados[0].event, "contact_typing");
  assertEquals((db.enviados[0].payload as Record<string, unknown>).isTyping, true);
  assertEquals((db.enviados[0].payload as Record<string, unknown>).contactId, CONTATO.id);
  assertEquals(db.removidos.length, 1);
});

Deno.test("T2 — JID de difusão (@broadcast / status@broadcast) é ignorado e não toca no banco", async () => {
  invalidateConnectionCache();
  for (const jid of ["5511999999999@broadcast", "status@broadcast"]) {
    const db = fakeDb({});
    await handlePresenceUpdate(db.client, "inst-t2", presencia({ id: jid }));
    assertEquals(db.canais.length, 0, `não deveria abrir canal para ${jid}`);
    assertEquals(db.enviados.length, 0, `não deveria enviar para ${jid}`);
    assertEquals(db.consultas.length, 0, `não deveria consultar o banco para ${jid}`);
  }
});

Deno.test("T3 — grupo (@g.us) continua ignorado", async () => {
  invalidateConnectionCache();
  const db = fakeDb({});
  await handlePresenceUpdate(db.client, "inst-t3", presencia({ id: "120363421234567890@g.us" }));
  assertEquals(db.canais.length, 0);
  assertEquals(db.consultas.length, 0);
});

Deno.test("T4 — instância sem conexão registrada: fail-closed, nada publicado", async () => {
  invalidateConnectionCache();
  const db = fakeDb({ conexao: null });
  await handlePresenceUpdate(db.client, "inst-t4", presencia());
  assertEquals(db.canais.length, 0);
  assertEquals(db.enviados.length, 0);
});

Deno.test("T5 — contato inexistente: fail-closed, nada publicado", async () => {
  invalidateConnectionCache();
  const db = fakeDb({ contato: null });
  await handlePresenceUpdate(db.client, "inst-t5", presencia());
  assertEquals(db.canais.length, 0);
  assertEquals(db.enviados.length, 0);
});

Deno.test("T6 — estado que não é composing publica isTyping=false (canal privado)", async () => {
  invalidateConnectionCache();
  const db = fakeDb({});
  await handlePresenceUpdate(db.client, "inst-t6", presencia({ presences: { "1": { lastKnownPresence: "paused" } } }));
  assertEquals(db.canais.length, 1);
  assertEquals(db.canais[0].opcoes, { config: { private: true } });
  assertEquals((db.enviados[0].payload as Record<string, unknown>).isTyping, false);
});

Deno.test("T7 — sem jid: nada acontece", async () => {
  invalidateConnectionCache();
  const db = fakeDb({});
  await handlePresenceUpdate(db.client, "inst-t7", { presences: { "1": { lastKnownPresence: "composing" } } });
  assertEquals(db.canais.length, 0);
  assertEquals(db.consultas.length, 0);
});
