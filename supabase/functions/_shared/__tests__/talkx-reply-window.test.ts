import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { attributeMultiplixReply, attributeTalkXReply, __resetReplyWindowCache } from "../talkx-reply.ts";

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockSupabase(windowValue: string): { supabase: any; state: { cutoff: string | null; updated: boolean } } {
  const state = { cutoff: null as string | null, updated: false };
  const supabase = {
    from: (table: string) => {
      if (table === "talkx_settings") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { value: windowValue } }) }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            gte: (_col: string, cutoff: string) => {
              state.cutoff = cutoff;
              return {
                is: () => ({
                  not: () => ({
                    order: () => ({
                      limit: () => ({
                        maybeSingle: async () => ({ data: { id: "r1", campaign_id: "c1" } }),
                      }),
                    }),
                  }),
                }),
              };
            },
          }),
        }),
        update: () => ({
          eq: () => ({ is: async () => { state.updated = true; return { error: null }; } }),
        }),
      };
    },
  };
  return { supabase, state };
}

Deno.test("V18: reply_window_hours muda a janela de atribuição (48h vs 72h)", async () => {
  __resetReplyWindowCache();
  const a = mockSupabase("48");
  await attributeTalkXReply(a.supabase, "contact-1", "msg-1");

  __resetReplyWindowCache();
  const b = mockSupabase("72");
  await attributeTalkXReply(b.supabase, "contact-1", "msg-1");

  // cutoff de 72h precisa ser mais antigo que o de 48h.
  assertEquals(new Date(b.state.cutoff!).getTime() < new Date(a.state.cutoff!).getTime(), true);
  assertEquals(a.state.updated, true);
  assertEquals(b.state.updated, true);
});

// ── F62: resposta do contato correlacionada ao item do Multiplix ──────────────
// Estes testes travam o CONTRATO da chamada, não o SQL: o harness de banco
// (multiplix-delivery-leases.test.sh) prova a atribuição de verdade. Aqui o que
// importa é que o edge chame a RPC com os nomes de parâmetro certos — o modo de
// falha real é mandar `p_contact_id`, que não existe na assinatura, e o
// supabase-js falhar sem ninguém ver (a chamada é fire-and-forget).

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
