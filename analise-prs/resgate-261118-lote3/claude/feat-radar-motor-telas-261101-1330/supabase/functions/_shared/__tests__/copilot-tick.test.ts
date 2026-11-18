/**
 * Copiloto RADAR — handler `copilot.tick` (CV-021–045).
 * Cliente Supabase falso em memória: só o encadeamento que o handler usa.
 */
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildSessionPatch,
  type CopilotGenerate,
  CopilotTickError,
  detectKeyMoments,
  handleCopilotTick,
  type SessionRow,
  shouldUseTier2,
  type TickMessage,
} from "../copilot-tick.ts";

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function fakeSupabase(db: { session: Row | null; messages: Row[]; staleUpdate?: boolean }) {
  const writes = { updates: [] as Row[], inserts: [] as Row[] };
  // deno-lint-ignore no-explicit-any
   
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = {
    from(table: string) {
      const f: { op: string; payload?: Row; filters: Array<(r: Row) => boolean>; asc: boolean; limit: number } = {
        op: "select", filters: [], asc: true, limit: 1000,
      };
      // deno-lint-ignore no-explicit-any
       
   
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select: () => q,
        update: (p: Row) => { f.op = "update"; f.payload = p; return q; },
        insert: (p: Row | Row[]) => {
          writes.inserts.push(...(Array.isArray(p) ? p : [p]).map((r) => ({ table, ...r })));
          return Promise.resolve({ error: null });
        },
        eq: (c: string, v: unknown) => { f.filters.push((r) => r[c] === v); return q; },
        in: (c: string, v: unknown[]) => { f.filters.push((r) => v.includes(r[c])); return q; },
        gt: (c: string, v: string) => { f.filters.push((r) => r[c] > v); return q; },
        lte: (c: string, v: string) => { f.filters.push((r) => r[c] <= v); return q; },
        order: (_c: string, o: { ascending: boolean }) => { f.asc = o.ascending; return q; },
        limit: (n: number) => { f.limit = n; return q; },
        maybeSingle: () => Promise.resolve({ data: db.session, error: null }),
        then: (res: (v: unknown) => void) => {
          if (f.op === "update") {
            writes.updates.push(f.payload!);
            res({ data: db.staleUpdate ? [] : [{ id: db.session?.id }], error: null });
            return;
          }
          const rows = db.messages
            .filter((r) => f.filters.every((fn) => fn(r)))
            .sort((a, b) => (f.asc ? 1 : -1) * a.created_at.localeCompare(b.created_at))
            .slice(0, f.limit);
          res({ data: rows, error: null });
        },
      };
      return q;
    },
  };
  return { client, writes };
}

const SESSION: SessionRow = {
  id: "s1", contact_id: "c1", profile_id: "u1", sale_stage: "qualificando", temperature: 40, state_version: 3,
  last_processed_message_at: "2026-10-30T10:00:00Z",
  brinde_budget: null, brinde_responsible: "Ana", brinde_intention: null, brinde_quantity: null,
  brinde_deadline: null, brinde_delivery: null, brinde_evidence: { responsible: "sou a Ana do RH" },
};

const MSGS: Row[] = [
  { id: "m0", contact_id: "c1", sender: "contact", content: "oi", created_at: "2026-10-30T09:59:00Z" },
  { id: "m1", contact_id: "c1", sender: "contact", content: "Quanto custa 300 canecas?", created_at: "2026-10-30T10:01:00Z" },
  { id: "m2", contact_id: "c1", sender: "agent", content: "Já te passo", created_at: "2026-10-30T10:02:00Z" },
];

