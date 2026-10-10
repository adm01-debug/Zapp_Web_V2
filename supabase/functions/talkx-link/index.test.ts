import { CLICK_TOKEN_SCAN_MAX_PAGES, CLICK_TOKEN_SCAN_PAGE_SIZE, handleTalkxLink, isWellFormedClickToken, mergeUtm } from "./index.ts";
import { buildTalkxLinkUrl } from "../talkx-send/index.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const CONVERT_SECRET = "teste-secret-x022";

interface FakeOpts {
  linkClickResult?: unknown;
  linkRow?: Record<string, unknown> | null;
  recipientRow?: Record<string, unknown> | null;
  // Linhas para a resolução do token (o handler lista os recipients da
  // campanha com order+range; o filtro por campaign_id é respeitado aqui
  // para o teste de escopo entre campanhas).
  recipientRows?: Array<{ id: string; campaign_id?: string }>;
  conversionResult?: unknown;
  conversionError?: { message: string } | null;
  // Contador de páginas lidas na listagem (prova o teto da varredura).
  onRange?: (table: string, fromIdx: number, toIdx: number) => void;
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
    select: (_cols: string) => {
      let eqCol: string | null = null;
      let eqVal: unknown = undefined;
      let rangeFrom = 0;
      let rangeTo = Number.POSITIVE_INFINITY;
      const api = {
        eq: (col: string, val: unknown) => {
          eqCol = col;
          eqVal = val;
          return api;
        },
        order: (_col: string, _dir?: unknown) => api,
        range: (fromIdx: number, toIdx: number) => {
          rangeFrom = fromIdx;
          rangeTo = toIdx;
          opts.onRange?.(table, fromIdx, toIdx);
          return api;
        },
        maybeSingle: async () => {
          if (table === "talkx_recipients") return { data: opts.recipientRow ?? null, error: null };
          if (table === "talkx_links") return { data: opts.linkRow ?? null, error: null };
          return { data: null, error: { message: `tabela inesperada: ${table}` } };
        },
        // Listagem direta (await na query, sem maybeSingle): usada pela
        // resolução do token opaco no GET com HMAC.
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
          try {
            if (table === "talkx_recipients") {
              let rows = [...(opts.recipientRows ?? [])];
              if (eqCol === "campaign_id") {
                rows = rows.filter((r) => r.campaign_id === undefined || r.campaign_id === eqVal);
              }
              const end = rangeTo === Number.POSITIVE_INFINITY ? undefined : rangeTo + 1;
              resolve({ data: rows.slice(rangeFrom, end), error: null });
            } else if (table === "talkx_links") {
              resolve({ data: opts.linkRow ? [opts.linkRow] : [], error: null });
            } else {
              resolve({ data: null, error: { message: `tabela inesperada: ${table}` } });
            }
          } catch (e) {
            if (reject) reject(e);
          }
        },
      };
      return api;
    },
  });
  return { rpc, from, rpcCalls } as unknown as SupabaseClient & { rpcCalls: typeof rpcCalls };
}

// Cenário padrão do clique com HMAC: link da campanha camp-1 e os
// recipients informados como linhas dessa campanha.
function clickSupabase(recipientIds: string[], campaignId = "camp-1", extra: Partial<FakeOpts> = {}) {
  return makeFakeSupabase({
    ...extra,
    linkClickResult: { target_url: "https://loja.com/checkout", link_id: "link-1", campaign_id: campaignId },
    linkRow: {
      id: "link-1",
      campaign_id: campaignId,
      utm_source: "whatsapp",
      utm_medium: "talkx",
      utm_campaign: "promo",
      utm_content: null,
      utm_term: null,
    },
    recipientRows: recipientIds.map((id) => ({ id, campaign_id: campaignId })),
  });
}

function clickRpcCalls(supabase: { rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> }) {
  return supabase.rpcCalls.filter((c) => c.fn === "record_talkx_link_click");
}

