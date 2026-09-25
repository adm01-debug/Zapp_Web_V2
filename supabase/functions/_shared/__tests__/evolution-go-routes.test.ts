import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { translateV2ToGo } from "../evolution-go-routes.ts";

// GoRoute.body é unknown (o tradutor monta shapes distintos por rota) — este
// alias evita `any` (o ratchet de lint do repo trava qualquer ocorrência nova)
// sem perder a leitura de campo arbitrário nas asserções abaixo.
type GoBody = Record<string, unknown>;

// translateV2ToGo decide, para cada mensagem/ação, qual rota da Evolution GO é
// chamada, com qual auth (instance vs admin) e qual corpo — é o roteador que
// hoje não tem nenhum teste, apesar de decidir por qual instância cada
// mensagem sai. Cobre os ~60 mapeamentos v2→GO, os 3 gotchas documentados no
// próprio arquivo (webhookUrl nunca vazio em /instance/connect, LID vs
// telefone no toUserJid, contentType text/json em updateParticipant) e os
// casos `invalid` que blindam contra payload incompleto.

// ── Mensagens: shape básico (path, method, auth) ────────────────────────────

Deno.test("sendText mapeia para /send/text com auth de instância", () => {
  const r = translateV2ToGo("/message/sendText/minha-instancia", "POST", { number: "5511999999999", text: "oi" });
  assertEquals(r?.path, "/send/text");
  assertEquals(r?.method, "POST");
  assertEquals(r?.auth, "instance");
  assertEquals((r?.body as GoBody).number, "5511999999999");
  assertEquals((r?.body as GoBody).text, "oi");
});

Deno.test("sendText traduz mentionsEveryOne e mentioned apenas quando presentes", () => {
  const semMencao = translateV2ToGo("/message/sendText/i", "POST", { number: "n", text: "t" });
  assertEquals("mentionAll" in (semMencao?.body as object), false);
  assertEquals("mentionedJid" in (semMencao?.body as object), false);

  const comMencao = translateV2ToGo("/message/sendText/i", "POST", {
    number: "n", text: "t", mentionsEveryOne: true, mentioned: ["5511999999999"],
  });
  assertEquals((comMencao?.body as GoBody).mentionAll, true);
  assertEquals((comMencao?.body as GoBody).mentionedJid, ["5511999999999"]);
});

Deno.test("sendMedia mapeia media→url e mediatype→type", () => {
  const r = translateV2ToGo("/message/sendMedia/i", "POST", {
    number: "n", media: "https://x/img.png", mediatype: "image", caption: "c", fileName: "img.png",
  });
  assertEquals(r?.path, "/send/media");
  assertEquals((r?.body as GoBody).url, "https://x/img.png");
  assertEquals((r?.body as GoBody).type, "image");
  assertEquals((r?.body as GoBody).filename, "img.png");
});

Deno.test("sendWhatsAppAudio força type ptt e aceita audio ou media", () => {
  const viaAudio = translateV2ToGo("/message/sendWhatsAppAudio/i", "POST", { number: "n", audio: "u1" });
  assertEquals(viaAudio?.path, "/send/media");
  assertEquals((viaAudio?.body as GoBody).type, "ptt");
  assertEquals((viaAudio?.body as GoBody).url, "u1");

  const viaMedia = translateV2ToGo("/message/sendWhatsAppAudio/i", "POST", { number: "n", media: "u2" });
  assertEquals((viaMedia?.body as GoBody).url, "u2");
});

Deno.test("sendPtv usa /send/media com type ptv (nota redonda de vídeo)", () => {
  const r = translateV2ToGo("/message/sendPtv/i", "POST", { number: "n", video: "v" });
  assertEquals(r?.path, "/send/media");
  assertEquals((r?.body as GoBody).type, "ptv");
  assertEquals((r?.body as GoBody).url, "v");
});