const TIER1 = {
  sale_stage: "apresentando", temperature: 65, brinde: { quantity: 300, intention: "brinde de fim de ano" },
  key_moments: ["price_request"], risks: ["comparando fornecedores"], next_action: "Enviar faixa de preço para 300 un.",
};
const TIER2 = {
  suggestions: [
    { path: "avancar", text: "Para 300 canecas fica entre R$ X e R$ Y. Fecho a arte hoje?" },
    { path: "descobrir", text: "Qual o prazo do evento?", sources: [{ text: "300 canecas", letter: "N" }] },
    { path: "relacionar", text: "Fim de ano é corrido mesmo, cuido de tudo pra você." },
  ],
};

function gerador(respostas: Record<string, Row | null>) {
  const chamadas: string[] = [];
  const generate: CopilotGenerate = (p) => {
    chamadas.push(p.purpose);
    const obj = respostas[p.purpose] ?? null;
    const data = obj !== null
      ? { choices: [{ message: { content: JSON.stringify(obj) } }] }
      : null;
    return Promise.resolve({ ok: obj !== null, data, model: `m-${p.purpose}` });
  };
  return { generate, chamadas };
}

const INPUT = { job: { id: "j1", attemptCount: 1 }, payload: { session_id: "s1", contact_id: "c1", profile_id: "u1" } };

Deno.test("capacidade desligada: não chama o provedor nem grava", async () => {
  const { client, writes } = fakeSupabase({ session: SESSION, messages: MSGS });
  const g = gerador({ analysis: TIER1 });
  const r = await handleCopilotTick(INPUT, { supabase: client, generate: g.generate, readFlag: () => Promise.resolve(false) });
  assertEquals(r.result.skipped, "capability_disabled");
  assertEquals(g.chamadas, []);
  assertEquals(writes.updates.length + writes.inserts.length, 0);
});

Deno.test("leitura da capacidade falhou: fecha (não gasta)", async () => {
  const { client } = fakeSupabase({ session: SESSION, messages: MSGS });
  const g = gerador({ analysis: TIER1 });
  const r = await handleCopilotTick(INPUT, { supabase: client, generate: g.generate, readFlag: () => Promise.resolve(null) });
  assertEquals(r.result.skipped, "capability_unreadable");
  assertEquals(g.chamadas, []);
});

Deno.test("momento-chave de preço: dois andares, sessão e insights gravados", async () => {
  const { client, writes } = fakeSupabase({ session: SESSION, messages: MSGS });
  const g = gerador({ analysis: TIER1, copilot: TIER2 });
  const r = await handleCopilotTick(INPUT, { supabase: client, generate: g.generate, readFlag: () => Promise.resolve(true) });

  assertEquals(g.chamadas, ["analysis", "copilot"]);
  assertEquals(r.result.tier, 2);
  const patch = writes.updates[0];
  assertEquals(patch.sale_stage, "apresentando");
  assertEquals(patch.brinde_quantity, 300);
  assertEquals(patch.brinde_meter, 3); // Ana (já sabido) + quantidade + intenção
  assertEquals(patch.last_processed_message_at, "2026-10-30T10:02:00Z");
  assertEquals(patch.state_version, 4);

  const tipos = writes.inserts.map((i) => i.insight_type);
  assertEquals(tipos, ["stage_change", "alert", "next_action", "suggestion", "suggestion", "suggestion"]);
  for (const i of writes.inserts) {
    assertEquals(i.table, "copilot_insights");
    assertEquals(i.profile_id, "u1");
    assertEquals(i.source, "edge");
    assertEquals(typeof i.content, "string");
  }
  assertEquals(writes.inserts[3].data.path, "avancar");
});

Deno.test("só mensagens antes do cursor: nada novo, não chama o provedor", async () => {
  const { client } = fakeSupabase({ session: { ...SESSION, last_processed_message_at: "2026-10-30T10:05:00Z" }, messages: MSGS });
  const g = gerador({ analysis: TIER1 });
  const r = await handleCopilotTick(INPUT, { supabase: client, generate: g.generate, readFlag: () => Promise.resolve(true) });
  assertEquals(r.result.skipped, "no_new_contact_messages");
  assertEquals(g.chamadas, []);
});

