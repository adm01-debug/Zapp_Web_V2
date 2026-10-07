import { handleTalkxReport, escHtml } from "./index.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ─── Fake mínimo do SupabaseClient ──────────────────────────────────────────────
// `recipients` é a LISTA COMPLETA de status da campanha (a fonte da verdade).
// Um `select('status')` sem head devolve no máximo `pageCap` linhas — é o teto de
// página do PostgREST que a auditoria usou para reproduzir o defeito (P28); um
// `select(.., { count: 'exact', head: true })` devolve a contagem exata.
interface FakeOpts {
  campaign?: Record<string, unknown> | null;
  campaignError?: { message: string } | null;
  profile?: Record<string, unknown> | null;
  callerId?: string | null;
  recipients?: string[];
  countErrorFor?: string | null;
  pageCap?: number;
}

function makeFakeSupabase(opts: FakeOpts = {}) {
  const countCalls: string[] = [];
  const from = (table: string) => ({
    select: (_cols: string, sel?: { count?: string; head?: boolean }) => {
      const filters: Record<string, string> = {};
      let limit: number | null = null;

      const resolveSingle = async () => {
        if (table === "talkx_campaigns") return { data: opts.campaign ?? null, error: opts.campaignError ?? null };
        if (table === "profiles") return { data: opts.profile ?? null, error: null };
        return { data: null, error: { message: `tabela inesperada: ${table}` } };
      };

      const resolveList = async () => {
        if (table !== "talkx_recipients") {
          return { data: null, error: { message: `tabela inesperada: ${table}` } };
        }
        const lista = opts.recipients ?? [];
        const status = filters.status;
        if (sel?.head && sel?.count === "exact") {
          countCalls.push(status ?? "");
          if (opts.countErrorFor && opts.countErrorFor === status) {
            return { data: null, count: null, error: { message: "contagem indisponivel" } };
          }
          return { data: null, count: lista.filter((s) => s === status).length, error: null };
        }
        const teto = limit ?? opts.pageCap ?? 2000;
        const linhas = lista.filter((s) => (status ? s === status : true)).slice(0, teto);
        return { data: linhas.map((s) => ({ status: s })), error: null };
      };

      const chain = {
        eq: (col: string, val: string) => { filters[col] = val; return chain; },
        order: () => chain,
        limit: (n: number) => { limit = n; return chain; },
        single: resolveSingle,
        maybeSingle: resolveSingle,
        then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
          resolveList().then(onFulfilled, onRejected),
      };
      return chain;
    },
  });

  const auth = {
    getUser: async (_jwt: string) =>
      opts.callerId
        ? { data: { user: { id: opts.callerId } }, error: null }
        : { data: { user: null }, error: { message: "invalid jwt" } },
    admin: {
      getUserById: async (_id: string) => ({ data: { user: { email: "dono@exemplo.com" } }, error: null }),
    },
  };

  return { client: { from, auth } as unknown as SupabaseClient, countCalls };
}

function envComResend(valor = "chave-teste") {
  const store = new Map<string, string>();
  store.set("RESEND_API_KEY", valor);
  return { get: (name: string) => store.get(name) };
}

function pedido(campaignId = "camp-1"): Request {
  return new Request("https://exemplo.test/talkx-report", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer jwt-teste" },
    body: JSON.stringify({ campaignId }),
  });
}