Deno.test("sendSticker e sendLocation mapeiam campos 1:1", () => {
  const sticker = translateV2ToGo("/message/sendSticker/i", "POST", { number: "n", sticker: "s" });
  assertEquals(sticker?.path, "/send/sticker");
  assertEquals((sticker?.body as GoBody).sticker, "s");

  const loc = translateV2ToGo("/message/sendLocation/i", "POST", {
    number: "n", name: "Loja", address: "Rua X", latitude: -23.5, longitude: -46.6,
  });
  assertEquals(loc?.path, "/send/location");
  assertEquals((loc?.body as GoBody).latitude, -23.5);
});

Deno.test("sendContact monta vcard a partir do primeiro contato do array v2", () => {
  const r = translateV2ToGo("/message/sendContact/i", "POST", {
    number: "n",
    contact: [{ fullName: "Fulano", organization: "ACME", phoneNumber: "5511999999999" }],
  });
  assertEquals(r?.path, "/send/contact");
  assertEquals((r?.body as GoBody).vcard, {
    fullName: "Fulano", organization: "ACME", phone: "5511999999999",
  });
});

Deno.test("sendContact aceita objeto único (não-array) e wuid como fallback de phone", () => {
  const r = translateV2ToGo("/message/sendContact/i", "POST", {
    number: "n", contact: { fullName: "F", wuid: "5511888888888" },
  });
  assertEquals(((r?.body as GoBody).vcard as GoBody).phone, "5511888888888");
});

Deno.test("sendPoll traduz name→question e selectableCount→maxAnswer (default 1)", () => {
  const r = translateV2ToGo("/message/sendPoll/i", "POST", {
    number: "n", name: "Prefere qual?", values: ["A", "B"],
  });
  assertEquals(r?.path, "/send/poll");
  assertEquals((r?.body as GoBody).question, "Prefere qual?");
  assertEquals((r?.body as GoBody).maxAnswer, 1);
  assertEquals((r?.body as GoBody).options, ["A", "B"]);
});

Deno.test("sendList: footer vazio vira espaço (GO rejeita footer='')", () => {
  const semFooter = translateV2ToGo("/message/sendList/i", "POST", {
    number: "n", title: "T", description: "D", buttonText: "Ver", sections: [],
  });
  assertEquals((semFooter?.body as GoBody).footerText, " ");

  const comFooter = translateV2ToGo("/message/sendList/i", "POST", {
    number: "n", title: "T", description: "D", buttonText: "Ver", sections: [], footer: "Rodapé",
  });
  assertEquals((comFooter?.body as GoBody).footerText, "Rodapé");
});

Deno.test("sendButtons preserva o corpo v2 e também blinda footer vazio", () => {
  const r = translateV2ToGo("/message/sendButtons/i", "POST", { number: "n", buttons: [] });
  assertEquals(r?.path, "/send/button");
  assertEquals((r?.body as GoBody).footer, " ");
});

Deno.test("sendStatus infere text vs media pelo conteúdo quando type ausente", () => {
  const texto = translateV2ToGo("/message/sendStatus/i", "POST", { content: "bom dia" });
  assertEquals(texto?.path, "/send/status/text");
  assertEquals((texto?.body as GoBody).text, "bom dia");

  const midia = translateV2ToGo("/message/sendStatus/i", "POST", { content: "https://x/img.png", type: "image" });
  assertEquals(midia?.path, "/send/status/media");
  assertEquals((midia?.body as GoBody).url, "https://x/img.png");
});

// ── sendReaction / delete / update / markMessageAsRead: casos invalid ───────

Deno.test("sendReaction exige key.remoteJid e key.id — payload incompleto vira invalid", () => {
  const semKey = translateV2ToGo("/message/sendReaction/i", "POST", { reaction: "👍" });
  assert(semKey?.invalid, "esperava invalid quando falta key");

  const completo = translateV2ToGo("/message/sendReaction/i", "POST", {
    reaction: "👍", key: { remoteJid: "5511999999999@s.whatsapp.net", id: "MSG1", fromMe: true },
  });
  assertEquals(completo?.invalid, undefined);
  assertEquals(completo?.path, "/message/react");
  assertEquals((completo?.body as GoBody).number, "5511999999999@s.whatsapp.net");
  assertEquals((completo?.body as GoBody).id, "MSG1");
  assertEquals((completo?.body as GoBody).fromMe, true);
});

