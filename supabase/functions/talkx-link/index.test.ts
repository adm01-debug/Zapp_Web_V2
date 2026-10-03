import { handleTalkxLink, mergeUtm } from "./index.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const CONVERT_SECRET = "teste-secret-x022";

interface FakeOpts {
  linkClickResult?: unknown;
  linkRow?: Record<string, unknown> | null;
  recipientRow?: Record<string, unknown> | null;
  conversionResult?: unknown;
  conversionError?: { message: string } | null;
}

// Fake mínimo do SupabaseClient para exercitar o handler sem rede.
function makeFakeSupabase(opts: FakeOpts = {}) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    if (fn === "record_talkx_link_click") {
      return { data: opts.linkClickResult ?? null, error: null };
    }
    if (fn === "record_talkx_conversion") {
      return { data: opts.conversionResult ?? null, error: opts.conversionError ?? null };
    }
    return { data: null, error: { message: `rpc inesperada: ${fn}` } };
  };
  const from = (table: string) => ({
    select: (_cols: string) => ({
      eq: (_col: string, _val: unknown) => ({
        maybeSingle: async () => {
          if (table === "talkx_recipients") return { data: opts.recipientRow ?? null, error: null };
          if (table === "talkx_links") return { data: opts.linkRow ?? null, error: null };
          return { data: null, error: { message: `tabela inesperada: ${table}` } };
        },
      }),
    }),
  });
  return { rpc, from, rpcCalls } as unknown as SupabaseClient & { rpcCalls: typeof rpcCalls };
}

function makeEnv(overrides: Record<string, string> = {}) {
  const store = new Map<string, string>([
    ["TALKX_CONVERT_SECRET", CONVERT_SECRET],
    ["TALKX_LINK_IP_SALT", "ip-salt"],
    ...Object.entries(overrides),
  ]);
  return { get: (name: string) => store.get(name) };
}

async function signBody(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function makePost(
  body: Record<string, unknown>,
  opts: { secret?: string; timestamp?: string; signature?: string } = {},
): Promise<Request> {
  const rawBody = JSON.stringify(body);
  const timestamp = opts.timestamp ?? String(Date.now());
  const signature = opts.signature ?? await signBody(opts.secret ?? CONVERT_SECRET, rawBody);
  return new Request("https://example.com/talkx-link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-talkx-timestamp": timestamp,
      "x-talkx-signature": signature,
    },
    body: rawBody,
  });
}

// ── mergeUtm (puro) ──────────────────────────────────────────────────────────
Deno.test("mergeUtm adiciona os UTM ao destino sem query", () => {
  const out = mergeUtm("https://loja.com/checkout", {
    utm_source: "whatsapp", utm_medium: "talkx", utm_campaign: "promo", utm_content: "", utm_term: null,
  });
  const u = new URL(out);
  assert(u.searchParams.get("utm_source") === "whatsapp", `utm_source ausente: ${out}`);
  assert(u.searchParams.get("utm_medium") === "talkx", `utm_medium ausente: ${out}`);
  assert(u.searchParams.get("utm_campaign") === "promo", `utm_campaign ausente: ${out}`);
  assert(!u.searchParams.has("utm_content"), `utm_content vazio deveria ser ignorado: ${out}`);
  assert(!u.searchParams.has("utm_term"), `utm_term null deveria ser ignorado: ${out}`);
});

Deno.test("mergeUtm não sobrescreve parâmetro existente do destino", () => {
  const out = mergeUtm("https://loja.com/checkout?utm_source=organico", {
    utm_source: "whatsapp",
  });
  const u = new URL(out);
  assert(u.searchParams.get("utm_source") === "organico", `não deveria sobrescrever: ${out}`);
});

Deno.test("mergeUtm preserva URL sem link e URL inválida", () => {
  assert(mergeUtm("https://loja.com/x", null) === "https://loja.com/x", "null row deveria devolver original");
  assert(mergeUtm("https://loja.com/x", undefined) === "https://loja.com/x", "undefined row deveria devolver original");
  assert(mergeUtm("não-é-url", { utm_source: "x" }) === "não-é-url", "URL inválida deveria devolver original");
});