// Intercepta o POST para a Resend: captura o e-mail montado, sem rede.
function interceptarResend() {
  const original = globalThis.fetch;
  const emails: Array<Record<string, unknown>> = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("api.resend.com")) {
      emails.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return Promise.resolve(
        new Response(JSON.stringify({ id: "email-teste" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    throw new Error(`fetch inesperado: ${url}`);
  }) as typeof fetch;
  return { emails, restaurar: () => { globalThis.fetch = original; } };
}

// Lê o valor de uma linha da tabela de KPIs do e-mail a partir do rótulo.
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function kpi(html: string, rotulo: string): string {
  const m = html.match(new RegExp(`${escRe(rotulo)}</td><td[^>]*>([^<]*)<`));
  if (!m) throw new Error(`linha "${rotulo}" ausente no e-mail`);
  return m[1];
}

const CAMPANHA_BASE = {
  id: "camp-1",
  name: "Black Friday",
  status: "completed",
  started_at: null,
  completed_at: null,
  created_by: "perfil-1",
};
const PERFIL_CRIADOR = { email: "dono@exemplo.com", name: "Dono", user_id: "user-1" };
const ROTULO_IGNORADOS = "Ignorados (blacklist/sem fone)";

// ─── escHtml (mantido) ──────────────────────────────────────────────────────────
Deno.test("escHtml escapa os 5 caracteres de injeção HTML", () => {
  const result = escHtml(`<script>alert('x')</script> & "test"`);
  assert(!result.includes("<script>"), `script tag nao escapado: ${result}`);
  assert(result.includes("&lt;script&gt;"), `unexpected: ${result}`);
  assert(result.includes("&amp;"), `unexpected: ${result}`);
  assert(result.includes("&#39;"), `unexpected: ${result}`);
  assert(result.includes("&quot;"), `unexpected: ${result}`);
});

// ─── R2-API-038 ─────────────────────────────────────────────────────────────────
Deno.test("R2-API-038: campanha concluída com 2500 ignorados reporta 2500 ignorados e zero pendentes", async () => {
  const spie = interceptarResend();
  try {
    const { client } = makeFakeSupabase({
      campaign: { ...CAMPANHA_BASE, total_recipients: 2500, sent_count: 0, delivered_count: 0, failed_count: 0 },
      profile: PERFIL_CRIADOR,
      callerId: "user-1",
      recipients: Array.from({ length: 2500 }, () => "skipped"),
    });
    const res = await handleTalkxReport(pedido(), { supabase: client, env: envComResend() });

    assert(res.status === 200, `status ${res.status} != 200`);
    assert(spie.emails.length === 1, `esperava 1 e-mail, veio ${spie.emails.length}`);
    const html = String(spie.emails[0].html ?? "");
    const ignorados = kpi(html, ROTULO_IGNORADOS);
    const pendentes = kpi(html, "Pendentes");
    assert(ignorados === "2.500", `ignorados deveria ser 2.500, veio ${ignorados}`);
    assert(pendentes === "0", `pendentes deveria ser 0, veio ${pendentes}`);
  } finally {
    spie.restaurar();
  }
});

Deno.test("R2-API-038: pendentes/em envio vêm do estado real, não da subtração do total", async () => {
  const spie = interceptarResend();
  try {
    const { client } = makeFakeSupabase({
      campaign: { ...CAMPANHA_BASE, total_recipients: 100, sent_count: 0, delivered_count: 0, failed_count: 0 },
      profile: PERFIL_CRIADOR,
      callerId: "user-1",
      // 50 em voo e 10 ignorados: nada está 'pending' de verdade.
      recipients: [...Array.from({ length: 50 }, () => "sending"), ...Array.from({ length: 10 }, () => "skipped")],
    });
    const res = await handleTalkxReport(pedido(), { supabase: client, env: envComResend() });

    assert(res.status === 200, `status ${res.status} != 200`);
    const html = String(spie.emails[0]?.html ?? "");
    const pendentes = kpi(html, "Pendentes");
    const emEnvio = kpi(html, "Em envio");
    assert(pendentes === "0", `pendentes deveria ser 0 (real), veio ${pendentes}`);
    assert(emEnvio === "50", `em envio deveria ser 50, veio ${emEnvio}`);
  } finally {
    spie.restaurar();
  }
});

Deno.test("R2-API-038: cancelled e outcome_unknown são reportados explicitamente, não como pendentes", async () => {
  const spie = interceptarResend();
  try {
    const { client } = makeFakeSupabase({
      campaign: { ...CAMPANHA_BASE, status: "cancelled", total_recipients: 10, sent_count: 5, delivered_count: 0, failed_count: 1 },
      profile: PERFIL_CRIADOR,
      callerId: "user-1",
      recipients: ["sent", "sent", "sent", "sent", "sent", "failed", "cancelled", "cancelled", "outcome_unknown", "outcome_unknown"],
    });
    const res = await handleTalkxReport(pedido(), { supabase: client, env: envComResend() });

    assert(res.status === 200, `status ${res.status} != 200`);
    const html = String(spie.emails[0]?.html ?? "");
    assert(kpi(html, "Pendentes") === "0", `pendentes deveria ser 0, veio ${kpi(html, "Pendentes")}`);
    assert(kpi(html, "Cancelados") === "2", `cancelados deveria ser 2, veio ${kpi(html, "Cancelados")}`);
    assert(
      kpi(html, "Sem confirmação do provedor") === "2",
      `sem confirmação deveria ser 2, veio ${kpi(html, "Sem confirmação do provedor")}`,
    );
  } finally {
    spie.restaurar();
  }
});

Deno.test("R2-API-038: contagem exata falhando não envia relatório incompleto (502, sem e-mail)", async () => {
  const spie = interceptarResend();
  try {
    const { client } = makeFakeSupabase({
      campaign: { ...CAMPANHA_BASE, total_recipients: 2500, sent_count: 0, delivered_count: 0, failed_count: 0 },
      profile: PERFIL_CRIADOR,
      callerId: "user-1",
      recipients: Array.from({ length: 2500 }, () => "skipped"),
      countErrorFor: "skipped",
    });
    const res = await handleTalkxReport(pedido(), { supabase: client, env: envComResend() });

    assert(res.status === 502, `status ${res.status} != 502`);
    const body = await res.json() as { reason?: string };
    assert(body.reason === "recipients_query_failed", `reason errado: ${JSON.stringify(body)}`);
    assert(spie.emails.length === 0, `não deveria enviar e-mail, veio ${spie.emails.length}`);
  } finally {
    spie.restaurar();
  }
});

// ─── Regressão: envio segue exigindo a chave do provedor ────────────────────────
Deno.test("sem RESEND_API_KEY devolve 503 e não envia e-mail", async () => {
  const spie = interceptarResend();
  try {
    const { client } = makeFakeSupabase({
      campaign: { ...CAMPANHA_BASE, total_recipients: 1, sent_count: 1, delivered_count: 0, failed_count: 0 },
      profile: PERFIL_CRIADOR,
      callerId: "user-1",
      recipients: ["sent"],
    });
    const res = await handleTalkxReport(pedido(), { supabase: client, env: envComResend("") });

    assert(res.status === 503, `status ${res.status} != 503`);
    assert(spie.emails.length === 0, `não deveria enviar e-mail, veio ${spie.emails.length}`);
  } finally {
    spie.restaurar();
  }
});
