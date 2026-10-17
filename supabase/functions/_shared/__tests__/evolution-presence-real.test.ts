/**
 * Presenca REAL (online/offline) do contato — contrato executavel do `presence.update`.
 *
 * O que este cartao soma (fusao B02-functions-37 + dia): alem do indicador
 * "digitando", o handler passou a gravar a presenca REAL do contato no 1:1.
 * A dia so publicava o broadcast e nunca tocava `contacts`; o teste do indicador
 * (`evolution-presence-group-typing.test.ts`) continua sendo o contrato do canal.
 *
 * O que fica travado aqui:
 *   1. 1:1 com estado 'online' -> `contacts.presence_status='online'` +
 *      `presence_updated_at`, SEM perder o broadcast `contact_typing`;
 *   2. transicao online -> offline grava `last_seen_at` (o "visto por ultimo");
 *   3. offline direto (o contato ja vinha offline) NAO reescreve `last_seen_at`
 *      — o horario nao pode ser inventado nem adiantado;
 *   4. grupo NAO grava presenca em `contacts` (grupo nao tem presenca propria).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handlePresenceUpdate } from "../evolution-webhook-handlers.ts";
import { invalidateConnectionCache } from "../evolution-helpers.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

interface Sent {
  channel: string;
  msg: { type: string; event: string; payload: Record<string, unknown> };
}

/**
 * Client chainable minimo: conexao e contato fixos, `presence_status` atual
 * controlavel e todo `update` registrado (o efeito que o teste afirma).
 */
function fakeDb(opts: { estadoAtual?: string } = {}) {
  const estado = opts.estadoAtual ?? "offline";
  const sends: Sent[] = [];
  const updates: Record<string, unknown>[] = [];
  let tabela = "";

  function settle() {
    if (tabela === "whatsapp_connections") return { data: { id: "conn-1" }, error: null };
    if (tabela === "contacts") {
      return {
        data: {
          id: "contato-1",
          avatar_url: null,
          assigned_to: null,
          name: null,
          presence_status: estado,
        },
        error: null,
      };
    }
    return { data: null, error: null };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    is: () => chain,
    not: () => chain,
    gte: () => chain,
    like: () => chain,
    match: () => chain,
    filter: () => chain,
    order: () => chain,
    limit: () => chain,
    insert: () => chain,
    upsert: () => chain,
    delete: () => chain,
    update: (payload: Record<string, unknown>) => {
      updates.push(payload);
      return chain;
    },
    single: () => Promise.resolve(settle()),
    maybeSingle: () => Promise.resolve(settle()),
    then: (resolve: (v: unknown) => unknown) => resolve(settle()),
  };

  const client = {
    from: (t: string) => {
      tabela = t;
      return chain;
    },
    rpc: () => Promise.resolve({ data: false, error: null }),
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
    channel: (name: string) => ({
      send: (msg: Sent["msg"]) => {
        sends.push({ channel: name, msg });
        return Promise.resolve(null);
      },
    }),
    removeChannel: () => {},
  } as unknown as EvolutionDbClient;

  return { client, sends, updates };
}

const DIRETO = "5511999999999@s.whatsapp.net";
const GRUPO = "120363000000000001@g.us";
const PARTICIPANTE = "5511988887777@s.whatsapp.net";

Deno.test("1:1 online: grava presence_status=online e mantem o broadcast do indicador", async () => {
  invalidateConnectionCache();
  const db = fakeDb();

  await handlePresenceUpdate(db.client, "inst-1", {
    id: DIRETO,
    presences: { [DIRETO]: { lastKnownPresence: "online" } },
  });

  assertEquals(db.sends.length, 1, "o indicador da dia continua sendo publicado");
  assertEquals(db.updates.length, 1, "a presenca real tem de ser gravada uma vez");
  assertEquals(db.updates[0].presence_status, "online");
  assertEquals(typeof db.updates[0].presence_updated_at, "string");
  assertEquals("last_seen_at" in db.updates[0], false, "online nao marca 'visto por ultimo'");
});

Deno.test("1:1 envelope direto (status online): tambem grava a presenca", async () => {
  invalidateConnectionCache();
  const db = fakeDb();

  await handlePresenceUpdate(db.client, "inst-1", { id: DIRETO, status: "online" });

  assertEquals(db.updates.length, 1, "o envelope Presence {status} entra pelo mesmo caminho");
  assertEquals(db.updates[0].presence_status, "online");
});

Deno.test("transicao online -> offline grava last_seen_at", async () => {
  invalidateConnectionCache();
  const db = fakeDb({ estadoAtual: "online" });

  await handlePresenceUpdate(db.client, "inst-1", {
    id: DIRETO,
    presences: { [DIRETO]: { lastKnownPresence: "offline" } },
  });

  assertEquals(db.updates.length, 1);
  assertEquals(db.updates[0].presence_status, "offline");
  assertEquals(typeof db.updates[0].last_seen_at, "string", "a saida do contato que estava online marca o horario");
});

Deno.test("offline direto nao reescreve last_seen_at", async () => {
  invalidateConnectionCache();
  const db = fakeDb({ estadoAtual: "offline" });

  await handlePresenceUpdate(db.client, "inst-1", {
    id: DIRETO,
    presences: { [DIRETO]: { lastKnownPresence: "offline" } },
  });

  assertEquals(db.updates.length, 1, "o estado continua sendo atualizado");
  assertEquals(db.updates[0].presence_status, "offline");
  assertEquals("last_seen_at" in db.updates[0], false, "contato que ja vinha offline nao inventa horario");
});

Deno.test("grupo nao grava presenca em contacts (grupo nao tem presenca propria)", async () => {
  invalidateConnectionCache();
  const db = fakeDb();

  await handlePresenceUpdate(db.client, "inst-g", {
    id: GRUPO,
    presences: { [PARTICIPANTE]: { lastKnownPresence: "online" } },
  });

  assertEquals(db.updates.length, 0, "presenca real e so do 1:1");
});
