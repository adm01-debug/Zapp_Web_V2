// R2-API-005 — Mensagem de grupo GO pode entrar no inbox como conversa direta do participante.
//
// O chat de um evento é o `remoteJid` do key. Quando ele é grupo (@g.us), o
// `participant` do key é o AUTOR dentro do grupo — não um interlocutor 1:1.
// O pipeline do inbox direto ignora grupos (`@g.us`), mas aplicava esse filtro
// DEPOIS de resolveEventJid(): como resolveBestJid prioriza telefone sobre
// grupo, o filtro via o telefone do participante e a mensagem de grupo era
// persistida/tratada como conversa direta dele.
//
// Este teste fixa a separação chat × autor: classificar o CHAT (primeiro source)
// antes de resolver a identidade do participante. Fixtures com grupo,
// participante, LID e remoteJidAlt cobrem os dois lados.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { translateGoPayload } from "../evolution-go-adapter.ts";
import { resolveEventJid } from "../evolution-helpers.ts";
import { handleIncomingMessage } from "../evolution-webhook-messages.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

const GRUPO = "120363421234567890@g.us";
const PARTICIPANTE = "5511988887777@s.whatsapp.net";
const LID = "998877665544332211@lid";
const TELEFONE_ALT = "5511977776666@s.whatsapp.net";

type Key = { id: string; remoteJid?: string; remoteJidAlt?: string; participant?: string; fromMe: boolean };

/** Evento GO de mensagem de texto, como o whatsmeow serializa (Info/Message). */
function goMessage(chat: string, sender: string): { data: Record<string, unknown>; key: Key } {
  const event = translateGoPayload({
    event: "message",
    instanceName: "inst-grupo",
    data: {
      Info: { ID: "GO-GRP-1", Chat: chat, Sender: sender, IsFromMe: false, Timestamp: "2026-10-06T12:00:00Z" },
      Message: { conversation: "bom dia pessoal" },
    },
  });
  const data = event.data as Record<string, unknown>;
  return { data, key: data.key as Key };
}

Deno.test("R2-API-005: evento GO de grupo resolve o CHAT (grupo), nunca o telefone do participante", () => {
  const { data, key } = goMessage(GRUPO, PARTICIPANTE);

  // O adaptador preserva o chat como remoteJid e o autor como participant.
  assertEquals(key.remoteJid, GRUPO);
  assertEquals(key.participant, PARTICIPANTE);

  // O JID do evento é o do grupo: o participante é autor, não interlocutor.
  assertEquals(resolveEventJid(key, data), GRUPO);
});

Deno.test("R2-API-005: mensagem de grupo NÃO toca o banco do inbox direto (guard de @g.us dispara)", async () => {
  const { data, key } = goMessage(GRUPO, PARTICIPANTE);

  const touched: string[] = [];
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self; chain.eq = self; chain.in = self; chain.order = self;
  chain.limit = self; chain.update = self; chain.insert = self; chain.upsert = self;
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
  chain.single = () => Promise.resolve({ data: null, error: null });
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
  const client = {
    from: (table: string) => {
      touched.push(table);
      return chain;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  } as unknown as EvolutionDbClient;

  await handleIncomingMessage(client, "inst-grupo", data, key, "http://127.0.0.1", "service-key");

  assert(
    touched.length === 0,
    `mensagem de grupo não pode entrar no inbox direto; tocou: ${touched.join(", ")}`,
  );
});

Deno.test("R2-API-005: conversa direta com LID + remoteJidAlt continua resolvendo o telefone (não é grupo)", () => {
  const key: Key = { id: "GO-DIR-1", remoteJid: LID, remoteJidAlt: TELEFONE_ALT, fromMe: false };
  const jid = resolveEventJid(key, { key });

  assertEquals(jid, TELEFONE_ALT, "LID não é grupo; o telefone real (remoteJidAlt) deve vencer");
});

Deno.test("R2-API-005: conversa direta que apenas CITA um grupo continua sendo o telefone do chat", () => {
  // contextInfo de uma resposta pode citar o remoteJid de um grupo; isso não
  // pode reclassificar a conversa 1:1 como grupo (a checagem olha só o chat do key).
  const key: Key = { id: "GO-DIR-2", remoteJid: PARTICIPANTE, fromMe: false };
  const data = {
    key,
    message: {
      extendedTextMessage: {
        text: "respondendo o que vi no grupo",
        contextInfo: { remoteJid: GRUPO, participant: "5511911112222@s.whatsapp.net" },
      },
    },
  };

  assertEquals(resolveEventJid(key, data), PARTICIPANTE);
});