// ── handleTalkxLink: GET ─────────────────────────────────────────────────────
Deno.test("GET registra clique e redireciona com UTM do link", async () => {
  const supabase = makeFakeSupabase({
    linkClickResult: { target_url: "https://loja.com/checkout", link_id: "link-1" },
    linkRow: { utm_source: "whatsapp", utm_medium: "talkx", utm_campaign: "promo", utm_content: null, utm_term: null },
  });
  const req = new Request("https://example.com/talkx-link?s=abc123&r=rec-1", { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 302, `status ${res.status} != 302`);
  const location = res.headers.get("location") ?? "";
  const u = new URL(location);
  assert(u.searchParams.get("utm_source") === "whatsapp", `utm_source ausente em Location: ${location}`);
  assert(u.searchParams.get("utm_campaign") === "promo", `utm_campaign ausente em Location: ${location}`);
});

Deno.test("GET slug inexistente devolve 404 neutro (sem redirecionar)", async () => {
  const supabase = makeFakeSupabase({ linkClickResult: { error: "link_not_found" } });
  const req = new Request("https://example.com/talkx-link?s=inexistente", { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 404, `status ${res.status} != 404`);
  assert(res.headers.get("location") === null, "não deveria redirecionar");
});

// ── handleTalkxLink: POST (autenticação + valor + dedupe) ────────────────────
Deno.test("POST sem secret configurado devolve 503", async () => {
  const supabase = makeFakeSupabase();
  const req = await makePost({ action: "convert", recipient_id: "rec-1" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv({ TALKX_CONVERT_SECRET: "" }) });
  assert(res.status === 503, `status ${res.status} != 503`);
});

Deno.test("POST sem assinatura devolve 401", async () => {
  const supabase = makeFakeSupabase();
  const req = new Request("https://example.com/talkx-link", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-talkx-timestamp": String(Date.now()) },
    body: JSON.stringify({ action: "convert", recipient_id: "rec-1" }),
  });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 401, `status ${res.status} != 401`);
});

Deno.test("POST com assinatura errada devolve 401", async () => {
  const supabase = makeFakeSupabase();
  const req = await makePost({ action: "convert", recipient_id: "rec-1" }, { signature: "deadbeef" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 401, `status ${res.status} != 401`);
});

Deno.test("POST com timestamp vencido devolve 401", async () => {
  const supabase = makeFakeSupabase();
  const req = await makePost({ action: "convert", recipient_id: "rec-1" }, { timestamp: String(Date.now() - 10 * 60 * 1000) });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 401, `status ${res.status} != 401`);
});

Deno.test("POST válido devolve 200 e grava uma conversão", async () => {
  const supabase = makeFakeSupabase({
    recipientRow: { campaign_id: "camp-1" },
    conversionResult: { status: "recorded", id: "conv-1" },
  });
  const req = await makePost({ action: "convert", recipient_id: "rec-1", value: 150, external_ref: "pedido-1", source: "checkout" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 200, `status ${res.status} != 200`);
  const body = await res.json();
  assert(body.success === true, `success ausente: ${JSON.stringify(body)}`);
  const conversionCall = supabase.rpcCalls.find((c) => c.fn === "record_talkx_conversion");
  assert(conversionCall !== undefined, "record_talkx_conversion não chamada");
  assert(conversionCall!.args.p_external_ref === "pedido-1", `external_ref errado: ${JSON.stringify(conversionCall!.args)}`);
});

Deno.test("POST repetido devolve duplicate:true sem duplicar", async () => {
  const supabase = makeFakeSupabase({
    recipientRow: { campaign_id: "camp-1" },
    conversionResult: { status: "duplicate" },
  });
  const req = await makePost({ action: "convert", recipient_id: "rec-1", value: 150, external_ref: "pedido-1" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 200, `status ${res.status} != 200`);
  const body = await res.json();
  assert(body.duplicate === true, `duplicate ausente: ${JSON.stringify(body)}`);
});

Deno.test("POST com value negativo devolve 422", async () => {
  const supabase = makeFakeSupabase();
  const req = await makePost({ action: "convert", recipient_id: "rec-1", value: -1 });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 422, `status ${res.status} != 422`);
});

Deno.test("POST com value texto devolve 422", async () => {
  const supabase = makeFakeSupabase();
  const req = await makePost({ action: "convert", recipient_id: "rec-1", value: "muito" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 422, `status ${res.status} != 422`);
});

Deno.test("POST com value acima do teto (erro da RPC) devolve 422 sem vazar texto", async () => {
  const supabase = makeFakeSupabase({
    recipientRow: { campaign_id: "camp-1" },
    conversionError: { message: "talkx_conversion_value_exceeds_max" },
  });
  const req = await makePost({ action: "convert", recipient_id: "rec-1", value: 1e12 });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 422, `status ${res.status} != 422`);
  const body = await res.json();
  assert(!JSON.stringify(body).includes("exceeds_max"), `vazou texto do banco: ${JSON.stringify(body)}`);
});