Deno.test("sem momento-chave forte: só o andar 1", async () => {
  const msgs = [{ id: "m9", contact_id: "c1", sender: "contact", content: "bom dia, tudo bem", created_at: "2026-10-30T10:03:00Z" }];
  const { client, writes } = fakeSupabase({ session: SESSION, messages: msgs });
  const g = gerador({ analysis: { next_action: "Perguntar a ocasião." } });
  const r = await handleCopilotTick(INPUT, { supabase: client, generate: g.generate, readFlag: () => Promise.resolve(true) });
  assertEquals(g.chamadas, ["analysis"]);
  assertEquals(r.result.tier, 1);
  assertEquals(writes.inserts.map((i) => i.insight_type), ["next_action"]);
});

Deno.test("andar 2 inválido não derruba o andar 1", async () => {
  const { client, writes } = fakeSupabase({ session: SESSION, messages: MSGS });
  const g = gerador({ analysis: TIER1, copilot: { suggestions: [] } });
  const r = await handleCopilotTick(INPUT, { supabase: client, generate: g.generate, readFlag: () => Promise.resolve(true) });
  assertEquals(r.result.tier, 1);
  assertEquals(writes.inserts.some((i) => i.insight_type === "suggestion"), false);
  assertEquals(writes.updates.length, 1);
});

Deno.test("trava otimista: outro tick gravou antes → não grava insight nem avança", async () => {
  const { client, writes } = fakeSupabase({ session: SESSION, messages: MSGS, staleUpdate: true });
  const g = gerador({ analysis: TIER1, copilot: TIER2 });
  const r = await handleCopilotTick(INPUT, { supabase: client, generate: g.generate, readFlag: () => Promise.resolve(true) });
  assertEquals(r.result.skipped, "stale_state");
  assertEquals(writes.inserts.length, 0);
});

Deno.test("saída do andar 1 fora do contrato vira falha do job com código", async () => {
  const { client } = fakeSupabase({ session: SESSION, messages: MSGS });
  const g = gerador({ analysis: { sale_stage: "inventado", temperature: 900 } });
  const err = await assertRejects(
    () => handleCopilotTick(INPUT, { supabase: client, generate: g.generate, readFlag: () => Promise.resolve(true) }),
    CopilotTickError,
  );
  assertEquals(err.code, "COPILOT_TIER1_CONTRACT");
});

Deno.test("payload inválido e sessão inexistente são falhas com código", async () => {
  const { client } = fakeSupabase({ session: null, messages: MSGS });
  const deps = { supabase: client, generate: gerador({}).generate, readFlag: () => Promise.resolve(true) };
  const e1 = await assertRejects(() => handleCopilotTick({ ...INPUT, payload: {} }, deps), CopilotTickError);
  assertEquals(e1.code, "COPILOT_BAD_PAYLOAD");
  const e2 = await assertRejects(() => handleCopilotTick(INPUT, deps), CopilotTickError);
  assertEquals(e2.code, "COPILOT_SESSION_NOT_FOUND");
});

Deno.test("patch não apaga o que já se sabia e reconta o medidor", () => {
  const patch = buildSessionPatch(SESSION, { temperature: 10 }, "2026-10-30T11:00:00Z");
  assertEquals("brinde_responsible" in patch, false);
  assertEquals(patch.brinde_meter, 1);
  assertEquals(patch.temperature, 10);
});

Deno.test("momentos-chave: só mensagens do contato contam; andar 2 só nos fortes", () => {
  const msgs: TickMessage[] = [
    { id: "a", sender: "agent", content: "qual o preço que você esperava?", created_at: "x" },
    { id: "b", sender: "contact", content: "tá muito caro", created_at: "y" },
  ];
  assertEquals(detectKeyMoments(msgs), ["objection"]);
  assertEquals(shouldUseTier2(["unanswered_question", "logo_sent"]), false);
  assertEquals(shouldUseTier2(["objection"]), true);
});
