import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { inferGoReceiptFromMe, splitGoJid, translateGoPayload } from "../evolution-go-adapter.ts";
import { translateV2ToGo } from "../evolution-go-routes.ts";

// Auditoria Conversas 13/11 — P1-GO-1..4. Payloads no formato que a Evolution GO
// (whatsmeow) serializa: o evento `events.Receipt` inteiro em `data`, com
// MessageSource (Chat/Sender/IsFromMe/IsGroup/SenderAlt/RecipientAlt) e Type.
// Números anonimizados.

type GoBody = Record<string, unknown>;
type Update = { key: { id: string; remoteJid?: string; fromMe: boolean }; status: string };

const CONTATO = "5511900000001@s.whatsapp.net";
const NOSSO = "5511900000099@s.whatsapp.net";

function receipt(state: string, data: Record<string, unknown>) {
  return {
    event: "Receipt",
    instanceName: "inst-go-anon",
    instanceId: "00000000-0000-0000-0000-000000000000",
    state,
    data: {
      IsGroup: false,
      AddressingMode: "",
      BroadcastListOwner: "",
      MessageIDs: ["3EB0ANON0001"],
      Timestamp: "2026-11-13T10:00:00-03:00",
      MessageSender: "",
      ...data,
    },
  };
}

function updates(payload: Record<string, unknown>): Update[] {
  const out = translateGoPayload(payload);
  assertEquals(out.event, "messages.update");
  return (out.data as { updates: Update[] }).updates;
}

// ── P1-GO-1: recibos de entregue/lido ───────────────────────────────────────

Deno.test("P1-GO-1: lido no WhatsApp Web do contato (Sender com sufixo de aparelho) é recibo NOSSO", () => {
  const [u] = updates(receipt("Read", { Chat: CONTATO, Sender: "5511900000001:12@s.whatsapp.net", Type: "read" }));
  assertEquals(u.key.fromMe, true);
  assertEquals(u.status, "READ");
  assertEquals(u.key.remoteJid, CONTATO);
});

Deno.test("P1-GO-1: recibo com Sender em @lid e o telefone em SenderAlt é recibo NOSSO", () => {
  const [u] = updates(receipt("Delivered", {
    Chat: CONTATO, Sender: "123456789012345@lid", SenderAlt: CONTATO, Type: "",
  }));
  assertEquals(u.key.fromMe, true);
  assertEquals(u.status, "DELIVERY_ACK");
});

Deno.test("P1-GO-1: IsFromMe=false (recibo vindo do contato) decide mesmo sem casar os JIDs", () => {
  const [u] = updates(receipt("Delivered", {
    Chat: CONTATO, Sender: "999999999999999@lid", IsFromMe: false, Type: "",
  }));
  assertEquals(u.key.fromMe, true);
});

Deno.test("P1-GO-1: read-self (li no meu celular a mensagem do contato) NUNCA é recibo nosso", () => {
  const [u] = updates(receipt("Read", { Chat: CONTATO, Sender: NOSSO, IsFromMe: true, Type: "read-self" }));
  assertEquals(u.key.fromMe, false);
  assertEquals(u.status, "READ");
});

Deno.test("P1-GO-1: read-self sem IsFromMe e com Sender igual ao Chat continua não sendo nosso", () => {
  assertEquals(inferGoReceiptFromMe({ Chat: CONTATO, Sender: CONTATO, Type: "read-self" }, "Read"), false);
});

Deno.test("P1-GO-1: recibo de participante em grupo é de mensagem nossa", () => {
  const [u] = updates(receipt("Read", {
    Chat: "120363000000000000@g.us", Sender: "5511900000002:3@s.whatsapp.net", IsGroup: true, Type: "read",
  }));
  assertEquals(u.key.fromMe, true);
});

Deno.test("P1-GO-1: sem IsFromMe e com pessoas diferentes segue inbound (comportamento antigo preservado)", () => {
  assertEquals(inferGoReceiptFromMe({ Chat: CONTATO, Sender: "5511900000003@s.whatsapp.net" }, "Delivered"), false);
});

Deno.test("P1-GO-1: @lid e telefone com o mesmo número NÃO são tratados como a mesma pessoa", () => {
  assertEquals(inferGoReceiptFromMe({ Chat: "5511900000001@lid", Sender: CONTATO }, "Read"), false);
});

Deno.test("splitGoJid tira aparelho/agente e normaliza @c.us", () => {
  assertEquals(splitGoJid("5511900000001:12@s.whatsapp.net"), { user: "5511900000001", server: "s.whatsapp.net" });
  assertEquals(splitGoJid("5511900000001@c.us"), { user: "5511900000001", server: "s.whatsapp.net" });
  assertEquals(splitGoJid("123456789012345@lid"), { user: "123456789012345", server: "lid" });
  assertEquals(splitGoJid(undefined), undefined);
});