Deno.test("delete e deleteMessageForEveryone mapeiam remoteJid/id → chat/messageId", () => {
  const r = translateV2ToGo("/message/delete/i", "POST", { remoteJid: "jid1", id: "m1" });
  assertEquals(r?.path, "/message/delete");
  assertEquals((r?.body as GoBody).chat, "jid1");
  assertEquals((r?.body as GoBody).messageId, "m1");
});

Deno.test("update e chat/updateMessage convergem para /message/edit", () => {
  const viaUpdate = translateV2ToGo("/message/update/i", "POST", {
    key: { remoteJid: "jid1", id: "m1" }, text: "novo texto",
  });
  assertEquals(viaUpdate?.path, "/message/edit");
  assertEquals((viaUpdate?.body as GoBody).chat, "jid1");
  assertEquals((viaUpdate?.body as GoBody).message, "novo texto");
  assertEquals((viaUpdate?.body as GoBody).messageId, "m1");
});

Deno.test("markMessageAsRead exige readMessages[0].remoteJid — sem isso vira invalid", () => {
  const vazio = translateV2ToGo("/chat/markMessageAsRead/i", "POST", { readMessages: [] });
  assert(vazio?.invalid);

  const ok = translateV2ToGo("/chat/markMessageAsRead/i", "POST", {
    readMessages: [{ id: "m1", remoteJid: "5511999999999:5@s.whatsapp.net" }],
  });
  assertEquals(ok?.invalid, undefined);
  assertEquals(ok?.path, "/message/markread");
  // jidWithoutDevice remove só o sufixo :N, preservando o domínio
  assertEquals((ok?.body as GoBody).number, "5511999999999@s.whatsapp.net");
  assertEquals((ok?.body as GoBody).id, ["m1"]);
});

// ── toUserJid: LID (>=14 dígitos) vs telefone real ──────────────────────────

Deno.test("fetchProfilePictureUrl usa @lid para números longos e @s.whatsapp.net para telefone", () => {
  const lid = translateV2ToGo("/chat/fetchProfilePictureUrl/i", "POST", { number: "123456789012345" });
  assertEquals((lid?.body as GoBody).number, "123456789012345@lid");

  const telefone = translateV2ToGo("/chat/fetchProfilePictureUrl/i", "POST", { number: "5511999999999" });
  assertEquals((telefone?.body as GoBody).number, "5511999999999@s.whatsapp.net");
});

Deno.test("toUserJid preserva número que já vem com domínio (@g.us, @lid)", () => {
  const r = translateV2ToGo("/chat/fetchProfilePictureUrl/i", "POST", { number: "12345@g.us" });
  assertEquals((r?.body as GoBody).number, "12345@g.us");
});

Deno.test("fetchProfile mapeia array de números (ou número único) via toUserJid", () => {
  const r = translateV2ToGo("/chat/fetchProfile/i", "POST", { number: ["5511999999999", "123456789012345"] });
  assertEquals(r?.path, "/user/info");
  assertEquals((r?.body as GoBody).number, ["5511999999999@s.whatsapp.net", "123456789012345@lid"]);
});

// ── Presença, bloqueio, arquivar, contatos ──────────────────────────────────

Deno.test("updatePresence/sendPresence: recording vira composing+isAudio", () => {
  const r = translateV2ToGo("/chat/updatePresence/i", "POST", { number: "n", presence: "recording", delay: 500 });
  assertEquals(r?.path, "/message/presence");
  assertEquals((r?.body as GoBody).state, "composing");
  assertEquals((r?.body as GoBody).isAudio, true);
  assertEquals((r?.body as GoBody).delay, 500);
});

Deno.test("updateBlockStatus alterna /user/block e /user/unblock pelo campo status", () => {
  const bloquear = translateV2ToGo("/chat/updateBlockStatus/i", "POST", { number: "n", status: "block" });
  assertEquals(bloquear?.path, "/user/block");
  const desbloquear = translateV2ToGo("/chat/updateBlockStatus/i", "POST", { number: "n", status: "unblock" });
  assertEquals(desbloquear?.path, "/user/unblock");
});

