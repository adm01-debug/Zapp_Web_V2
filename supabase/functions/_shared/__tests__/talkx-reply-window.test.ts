import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { attributeTalkXReply, __resetReplyWindowCache } from "../talkx-reply.ts";

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