// ── P1-GO-2: editar mensagem ────────────────────────────────────────────────

Deno.test("P1-GO-2: edição no formato da tela ({number, messageId}) chega à GO com messageId", () => {
  const r = translateV2ToGo("/chat/updateMessage/i", "PUT", {
    number: "5511900000001:4@s.whatsapp.net", messageId: "3EB0EDIT", text: "texto novo",
  });
  assertEquals(r?.invalid, undefined);
  assertEquals(r?.path, "/message/edit");
  assertEquals(r?.body as GoBody, { chat: CONTATO, message: "texto novo", messageId: "3EB0EDIT" });
});

Deno.test("P1-GO-2: edição no formato v2 (key) continua funcionando e sem id vira invalid", () => {
  const v2 = translateV2ToGo("/chat/updateMessage/i", "PUT", { key: { remoteJid: CONTATO, id: "3EB0K" }, text: "t" });
  assertEquals((v2?.body as GoBody).messageId, "3EB0K");
  const semId = translateV2ToGo("/chat/updateMessage/i", "PUT", { number: CONTATO, text: "t" });
  assert(semId?.invalid, "sem messageId a GO responderia 400 — falha explícita antes");
});

// ── P1-GO-3: remover reação ─────────────────────────────────────────────────

Deno.test("P1-GO-3: remover reação (reaction '') vira 'remove' na GO", () => {
  const r = translateV2ToGo("/message/sendReaction/i", "POST", {
    reaction: "", key: { remoteJid: CONTATO, id: "3EB0R", fromMe: false },
  });
  assertEquals((r?.body as GoBody).reaction, "remove");
  const reagir = translateV2ToGo("/message/sendReaction/i", "POST", {
    reaction: "👍", key: { remoteJid: CONTATO, id: "3EB0R" },
  });
  assertEquals((reagir?.body as GoBody).reaction, "👍");
});

// ── P1-GO-4: botões/lista sem cabeçalho e localização sem nome/endereço ────

Deno.test("P1-GO-4: botões sem cabeçalho recebem title válido (GO: 'title is required')", () => {
  const r = translateV2ToGo("/message/sendButtons/i", "POST", {
    number: "5511900000001", description: "Escolha", buttons: [{ type: "reply", displayText: "Sim", id: "s" }],
  });
  assertEquals((r?.body as GoBody).title, " ");
  assertEquals((r?.body as GoBody).description, "Escolha");
  const semCorpo = translateV2ToGo("/message/sendButtons/i", "POST", { number: "n", buttons: [] });
  assertEquals((semCorpo?.body as GoBody).description, " ", "GO exige description");
  const comTitulo = translateV2ToGo("/message/sendButtons/i", "POST", { number: "n", title: "Oferta", buttons: [] });
  assertEquals((comTitulo?.body as GoBody).title, "Oferta");
});

Deno.test("P1-GO-4: lista sem cabeçalho recebe title válido", () => {
  const r = translateV2ToGo("/message/sendList/i", "POST", {
    number: "n", description: "Corpo", buttonText: "Ver", sections: [{ title: "S", rows: [] }],
  });
  assertEquals((r?.body as GoBody).title, " ");
});

Deno.test("P1-GO-4: localização sem nome/endereço recebe defaults em vez de 400", () => {
  const r = translateV2ToGo("/message/sendLocation/i", "POST", { number: "n", latitude: -23.55, longitude: -46.63 });
  assertEquals(r?.invalid, undefined);
  assertEquals((r?.body as GoBody).name, "Localização");
  assertEquals((r?.body as GoBody).address, "-23.55, -46.63");
  assertEquals((r?.body as GoBody).latitude, -23.55);

  const completa = translateV2ToGo("/message/sendLocation/i", "POST", {
    number: "n", name: "Loja", address: "Rua X, 10", latitude: 1, longitude: 2,
  });
  assertEquals((completa?.body as GoBody).name, "Loja");
  assertEquals((completa?.body as GoBody).address, "Rua X, 10");
});

Deno.test("P1-GO-4: latitude/longitude em string viram número (bind float64 da GO)", () => {
  const r = translateV2ToGo("/message/sendLocation/i", "POST", { number: "n", latitude: "-23.55", longitude: "-46.63" });
  assertEquals((r?.body as GoBody).latitude, -23.55);
  assertEquals((r?.body as GoBody).longitude, -46.63);
  assertEquals((r?.body as GoBody).address, "-23.55, -46.63");
});
