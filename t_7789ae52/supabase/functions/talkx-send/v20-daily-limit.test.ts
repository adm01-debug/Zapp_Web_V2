import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleTalkxSend } from "./index.ts";
import {
  CAMPAIGN_ID, TEST_SERVICE_KEY, makeCampaign, makeConnection, makePost,
  makeRecipient, mockGlobalFetch, setDispatchEnv, thenableQB,
} from "./_test-utils.ts";

// QB que devolve OBJETO para maybeSingle()/single() e ARRAY para o await direto —
// espelha o uso real de talkx_campaigns (fetch inicial via maybeSingle + contagem
// da conexão via select().eq() sem single()).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dualQB(singleResult: any, arrayResult: any): any {
  const p = Promise.resolve(arrayResult);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const self: any = {
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j),
    catch: (f: (e: unknown) => unknown) => p.catch(f),
    single: () => Promise.resolve(singleResult),
    maybeSingle: () => Promise.resolve(singleResult),
  };
  for (const m of ["select", "eq", "neq", "in", "or", "order", "range", "limit", "is", "not", "update", "insert", "upsert", "delete", "gte", "gt", "lte", "lt"]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any)[m] = () => self;
  }
  return self;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function recipientsQB(): any {
  // select("id", { count: "exact", head: true }) → contagem; senão → lista pendente.
  return {
    select(_sel: string, opts?: { count?: string }) {
      const result: { data: unknown; error: unknown; count?: number } = opts?.count
        ? { data: [], error: null, count: 3 } // 3 já enviados hoje
        : { data: [makeRecipient()], error: null }; // 1 pendente (entra no loop)
      return thenableQB(result);
    },
  };
}

Deno.test("V20: daily_limit=3 já atingido → pausa com daily_limit (sem 4º envio)", async () => {
  setDispatchEnv();
  const restore = mockGlobalFetch(); // provider responde 200
  const pauseReasons: string[] = [];
  const campaign = makeCampaign({ business_hours_only: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deps: any = {
    serviceKey: TEST_SERVICE_KEY,
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: new Error("") }) },
      rpc(name: string, args?: Record<string, unknown>) {
        if (name === "transition_talkx_campaign") {
          pauseReasons.push(String(args?.p_pause_reason ?? ""));
          return Promise.resolve({ data: [{ current_status: "paused" }], error: null });
        }
        if (name === "claim_talkx_recipient") return Promise.resolve({ data: [{ claim_token: "tok" }], error: null });
        if (name === "talkx_recipient_is_suppressed") return Promise.resolve({ data: false, error: null });
        if (name === "persist_talkx_recipient_message_snapshot") return Promise.resolve({
          data: [{ personalized_message: "Oi", media_url_snapshot: null, media_type_snapshot: null }], error: null,
        });
        if (name === "mark_talkx_recipient_dispatch_started") return Promise.resolve({ data: null, error: null });
        if (name === "record_talkx_recipient_sent") return Promise.resolve({ data: null, error: null });
        if (name === "complete_talkx_recipient") return Promise.resolve({ data: null, error: null });
        if (name === "complete_talkx_campaign_if_drained") return Promise.resolve({ data: true, error: null });
        if (name === "reschedule_talkx_recipient") return Promise.resolve({ data: null, error: null });
        if (name === "release_talkx_recipient_claim") return Promise.resolve({ data: true, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      from(table: string) {
        if (table === "talkx_settings") {
          return thenableQB({ data: [{ key: "daily_limit_per_connection", value: "3" }], error: null });
        }
        if (table === "talkx_campaigns") {
          return dualQB({ data: campaign, error: null }, { data: [campaign], error: null });
        }
        if (table === "talkx_recipients") return recipientsQB();
        if (table === "whatsapp_connections") return thenableQB({ data: makeConnection(), error: null });
        return thenableQB({ data: null, error: null });
      },
    },
  };

  try {
    const req = makePost({ bearer: TEST_SERVICE_KEY, body: { action: "start", campaignId: CAMPAIGN_ID } });
    const res = await handleTalkxSend(req, deps);
    assertEquals(res.status, 200);
    assertEquals(pauseReasons.includes("daily_limit"), true, `esperado pause daily_limit, recebido: ${JSON.stringify(pauseReasons)}`);
  } finally {
    restore();
  }
});