Deno.test("archiveChat (chat ou message) alterna archive/unarchive pelo campo archive", () => {
  const arquivar = translateV2ToGo("/chat/archiveChat/i", "POST", { chat: "jid1", archive: true });
  assertEquals(arquivar?.path, "/chat/archive");
  const desarquivar = translateV2ToGo("/message/archiveChat/i", "POST", { chat: "jid1", archive: false });
  assertEquals(desarquivar?.path, "/chat/unarchive");
});

Deno.test("findContacts é GET sem corpo", () => {
  const r = translateV2ToGo("/chat/findContacts/i", "GET", {});
  assertEquals(r?.path, "/user/contacts");
  assertEquals(r?.method, "GET");
});

// ── Instância: create, connect (webhookUrl nunca vazio), status, qr ─────────

Deno.test("instance/create usa instanceName→name e gera token quando ausente é responsabilidade do caller (não do tradutor)", () => {
  const r = translateV2ToGo("/instance/create", "POST", { instanceName: "nova", token: "tok123" });
  assertEquals(r?.auth, "admin");
  assertEquals((r?.body as GoBody).name, "nova");
  assertEquals((r?.body as GoBody).token, "tok123");
});

Deno.test("instance/connect NUNCA vai com body vazio — sempre subscribe:['ALL'] e immediate:true", () => {
  const r = translateV2ToGo("/instance/connect/minha-instancia", "POST", {});
  assertEquals(r?.path, "/instance/connect");
  assertEquals(r?.auth, "instance");
  assertEquals((r?.body as GoBody).subscribe, ["ALL"]);
  assertEquals((r?.body as GoBody).immediate, true);
  // body nunca é {} — regressão que apagaria o webhook da instância na GO
  assert(Object.keys(r?.body as object).length > 0, "connect não pode ir com body vazio");
});

Deno.test("connectionState/fetchInstances/qr/restart/logout mapeiam para as rotas GO corretas", () => {
  assertEquals(translateV2ToGo("/instance/connectionState/i", "GET", {})?.path, "/instance/status");
  assertEquals(translateV2ToGo("/instance/fetchInstances", "GET", {})?.auth, "admin");
  assertEquals(translateV2ToGo("/instance/restart/i", "POST", {})?.path, "/instance/reconnect");
  assertEquals(translateV2ToGo("/instance/logout/i", "DELETE", {})?.path, "/instance/logout");
  assertEquals(translateV2ToGo("/instance/qrcode/i", "GET", {})?.path, "/instance/qr");
  assertEquals(translateV2ToGo("/instance/qr", "GET", {})?.path, "/instance/qr");
});

Deno.test("chat/whatsappNumbers vira /user/check com o array numbers", () => {
  const r = translateV2ToGo("/chat/whatsappNumbers/i", "POST", { numbers: ["5511999999999"] });
  assertEquals(r?.path, "/user/check");
  assertEquals((r?.body as GoBody).number, ["5511999999999"]);
});

// ── Grupos ───────────────────────────────────────────────────────────────────

Deno.test("group/create mapeia subject→groupName", () => {
  const r = translateV2ToGo("/group/create/i", "POST", { subject: "Time Vendas", participants: ["a", "b"] });
  assertEquals(r?.path, "/group/create");
  assertEquals((r?.body as GoBody).groupName, "Time Vendas");
});

Deno.test("fetchAllGroups usa /group/list (não /group/myall, que está quebrado no GO)", () => {
  const r = translateV2ToGo("/group/fetchAllGroups/i", "GET", {});
  assertEquals(r?.path, "/group/list");
});

Deno.test("updateParticipant vai com contentType text/json (contorna o jid_validation_middleware)", () => {
  const r = translateV2ToGo("/group/updateParticipant/i", "POST", {
    groupJid: "g1", action: "add", participants: ["5511999999999"],
  });
  assertEquals(r?.path, "/group/participant");
  assertEquals(r?.contentType, "text/json");
  assertEquals((r?.body as GoBody).participants, ["5511999999999"]);
});