function makeEnv(overrides: Record<string, string> = {}) {
  const store = new Map<string, string>([
    ["TALKX_CONVERT_SECRET", CONVERT_SECRET],
    ["TALKX_LINK_IP_SALT", "ip-salt"],
    ...Object.entries(overrides),
  ]);
  return { get: (name: string) => store.get(name) };
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Representação canônica v1 montada literalmente aqui (o teste NÃO importa a
// função do handler): se o handler assinar outra string, os testes que esperam
// 200/422 falham — é isso que prova o contrato "v1\n<ts>\n<external_ref>\n<body>".
function payloadV1(timestamp: string, externalRef: string, rawBody: string): string {
  return ["v1", timestamp, externalRef, rawBody].join("\n");
}

async function signV1(secret: string, timestamp: string, externalRef: string, rawBody: string): Promise<string> {
  return hmacHex(secret, payloadV1(timestamp, externalRef, rawBody));
}

function rawPost(rawBody: string, timestamp: string, signature: string): Request {
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

async function makePost(
  body: Record<string, unknown>,
  opts: { secret?: string; timestamp?: string; signature?: string } = {},
): Promise<Request> {
  const rawBody = JSON.stringify(body);
  const timestamp = opts.timestamp ?? String(Date.now());
  const externalRef = typeof body.external_ref === "string" ? body.external_ref : "";
  const signature = opts.signature ?? await signV1(opts.secret ?? CONVERT_SECRET, timestamp, externalRef, rawBody);
  return rawPost(rawBody, timestamp, signature);
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
// Contrato X022 (com TALKX_CONVERT_SECRET): o `r` é o token opaco
// (HMAC-SHA256 do recipient_id) gerado pelo talkx-send via
// buildTalkxLinkUrl — o recipient_id cru nunca viaja na URL, e o link
// resolve o recipient correspondente ao token antes de registrar o clique.
Deno.test("GET registra clique e redireciona com UTM do link", async () => {
  const supabase = clickSupabase(["rec-1", "rec-2"]);
  const token = await hmacHex(CONVERT_SECRET, "rec-2");
  const req = new Request(`https://example.com/talkx-link?s=abc123&r=${token}`, { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 302, `status ${res.status} != 302`);
  const location = res.headers.get("location") ?? "";
  const u = new URL(location);
  assert(u.searchParams.get("utm_source") === "whatsapp", `utm_source ausente em Location: ${location}`);
  assert(u.searchParams.get("utm_campaign") === "promo", `utm_campaign ausente em Location: ${location}`);
  const calls = clickRpcCalls(supabase);
  assert(calls.length === 1, `deveria gravar 1 clique (chamadas=${calls.length})`);
  assert(calls[0].args.p_recipient === "rec-2", `o clique deve levar o recipient resolvido, não o token: ${JSON.stringify(calls[0].args)}`);
  assert(calls[0].args.p_recipient !== token, `o token opaco nunca chega ao postgres: ${JSON.stringify(calls[0].args)}`);
});

Deno.test("GET slug inexistente devolve 404 neutro (sem redirecionar)", async () => {
  const supabase = makeFakeSupabase({ linkClickResult: { error: "link_not_found" } });
  const req = new Request("https://example.com/talkx-link?s=inexistente", { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 404, `status ${res.status} != 404`);
  assert(res.headers.get("location") === null, "não deveria redirecionar");
  const calls = clickRpcCalls(supabase);
  assert(calls.length === 1, `o RPC decide o 404 (chamadas=${calls.length})`);
  assert(calls[0].args.p_recipient === null, `token nunca chega ao RPC (coluna uuid): ${JSON.stringify(calls[0].args)}`);
});

// ── handleTalkxLink: GET com HMAC token (X022) ──────────────────
Deno.test("GET sem r com TALKX_CONVERT_SECRET configurado devolve 401 sem clicar", async () => {
  const supabase = clickSupabase(["rec-1"]);
  const req = new Request("https://example.com/talkx-link?s=abc123", { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 401, `status ${res.status} != 401`);
  assert(res.headers.get("location") === null, "não deveria redirecionar");
  const calls = clickRpcCalls(supabase);
  assert(calls.length === 0, `não deveria gravar clique sem token (chamadas=${calls.length})`);
});

Deno.test("GET com token inválido devolve 401 sem registrar clique", async () => {
  const supabase = clickSupabase(["rec-1"]);
  for (const bad of ["invalid-token", "0".repeat(64), await hmacHex("outro-secret", "rec-1")]) {
    const req = new Request(`https://example.com/talkx-link?s=abc123&r=${encodeURIComponent(bad)}`, { method: "GET" });
    const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
    assert(res.status === 401, `r=${bad.slice(0, 16)}… deveria ser 401, status=${res.status}`);
    assert(res.headers.get("location") === null, "não deveria redirecionar");
  }
  const calls = clickRpcCalls(supabase);
  assert(calls.length === 0, `não deveria gravar clique com token inválido (chamadas=${calls.length})`);
});

Deno.test("GET com token de recipient de outra campanha devolve 401", async () => {
  const supabase = makeFakeSupabase({
    linkClickResult: { target_url: "https://loja.com/checkout", link_id: "link-1", campaign_id: "camp-1" },
    linkRow: {
      id: "link-1",
      campaign_id: "camp-1",
      utm_source: "whatsapp",
      utm_medium: "talkx",
      utm_campaign: "promo",
      utm_content: null,
      utm_term: null,
    },
    recipientRows: [{ id: "rec-camp1", campaign_id: "camp-1" }, { id: "rec-outra", campaign_id: "camp-outra" }],
  });
  const token = await hmacHex(CONVERT_SECRET, "rec-outra");
  const req = new Request(`https://example.com/talkx-link?s=abc123&r=${token}`, { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 401, `status ${res.status} != 401`);
  const calls = clickRpcCalls(supabase);
  assert(calls.length === 0, `token de outra campanha não grava clique (chamadas=${calls.length})`);
});

Deno.test("GET com recipient cru no lugar do token devolve 401", async () => {
  const supabase = clickSupabase(["rec-1"]);
  const req = new Request("https://example.com/talkx-link?s=abc123&r=rec-1", { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 401, `status ${res.status} != 401`);
  const calls = clickRpcCalls(supabase);
  assert(calls.length === 0, `URL legada (id cru) não grava clique com o secret ligado (chamadas=${calls.length})`);
});

Deno.test("GET sem TALKX_CONVERT_SECRET funciona como antes (r cru, sem token)", async () => {
  const supabase = makeFakeSupabase({
    linkClickResult: { target_url: "https://loja.com/checkout", link_id: "link-1" },
    linkRow: { utm_source: "whatsapp", utm_medium: "talkx", utm_campaign: "promo" },
  });
  const req = new Request("https://example.com/talkx-link?s=abc123&r=rec-1", { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv({ TALKX_CONVERT_SECRET: "" }) });
  assert(res.status === 302, `status ${res.status} != 302`);
  const calls = clickRpcCalls(supabase);
  assert(calls.length === 1, `deveria gravar clique sem secret configurado (chamadas=${calls.length})`);
  assert(calls[0].args.p_recipient === "rec-1", `sem secret o r cru segue para o RPC: ${JSON.stringify(calls[0].args)}`);
});

// Ponto 3 da revisão: a URL REAL produzida pelo send abre o clique de
// ponta a ponta até o 302, sem vazar o recipient cru no caminho.
Deno.test("integração: URL real do buildTalkxLinkUrl resolve o recipient e devolve 302", async () => {
  const recipientId = "11111111-2222-3333-4444-555555555555";
  const supabase = clickSupabase([recipientId]);
  const url = await buildTalkxLinkUrl("abc123", recipientId, CONVERT_SECRET, "", "https://supabase.example.com");
  assert(!url.includes(recipientId), `URL vazou o recipient_id cru: ${url}`);
  const req = new Request(url, { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 302, `status ${res.status} != 302 (url=${url})`);
  const calls = clickRpcCalls(supabase);
  assert(calls.length === 1, `deveria gravar 1 clique (chamadas=${calls.length})`);
  assert(calls[0].args.p_recipient === recipientId, `o clique deve levar o UUID resolvido: ${JSON.stringify(calls[0].args)}`);
  const rParam = new URL(url).searchParams.get("r") ?? "";
  assert(rParam !== recipientId, `a URL carrega o token, não o UUID: ${url}`);
  assert(calls[0].args.p_recipient !== rParam, `o token opaco nunca chega ao postgres: ${JSON.stringify(calls[0].args)}`);
  const location = res.headers.get("location") ?? "";
  assert(location.startsWith("https://loja.com/checkout"), `redirect errado: ${location}`);
});

// ── handleTalkxLink: POST (autenticação + valor + dedupe) ────────────────────
Deno.test("POST sem secret configurado devolve 503", async () => {
  const supabase = makeFakeSupabase();
  const req = await makePost({ action: "convert", recipient_id: "rec-1", external_ref: "pedido-x" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv({ TALKX_CONVERT_SECRET: "" }) });
  assert(res.status === 503, `status ${res.status} != 503`);
});

Deno.test("POST sem assinatura devolve 401", async () => {
  const supabase = makeFakeSupabase();
  const req = new Request("https://example.com/talkx-link", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-talkx-timestamp": String(Date.now()) },
    body: JSON.stringify({ action: "convert", recipient_id: "rec-1", external_ref: "pedido-x" }),
  });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 401, `status ${res.status} != 401`);
});

Deno.test("POST com assinatura errada devolve 401", async () => {
  const supabase = makeFakeSupabase();
  const req = await makePost(
    { action: "convert", recipient_id: "rec-1", external_ref: "pedido-x" },
    { signature: "deadbeef" },
  );
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 401, `status ${res.status} != 401`);
});

Deno.test("POST com timestamp vencido devolve 401", async () => {
  const supabase = makeFakeSupabase();
  const req = await makePost(
    { action: "convert", recipient_id: "rec-1", external_ref: "pedido-x" },
    { timestamp: String(Date.now() - 10 * 60 * 1000) },
  );
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 401, `status ${res.status} != 401`);
});

// R2-API-035 — o formato v1 assina também timestamp e external_ref. Durante a
// coexistência o formato legado é aceito por decisão do dono; o replay fica
// bloqueado definitivamente quando a data-limite desativa o legado.
Deno.test("POST v1: corpo e assinatura capturados não são aceitos com timestamp novo", async () => {
  const supabase = makeFakeSupabase({
    recipientRow: { campaign_id: "camp-1" },
    conversionResult: { status: "recorded", id: "conv-1" },
  });
  const env = makeEnv();
  const body = { action: "convert", recipient_id: "rec-1", value: 150, external_ref: "pedido-replay" };
  const rawBody = JSON.stringify(body);
  const send = (timestamp: string, signature: string) =>
    handleTalkxLink(rawPost(rawBody, timestamp, signature), { supabase, env });
  const convCalls = () => supabase.rpcCalls.filter((c) => c.fn === "record_talkx_conversion").length;

  const ts1 = String(Date.now());
  const sig1 = await signV1(CONVERT_SECRET, ts1, "pedido-replay", rawBody);
  const res1 = await send(ts1, sig1);
  assert(res1.status === 200, `conversão v1 original deveria gravar: ${res1.status}`);
  assert(convCalls() === 1, `a conversão original chama a RPC uma vez (chamadas=${convCalls()})`);

  // Replay dentro da janela: mesmo corpo, mesma assinatura, timestamp novo.
  const res2 = await send(String(Date.now() + 60_000), sig1);
  assert(res2.status === 401, `replay com timestamp novo deveria dar 401, veio ${res2.status}`);
  assert(convCalls() === 1, `replay não pode chamar a RPC de novo (chamadas=${convCalls()})`);

  // Fora da janela (±6 min): também 401, sem chamar a RPC.
  const res3 = await send(String(Date.now() - 6 * 60 * 1000), sig1);
  assert(res3.status === 401, `replay fora da janela deveria dar 401, veio ${res3.status}`);
  assert(convCalls() === 1, `replay fora da janela não pode chamar a RPC (chamadas=${convCalls()})`);
});

Deno.test("POST assinatura no formato antigo é aceita até a data-limite e registra aviso", async () => {
  const supabase = makeFakeSupabase({
    recipientRow: { campaign_id: "camp-1" },
    conversionResult: { status: "recorded", id: "conv-1" },
  });
  const body = { action: "convert", recipient_id: "rec-1", value: 10, external_ref: "pedido-legado" };
  const rawBody = JSON.stringify(body);
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")); };
  try {
    const req = rawPost(rawBody, String(Date.now()), await hmacHex(CONVERT_SECRET, rawBody));
    const res = await handleTalkxLink(req, {
      supabase,
      env: makeEnv({ TALKX_LEGACY_SIGNATURE_ACCEPT_UNTIL: "2999-01-01T00:00:00.000Z" }),
    });
    assert(res.status === 200, `status ${res.status} != 200`);
  } finally {
    console.warn = originalWarn;
  }
  const conversionCall = supabase.rpcCalls.find((c) => c.fn === "record_talkx_conversion");
  assert(conversionCall !== undefined, "formato antigo deve chegar à RPC durante coexistência");
  assert(conversionCall!.args.p_external_ref === "pedido-legado", `external_ref errado: ${JSON.stringify(conversionCall!.args)}`);
  assert(
    warnings.some((line) => line.includes("assinatura Talk X legada") && line.includes("2999-01-01T00:00:00.000Z")),
    `aviso de depreciação ausente: ${JSON.stringify(warnings)}`,
  );
});

Deno.test("POST assinatura no formato antigo depois da data-limite devolve 401", async () => {
  const supabase = makeFakeSupabase({
    recipientRow: { campaign_id: "camp-1" },
    conversionResult: { status: "recorded", id: "conv-1" },
  });
  const body = { action: "convert", recipient_id: "rec-1", value: 10, external_ref: "pedido-legado" };
  const rawBody = JSON.stringify(body);
  const req = rawPost(rawBody, String(Date.now()), await hmacHex(CONVERT_SECRET, rawBody));
  const res = await handleTalkxLink(req, {
    supabase,
    env: makeEnv({ TALKX_LEGACY_SIGNATURE_ACCEPT_UNTIL: "2000-01-01T00:00:00.000Z" }),
  });
  assert(res.status === 401, `status ${res.status} != 401`);
  assert(
    supabase.rpcCalls.filter((c) => c.fn === "record_talkx_conversion").length === 0,
    "formato antigo vencido não pode chegar à RPC",
  );
});

Deno.test("POST legado sem external_ref é aceito antes da data-limite", async () => {
  const supabase = makeFakeSupabase({
    recipientRow: { campaign_id: "camp-1" },
    conversionResult: { status: "recorded", id: "conv-1" },
  });
  const body = { action: "convert", recipient_id: "rec-1", value: 10 };
  const rawBody = JSON.stringify(body);
  const req = rawPost(rawBody, String(Date.now()), await hmacHex(CONVERT_SECRET, rawBody));
  const res = await handleTalkxLink(req, {
    supabase,
    env: makeEnv({ TALKX_LEGACY_SIGNATURE_ACCEPT_UNTIL: "2999-01-01T00:00:00.000Z" }),
  });
  assert(res.status === 200, `status ${res.status} != 200`);
  const conversionCall = supabase.rpcCalls.find((c) => c.fn === "record_talkx_conversion");
  assert(conversionCall !== undefined, "record_talkx_conversion não chamada");
  assert(conversionCall!.args.p_external_ref === null, `external_ref legado deveria ser null: ${JSON.stringify(conversionCall!.args)}`);
});

Deno.test("POST v1 sem external_ref (ausente, vazio ou não-string) devolve 400 e não chama a RPC", async () => {
  const supabase = makeFakeSupabase({
    recipientRow: { campaign_id: "camp-1" },
    conversionResult: { status: "recorded", id: "conv-1" },
  });
  const env = makeEnv({ TALKX_LEGACY_SIGNATURE_ACCEPT_UNTIL: "2000-01-01T00:00:00.000Z" });
  const casos: Array<[string, Record<string, unknown>]> = [
    ["ausente", { action: "convert", recipient_id: "rec-1", value: 10 }],
    ["string vazia", { action: "convert", recipient_id: "rec-1", value: 10, external_ref: "" }],
    ["não-string", { action: "convert", recipient_id: "rec-1", value: 10, external_ref: 12345 }],
  ];
  for (const [nome, body] of casos) {
    const res = await handleTalkxLink(await makePost(body), { supabase, env });
    assert(res.status === 400, `caso ${nome}: status ${res.status} != 400`);
  }
  assert(
    supabase.rpcCalls.filter((c) => c.fn === "record_talkx_conversion").length === 0,
    "sem external_ref no v1 a RPC não pode ser chamada",
  );
});

Deno.test("POST assinatura v1 com corpo adulterado (external_ref trocado) devolve 401", async () => {
  const supabase = makeFakeSupabase({
    recipientRow: { campaign_id: "camp-1" },
    conversionResult: { status: "recorded", id: "conv-1" },
  });
  const original = { action: "convert", recipient_id: "rec-1", value: 150, external_ref: "pedido-A" };
  const ts = String(Date.now());
  const sig = await signV1(CONVERT_SECRET, ts, "pedido-A", JSON.stringify(original));
  // Atacante capturou corpo+assinatura e troca o external_ref (reenvio com
  // identidade de evento diferente burlaria o dedupe se a assinatura passasse).
  const adulterado = JSON.stringify({ ...original, external_ref: "pedido-B" });
  const res = await handleTalkxLink(rawPost(adulterado, ts, sig), { supabase, env: makeEnv() });
  assert(res.status === 401, `status ${res.status} != 401`);
  assert(
    supabase.rpcCalls.filter((c) => c.fn === "record_talkx_conversion").length === 0,
    "corpo adulterado não pode chegar à RPC",
  );
});

Deno.test("POST válido devolve 200 e grava uma conversão com os campos opcionais", async () => {
  const supabase = makeFakeSupabase({
    recipientRow: { campaign_id: "camp-1" },
    conversionResult: { status: "recorded", id: "conv-1" },
  });
  const req = await makePost({
    action: "convert",
    recipient_id: "rec-1",
    value: 150,
    external_ref: "pedido-1",
    source: "checkout",
    link_id: "link-9",
    currency: "BRL",
    occurred_at: "2026-10-05T12:00:00Z",
    attribution: { produto: "caneca" },
  });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 200, `status ${res.status} != 200`);
  const body = await res.json();
  assert(body.success === true, `success ausente: ${JSON.stringify(body)}`);
  const conversionCall = supabase.rpcCalls.find((c) => c.fn === "record_talkx_conversion");
  assert(conversionCall !== undefined, "record_talkx_conversion não chamada");
  assert(conversionCall!.args.p_external_ref === "pedido-1", `external_ref errado: ${JSON.stringify(conversionCall!.args)}`);
  assert(conversionCall!.args.p_link_id === "link-9", `link_id errado: ${JSON.stringify(conversionCall!.args)}`);
  assert(conversionCall!.args.p_currency === "BRL", `currency errada: ${JSON.stringify(conversionCall!.args)}`);
  assert(conversionCall!.args.p_occurred_at === "2026-10-05T12:00:00Z", `occurred_at errado: ${JSON.stringify(conversionCall!.args)}`);
  assert(
    JSON.stringify(conversionCall!.args.p_attribution) === JSON.stringify({ produto: "caneca" }),
    `attribution errado: ${JSON.stringify(conversionCall!.args)}`,
  );
});

// Reenvio legítimo com o MESMO external_ref: cada requisição assina de novo
// (timestamp novo exige assinatura nova na v1) e o dedupe é do banco.
Deno.test("POST reenvio com mesmo external_ref devolve duplicate (1 chamada RPC por requisição)", async () => {
  const supabase = makeFakeSupabase({
    recipientRow: { campaign_id: "camp-1" },
    conversionResult: { status: "duplicate" },
  });
  const env = makeEnv();
  const body = { action: "convert", recipient_id: "rec-1", value: 150, external_ref: "pedido-9" };

  const res1 = await handleTalkxLink(await makePost(body), { supabase, env });
  assert(res1.status === 200, `primeira: status ${res1.status} != 200`);
  assert((await res1.json()).duplicate === true, "primeira: duplicate ausente");

  const res2 = await handleTalkxLink(await makePost(body), { supabase, env });
  assert(res2.status === 200, `segunda: status ${res2.status} != 200`);
  assert((await res2.json()).duplicate === true, "segunda: duplicate ausente");

  const convCalls = supabase.rpcCalls.filter((c) => c.fn === "record_talkx_conversion");
  assert(convCalls.length === 2, `1 chamada por requisição, veio ${convCalls.length}`);
  assert(convCalls[1].args.p_external_ref === "pedido-9", `external_ref errado: ${JSON.stringify(convCalls[1].args)}`);
});

Deno.test("POST com value negativo devolve 422", async () => {
  const supabase = makeFakeSupabase();
  const req = await makePost({ action: "convert", recipient_id: "rec-1", external_ref: "pedido-x", value: -1 });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 422, `status ${res.status} != 422`);
});

Deno.test("POST com value texto devolve 422", async () => {
  const supabase = makeFakeSupabase();
  const req = await makePost({ action: "convert", recipient_id: "rec-1", external_ref: "pedido-x", value: "muito" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 422, `status ${res.status} != 422`);
});

Deno.test("POST com value acima do teto (erro da RPC) devolve 422 sem vazar texto", async () => {
  const supabase = makeFakeSupabase({
    recipientRow: { campaign_id: "camp-1" },
    conversionError: { message: "talkx_conversion_value_exceeds_max" },
  });
  const req = await makePost({ action: "convert", recipient_id: "rec-1", external_ref: "pedido-x", value: 1e12 });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 422, `status ${res.status} != 422`);
  const body = await res.json();
  assert(!JSON.stringify(body).includes("exceeds_max"), `vazou texto do banco: ${JSON.stringify(body)}`);
});


// ── 2ª recusa, ponto 3: formato do token é função pura (sem DB, sem mock) ────
Deno.test("isWellFormedClickToken aceita só hex de 64 chars (puro, sem mock)", () => {
  assert(isWellFormedClickToken("0".repeat(64)) === true, "64 hex deveria aceitar");
  assert(isWellFormedClickToken("ABCDEF0123456789".repeat(4)) === true, "maiúsculas deveriam aceitar");
  assert(isWellFormedClickToken("rec-1") === false, "id cru não é token");
  assert(isWellFormedClickToken("") === false, "vazio não é token");
  assert(isWellFormedClickToken(undefined) === false, "ausente não é token");
  assert(isWellFormedClickToken("0".repeat(63)) === false, "63 chars não é token");
  assert(isWellFormedClickToken("0".repeat(65)) === false, "65 chars não é token");
  assert(isWellFormedClickToken("z".repeat(64)) === false, "não-hex não é token");
  assert(isWellFormedClickToken(12345) === false, "não-string não é token");
});

// ── 2ª recusa, ponto 2: fronteira 404 × 401 ──────────────────────────────────
// Slug desconhecido NUNCA dá 401 (nem com token bem formado nem com lixo);
// slug conhecido com token ruim dá 401 (testes acima). O RPC decide o 404 e
// nunca recebe o token.
Deno.test("GET slug inexistente com token bem formado devolve 404 (nunca 401)", async () => {
  const supabase = makeFakeSupabase({ linkClickResult: { error: "link_not_found" } });
  const token = await hmacHex(CONVERT_SECRET, "rec-qualquer");
  const req = new Request(`https://example.com/talkx-link?s=inexistente&r=${token}`, { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 404, `slug desconhecido deveria ser 404, veio ${res.status}`);
  assert(res.headers.get("location") === null, "não deveria redirecionar");
  const calls = clickRpcCalls(supabase);
  assert(calls.length === 1, `o RPC decide o 404 (chamadas=${calls.length})`);
  assert(calls[0].args.p_recipient === null, `token nunca chega ao RPC: ${JSON.stringify(calls[0].args)}`);
  assert(calls[0].args.p_recipient !== token, `o token opaco nunca chega ao postgres: ${JSON.stringify(calls[0].args)}`);
});

Deno.test("GET slug inexistente com r lixo devolve 404 (nunca 401)", async () => {
  const supabase = makeFakeSupabase({ linkClickResult: { error: "link_not_found" } });
  const req = new Request("https://example.com/talkx-link?s=inexistente&r=n%C3%A3o-%C3%A9-token", { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 404, `slug desconhecido com r lixo deveria ser 404, veio ${res.status}`);
  const calls = clickRpcCalls(supabase);
  assert(calls.length === 1, `o RPC decide o 404 (chamadas=${calls.length})`);
  assert(calls[0].args.p_recipient === null, `lixo nunca chega ao RPC: ${JSON.stringify(calls[0].args)}`);
});

// ── 2ª recusa, ponto 5: campanha sem recipients → clique anônimo, não 401 ────
// Com o slug conhecido mas zero recipients na campanha, não há a quem
// atribuir: o clique é gravado com p_recipient NULL (como no fluxo legado
// sem secret) e o link redireciona — 401 seria culpar o visitante por um
// estado vazio do servidor.
Deno.test("GET campanha sem recipients grava clique anônimo e redireciona (302)", async () => {
  const supabase = clickSupabase([]);
  const token = await hmacHex(CONVERT_SECRET, "rec-ainda-nao-importado");
  const req = new Request(`https://example.com/talkx-link?s=abc123&r=${token}`, { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 302, `sem recipients deveria redirecionar anônimo, veio ${res.status}`);
  const calls = clickRpcCalls(supabase);
  assert(calls.length === 1, `deveria gravar 1 clique anônimo (chamadas=${calls.length})`);
  assert(calls[0].args.p_recipient === null, `clique anônimo leva NULL, nunca o token: ${JSON.stringify(calls[0].args)}`);
  const location = res.headers.get("location") ?? "";
  assert(location.startsWith("https://loja.com/checkout"), `redirect errado: ${location}`);
  assert(new URL(location).searchParams.get("utm_source") === "whatsapp", `UTM da linha pré-carregada ausente: ${location}`);
});

// ── 2ª recusa, ponto 1: varredura limitada (teto de páginas) ─────────────────
// 10_001 recipients sem par: a resolução nega (401 sem clique) lendo no
// máximo MAX_PAGES páginas — sem o teto, leria as 11.
Deno.test("GET limita a varredura ao teto de páginas e nega sem clicar", async () => {
  const total = CLICK_TOKEN_SCAN_PAGE_SIZE * CLICK_TOKEN_SCAN_MAX_PAGES + 1;
  const ids = Array.from({ length: total }, (_, i) => `rec-lote-${String(i).padStart(5, "0")}`);
  let rangeCalls = 0;
  const supabase = clickSupabase(ids, "camp-1", {
    onRange: (table) => { if (table === "talkx_recipients") rangeCalls++; },
  });
  const token = await hmacHex(CONVERT_SECRET, "rec-fora-da-base");
  const req = new Request(`https://example.com/talkx-link?s=abc123&r=${token}`, { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv() });
  assert(res.status === 401, `além do teto deveria negar, veio ${res.status}`);
  assert(rangeCalls === CLICK_TOKEN_SCAN_MAX_PAGES, `varredura deveria parar no teto (páginas=${rangeCalls})`);
  assert(clickRpcCalls(supabase).length === 0, "negação não grava clique");
});
