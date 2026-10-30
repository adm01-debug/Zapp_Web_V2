/**
 * Presença ("digitando…") em GRUPO — contrato executável do `presence.update`.
 *
 * O defeito: `handlePresenceUpdate` só tratava 1:1 (`jid && !jid.endsWith('@g.us')`).
 * Presença de grupo era descartada em silêncio: o grupo é um contato igual aos
 * outros (phone = id sem o sufixo `@g.us`), então o painel que escuta
 * `typing:<conversationId>` nunca era avisado de que um participante digitava.
 * Além disso `@broadcast` (o recado/status do WhatsApp) seguia para o lookup de
 * contato sem nunca resolver nada.
 *
 * O que fica travado:
 *   1. grupo COM autor identificável e estado 'composing' → broadcast no canal do
 *      CHAT com `{ typing:true, participant }` (mais `isTyping` para o painel);
 *   2. grupo COM autor e estado NÃO-'composing' (paused/available) → broadcast
 *      `typing:false`, senão o indicador nunca apaga;
 *   3. grupo SEM autor identificável (sem `presences` e sem `participant`) →
 *      degrada explícito, zero broadcast e zero consulta ao banco;
 *   4. `status@broadcast` → ignorado, zero broadcast e zero consulta;
 *   5. 1:1 → contrato antigo intacto (`typing:<contactId>`, `{ isTyping, contactId }`).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handlePresenceUpdate } from "../evolution-webhook-handlers.ts";
import { invalidateConnectionCache } from "../evolution-helpers.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

interface Sent {
  channel: string;
  msg: { type: string; event: string; payload: Record<string, unknown> };
}

/** Client chainable mínimo: conexão e contato fixos; registra todo broadcast. */
function fakeDb(opts: { connectionId?: string | null; contactId?: string | null } = {}) {
  const connectionId = opts.connectionId === undefined ? "conn-1" : opts.connectionId;
  const contactId = opts.contactId === undefined ? "contato-1" : opts.contactId;
  const sends: Sent[] = [];
  const contador = { consultas: 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: () => chain,
    update: () => chain,
    insert: () => chain,
    upsert: () => chain,
    delete: () => chain,
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
    single: () => Promise.resolve(settle()),
    maybeSingle: () => Promise.resolve(settle()),
    then: (resolve: (v: unknown) => unknown) => resolve(settle()),
  };

  let tabelaAtual = "";
  function settle() {
    if (tabelaAtual === "whatsapp_connections") {
      contador.consultas++;
      return { data: connectionId ? { id: connectionId } : null, error: null };
    }
    if (tabelaAtual === "contacts") {
      return { data: contactId ? { id: contactId, avatar_url: null, assigned_to: null, name: null } : null, error: null };
    }
    return { data: null, error: null };
  }

  const client = {
    from: (t: string) => { tabelaAtual = t; return chain; },
    rpc: () => Promise.resolve({ data: false, error: null }),
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
    channel: (name: string) => ({
      send: (msg: Sent["msg"]) => { sends.push({ channel: name, msg }); return Promise.resolve(null); },
    }),
    removeChannel: () => {},
  } as unknown as EvolutionDbClient;

  return { client, sends, consultas: () => contador.consultas };
}

const GRUPO = "120363000000000001@g.us";
const PARTICIPANTE = "5511988887777@s.whatsapp.net";

Deno.test("grupo com participant: transmite no canal do chat com typing + participant", async () => {
  invalidateConnectionCache();
  const db = fakeDb();

  await handlePresenceUpdate(db.client, "inst-g", {
    id: GRUPO,
    presences: { [PARTICIPANTE]: { lastKnownPresence: "composing" } },
  });

  assertEquals(db.sends.length, 1, "grupo com autor tem de transmitir exatamente uma vez");
  const { channel, msg } = db.sends[0];
  assertEquals(channel, "typing:contato-1", "canal do CHAT (o contato do grupo), não um canal do participant");
  assertEquals(msg.type, "broadcast");
  assertEquals(msg.event, "contact_typing");
  assertEquals(msg.payload.typing, true);
  assertEquals(msg.payload.participant, PARTICIPANTE);
  assertEquals(msg.payload.isTyping, true, "o painel (useTypingPresence) lê `isTyping`");
});

Deno.test("grupo sem participant: degrada explícito — nenhum broadcast, nenhuma consulta", async () => {
  invalidateConnectionCache();
  const db = fakeDb();

  // SEM `presences` e SEM `participant`/`participantJid`: não há autor
  // identificável, então não se anuncia "alguém digitando" e não se toca o banco.
  await handlePresenceUpdate(db.client, "inst-g", {
    id: GRUPO,
    status: "composing",
  });

  assertEquals(db.sends.length, 0, "sem autor identificável não se anuncia 'alguém digitando'");
  assertEquals(db.consultas(), 0, "degrada antes de tocar o banco");
});

Deno.test("grupo com participant em paused: transmite typing:false (fim da digitação)", async () => {
  invalidateConnectionCache();
  const db = fakeDb();

  await handlePresenceUpdate(db.client, "inst-g", {
    id: GRUPO,
    presences: { [PARTICIPANTE]: { lastKnownPresence: "paused" } },
  });

  assertEquals(db.sends.length, 1, "o fim da digitação também tem de chegar ao painel");
  const { channel, msg } = db.sends[0];
  assertEquals(channel, "typing:contato-1");
  assertEquals(msg.payload.participant, PARTICIPANTE, "com autor, o participant vai junto");
  assertEquals(msg.payload.typing, false, "paused → typing:false (senão o indicador nunca apaga)");
  assertEquals(msg.payload.isTyping, false, "paused → isTyping:false");
});

Deno.test("grupo com presença direta e participant: também transmite", async () => {
  invalidateConnectionCache();
  const db = fakeDb();

  await handlePresenceUpdate(db.client, "inst-g", {
    id: GRUPO,
    status: "composing",
    participant: PARTICIPANTE,
  });

  assertEquals(db.sends.length, 1);
  assertEquals(db.sends[0].msg.payload.participant, PARTICIPANTE);
});

Deno.test("status@broadcast: ignorado — nenhum broadcast, nenhuma consulta", async () => {
  invalidateConnectionCache();
  const db = fakeDb();

  await handlePresenceUpdate(db.client, "inst-g", {
    id: "status@broadcast",
    presences: { "1": { lastKnownPresence: "composing" } },
  });

  assertEquals(db.sends.length, 0);
  assertEquals(db.consultas(), 0);
});

Deno.test("1:1: contrato antigo intacto (canal do contato, isTyping/contactId)", async () => {
  invalidateConnectionCache();
  const db = fakeDb();

  await handlePresenceUpdate(db.client, "inst-1", {
    id: "5511999999999@s.whatsapp.net",
    presences: { "1": { lastKnownPresence: "composing" } },
  });

  assertEquals(db.sends.length, 1);
  const { channel, msg } = db.sends[0];
  assertEquals(channel, "typing:contato-1");
  assertEquals(msg.payload.isTyping, true);
  assertEquals(msg.payload.contactId, "contato-1");
  assertEquals("participant" in msg.payload, false, "1:1 não ganha o campo de grupo");
  assertEquals("typing" in msg.payload, false, "1:1 não ganha o campo de grupo");
});