Deno.test("inviteCode/revokeInviteCode alternam o campo reset", () => {
  const gerar = translateV2ToGo("/group/inviteCode/i", "POST", { groupJid: "g1" });
  assertEquals((gerar?.body as GoBody).reset, false);
  const revogar = translateV2ToGo("/group/revokeInviteCode/i", "POST", { groupJid: "g1" });
  assertEquals((revogar?.body as GoBody).reset, true);
});

Deno.test("acceptInviteCode aceita o código do body ou da query string", () => {
  const viaBody = translateV2ToGo("/group/acceptInviteCode/i", "POST", { inviteCode: "ABC" });
  assertEquals((viaBody?.body as GoBody).code, "ABC");
  const viaQuery = translateV2ToGo("/group/acceptInviteCode/i?inviteCode=XYZ", "POST", {});
  assertEquals((viaQuery?.body as GoBody).code, "XYZ");
});

// ── Perfil e labels ──────────────────────────────────────────────────────────

Deno.test("removeProfilePicture manda image vazio (não uma rota separada de delete)", () => {
  const r = translateV2ToGo("/profile/removeProfilePicture/i", "POST", {});
  assertEquals(r?.path, "/user/profilePicture");
  assertEquals((r?.body as GoBody).image, "");
});

Deno.test("updatePrivacySettings só inclui os campos v2 presentes, traduzidos para camelCase", () => {
  const r = translateV2ToGo("/profile/updatePrivacySettings/i", "POST", { readreceipts: "all", last: "contacts" });
  assertEquals((r?.body as GoBody).readReceipts, "all");
  assertEquals((r?.body as GoBody).lastSeen, "contacts");
  assertEquals("profile" in (r?.body as object), false);
});

Deno.test("handleLabel exige number — sem ele vira invalid; action=remove usa /unlabel/chat", () => {
  const semNumero = translateV2ToGo("/label/handleLabel/i", "POST", { labelId: "l1" });
  assert(semNumero?.invalid);

  const adicionar = translateV2ToGo("/label/handleLabel/i", "POST", { number: "5511999999999", labelId: "l1" });
  assertEquals(adicionar?.path, "/label/chat");
  assertEquals((adicionar?.body as GoBody).jid, "5511999999999@s.whatsapp.net");

  const remover = translateV2ToGo("/label/handleLabel/i", "POST", { number: "5511999999999", labelId: "l1", action: "remove" });
  assertEquals(remover?.path, "/unlabel/chat");
});

Deno.test("findLabels é GET simples para /label/list", () => {
  const r = translateV2ToGo("/label/findLabels/i", "GET", {});
  assertEquals(r?.path, "/label/list");
  assertEquals(r?.method, "GET");
});

// ── Webhook por instância ────────────────────────────────────────────────────

Deno.test("webhook/set reconecta com o webhookUrl novo (GO não tem endpoint de config separado)", () => {
  const r = translateV2ToGo("/webhook/set/i", "POST", { url: "https://x/webhook" });
  assertEquals(r?.path, "/instance/connect");
  assertEquals((r?.body as GoBody).webhookUrl, "https://x/webhook");
  assertEquals((r?.body as GoBody).subscribe, ["ALL"]);
});

// ── Rotas não mapeadas passam intactas (null) ───────────────────────────────

Deno.test("rotas v2 sem equivalente no GO retornam null (passam intactas, GO responde 404)", () => {
  for (const path of [
    "/chat/findChats/i", "/chat/findMessages/i", "/webhook/find/i",
    "/chat/markMessageAsUnread/i", "/message/sendTemplate/i", "/instance/setPresence/i",
    "/settings/set/i", "/settings/find/i", "/group/inviteInfo/i", "/chat/toggleEphemeral/i",
    "/call/offerCall/i", "/chatwoot/set/i", "/typebot/set/i", "/openai/set/i",
  ]) {
    assertEquals(translateV2ToGo(path, "POST", {}), null, `esperava null (não mapeada) para ${path}`);
  }
});
