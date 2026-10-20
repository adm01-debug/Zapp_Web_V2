import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { attributeMultiplixReply, attributeTalkXReply } from "../talkx-reply.ts";

// ── X028: resposta do contato atribuída pela RPC do banco ────────────────────
// Estes testes travam o CONTRATO da chamada, não o SQL: o harness de banco
// (X027) prova a atribuição de verdade. Aqui o que importa é que a edge chame a
// RPC `attribute_talkx_reply` com os nomes de parâmetro certos — mandar um
// parâmetro inexistente faria o supabase-js falhar silenciosamente (a chamada
// era fire-and-forget e ninguém via).
//
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockRpc(result: { data?: any; error?: any }): { supabase: any; calls: Array<{ fn: string; args: any }> } {
  const calls: Array<{ fn: string; args: unknown }> = [];
  const supabase = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return { data: result.data ?? null, error: result.error ?? null };
    },
  };
  return { supabase, calls };
}

Deno.test("X028: attributeTalkXReply chama attribute_talkx_reply com p_contact_id, p_phone e p_message_id", async () => {
  const m = mockRpc({
    data: { attributed: true, attribution: "phone", recipient_id: "r1", campaign_id: "c1" },
  });
  await attributeTalkXReply(m.supabase, "contact-1", "5500000000000", "msg-1");

  assertEquals(m.calls.length, 1);
  assertEquals(m.calls[0].fn, "attribute_talkx_reply");
  assertEquals(m.calls[0].args.p_contact_id, "contact-1");
  assertEquals(m.calls[0].args.p_phone, "5500000000000");
  assertEquals(m.calls[0].args.p_message_id, "msg-1");
});

Deno.test("X028: sem destinatario na janela a RPC responde attributed=false e nada quebra", async () => {
  const m = mockRpc({ data: { attributed: false, attribution: null, reason: "no_recipient_in_window" } });
  await attributeTalkXReply(m.supabase, "contact-2", null, "msg-2");

  assertEquals(m.calls.length, 1);
  assertEquals(m.calls[0].args.p_phone, null);
});

Deno.test("X028: erro da RPC não propaga (a resposta do contato não pode falhar por isso)", async () => {
  const m = mockRpc({ error: { message: "service_role_required" } });
  // não deve lançar: o webhook segue processando a mensagem do contato
  await attributeTalkXReply(m.supabase, "contact-3", "5500000000000", "msg-3");

  assertEquals(m.calls.length, 1);
});

// ── F62: resposta do contato correlacionada ao item do Multiplix ──────────────

Deno.test("F62: attributeMultiplixReply chama a RPC com p_phone (não p_contact_id)", async () => {
  const m = mockRpc({ data: { attributed: true, attribution: "inferred", item_id: "i1" } });
  await attributeMultiplixReply(m.supabase, "5511999990620", "msg-1");

  assertEquals(m.calls.length, 1);
  assertEquals(m.calls[0].fn, "attribute_multiplix_item_reply");
  assertEquals(m.calls[0].args.p_phone, "5511999990620");
  assertEquals(m.calls[0].args.p_message_id, "msg-1");
  assertEquals(m.calls[0].args.p_quoted_external_id, null);
  // a assinatura da RPC não tem contact_id: mandá-lo seria erro silencioso
  assertEquals("p_contact_id" in m.calls[0].args, false);
});

Deno.test("F62: a citação (external_id) é repassada para permitir atribuição `linked`", async () => {
  const m = mockRpc({ data: { attributed: true, attribution: "linked", item_id: "i2" } });
  await attributeMultiplixReply(m.supabase, "5511999990620", "msg-2", "EXT-LINKED");

  assertEquals(m.calls[0].args.p_quoted_external_id, "EXT-LINKED");
});

Deno.test("F62: resposta de contato que não casou item não é erro nem loga atribuição", async () => {
  const m = mockRpc({ data: { attributed: false, attribution: null, reason: "no_item_in_window" } });
  await attributeMultiplixReply(m.supabase, "5511999990620", "msg-3");

  assertEquals(m.calls.length, 1);
});

Deno.test("F62: erro da RPC não propaga (fire-and-forget no webhook)", async () => {
  const m = mockRpc({ error: { message: "service_role_required" } });
  // não deve lançar: o webhook segue processando a mensagem do contato
  await attributeMultiplixReply(m.supabase, "5511999990620", "msg-4");
  assertEquals(m.calls.length, 1);
});
