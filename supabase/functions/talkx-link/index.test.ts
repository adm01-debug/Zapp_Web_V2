import { handleTalkxLink, mergeUtm } from "./index.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { encodeTalkxRecipientToken } from "../_shared/talkx-tracking-token.ts";

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

// ── [refazer 1+2] GET com token opaco (?r=<token>) ──────────────────────────
// O token é montado literalmente aqui (o teste NÃO importa função do
// handler): UUID cifrado com máscara SHA-256(secret + "|talkx-track-enc-v1")
// + MAC HMAC-SHA256(secret, "talkx-track-v1" + cifra) truncada em 8 bytes,
// 24 bytes em base64url (32 chars). É uma implementação INDEPENDENTE do
// mesmo contrato — se o talkx-send assinar outro payload, o teste de token
// válido falha. É isso que prova o contrato entre as duas funções.
const TRACKING_SECRET = "test-convert-secret";
const TOKEN_UUID_A = "11111111-1111-4111-8111-111111111111";
const TOKEN_UUID_B = "22222222-2222-4222-8222-222222222222";

function uuidBytesForTest(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function b64urlForTest(bytes: Uint8Array): string {
  const bin = Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytesForTest(token: string): Uint8Array {
  const padded = token.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (token.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function trackingTokenForTest(secret: string, recipientId: string): Promise<string> {
  const uuid = uuidBytesForTest(recipientId);
  const maskFull = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret + "|talkx-track-enc-v1")),
  );
  const cipher = new Uint8Array(16);
  for (let i = 0; i < 16; i++) cipher[i] = uuid[i] ^ maskFull[i];
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const domain = new TextEncoder().encode("talkx-track-v1");
  const payload = new Uint8Array(domain.length + 16);
  payload.set(domain, 0);
  payload.set(cipher, domain.length);
  const tag = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload)).slice(0, 8);
  const token = new Uint8Array(24);
  token.set(cipher, 0);
  token.set(tag, 16);
  return b64urlForTest(token);
}

// Fake O(1): recipients por id (point lookup). Qualquer tentativa de
// varredura (.eq("campaign_id", ...) + lista, o padrão O(N) recusado)
// estoura — se o handler voltar a varrer, estes testes quebram.
function makeTokenFake(opts: {
  link?: Record<string, unknown> | null;
  recipientIds?: string[];
  recipients?: Record<string, string>;
  clickResult?: unknown;
  seen?: Array<{ fn: string; args: Record<string, unknown> }>;
}) {
  const seen = opts.seen ?? [];
  const queries: Array<{ table: string; col: string; val: unknown }> = [];
  const byId = new Map<string, string>();
  for (const id of opts.recipientIds ?? []) byId.set(id, "camp-1");
  for (const [id, camp] of Object.entries(opts.recipients ?? {})) byId.set(id, camp);
  const supabase = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      seen.push({ fn, args });
      if (fn === "record_talkx_link_click") return { data: opts.clickResult, error: null };
      return { data: null, error: { message: `rpc inesperada: ${fn}` } };
    },
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (col: string, val: unknown) => ({
          maybeSingle: async () => {
            queries.push({ table, col, val });
            if (table === "talkx_links") return { data: opts.link ?? null, error: null };
            if (table === "talkx_recipients" && col === "id") {
              const id = String(val);
              const camp = byId.get(id);
              if (!camp) return { data: null, error: null };
              return { data: { id, campaign_id: camp }, error: null };
            }
            return { data: null, error: { message: `maybeSingle inesperado: ${table}.${col}` } };
          },
          then: (_onF: (v: unknown) => void, _onR?: (e: unknown) => void) => {
            throw new Error(
              `varredura O(N) proibida: ${table}.eq(${col}) com lista — use point lookup por id`,
            );
          },
        }),
      }),
    }),
  };
  return { supabase: supabase as unknown as SupabaseClient, seen, queries };
}

function tokenLinkRow() {
  return {
    id: "link-1",
    campaign_id: "camp-1",
    utm_source: "whatsapp",
    utm_medium: "talkx",
    utm_campaign: "promo",
    utm_content: null,
    utm_term: null,
  };
}

Deno.test("GET com token válido resolve o destinatário e registra o clique atribuído", async () => {
  const token = await trackingTokenForTest(TRACKING_SECRET, TOKEN_UUID_A);
  const { supabase, seen } = makeTokenFake({
    link: tokenLinkRow(),
    recipientIds: [TOKEN_UUID_A, TOKEN_UUID_B],
    clickResult: { target_url: "https://loja.com/checkout", link_id: "link-1" },
  });
  const req = new Request(`https://example.com/talkx-link?s=promo&r=${token}`, { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv({ TALKX_CONVERT_SECRET: TRACKING_SECRET }) });
  assert(res.status === 302, `token válido deve redirecionar, status ${res.status}`);
  const click = seen.find((c) => c.fn === "record_talkx_link_click");
  assert(click !== undefined, "o clique deveria ser registrado na RPC");
  assert(click.args.p_recipient === TOKEN_UUID_A, `clique deve ser atribuído ao dono do token, recebido: ${JSON.stringify(click.args)}`);
  assert(click.args.p_slug === "promo", "o slug deve seguir para a RPC");
});

Deno.test("GET com token adulterado NÃO atribui a ninguém (segue anônimo, sem quebrar)", async () => {
  const valid = await trackingTokenForTest(TRACKING_SECRET, TOKEN_UUID_A);
  const tampered = valid.slice(0, -1) + (valid.endsWith("A") ? "B" : "A");
  const { supabase, seen } = makeTokenFake({
    link: tokenLinkRow(),
    recipientIds: [TOKEN_UUID_A, TOKEN_UUID_B],
    clickResult: { target_url: "https://loja.com/checkout", link_id: "link-1" },
  });
  const req = new Request(`https://example.com/talkx-link?s=promo&r=${tampered}`, { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv({ TALKX_CONVERT_SECRET: TRACKING_SECRET }) });
  assert(res.status === 302, `redirect não pode quebrar por token forjado, status ${res.status}`);
  const click = seen.find((c) => c.fn === "record_talkx_link_click");
  assert(click !== undefined, "o clique deveria ser registrado na RPC");
  assert(click.args.p_recipient === null, `token forjado não pode atribuir clique a ninguém, recebido: ${JSON.stringify(click.args)}`);
});

Deno.test("GET com r=UUID legado continua atribuindo direto (links já enviados)", async () => {
  const { supabase, seen } = makeTokenFake({
    clickResult: { target_url: "https://loja.com/checkout", link_id: "link-1" },
  });
  const req = new Request(`https://example.com/talkx-link?s=promo&r=${TOKEN_UUID_A}`, { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv({ TALKX_CONVERT_SECRET: TRACKING_SECRET }) });
  assert(res.status === 302, `UUID legado deve redirecionar, status ${res.status}`);
  const click = seen.find((c) => c.fn === "record_talkx_link_click");
  assert(click !== undefined, "o clique deveria ser registrado na RPC");
  assert(click.args.p_recipient === TOKEN_UUID_A, `UUID legado deve ir direto para a RPC, recebido: ${JSON.stringify(click.args)}`);
});

Deno.test("GET com token mas sem segredo configurado NÃO atribui (anônimo)", async () => {
  const token = await trackingTokenForTest(TRACKING_SECRET, TOKEN_UUID_A);
  const { supabase, seen } = makeTokenFake({
    link: tokenLinkRow(),
    recipientIds: [TOKEN_UUID_A],
    clickResult: { target_url: "https://loja.com/checkout", link_id: "link-1" },
  });
  const req = new Request(`https://example.com/talkx-link?s=promo&r=${token}`, { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv({ TALKX_CONVERT_SECRET: "" }) });
  assert(res.status === 302, `sem segredo o redirect não pode quebrar, status ${res.status}`);
  const click = seen.find((c) => c.fn === "record_talkx_link_click");
  assert(click !== undefined, "o clique deveria ser registrado na RPC");
  assert(click.args.p_recipient === null, `sem segredo nenhum token pode atribuir, recebido: ${JSON.stringify(click.args)}`);
});

// ── [refazer 2.2] além de UMA página: 1500 destinatários, sem varredura ─────
// O fake guarda 1500 recipients mas só responde point lookup por id; se o
// handler tentar listar (.eq("campaign_id") + then), o fake estoura. O token
// do primeiro resolve com 3 point lookups (link por slug, recipient por id,
// link por id p/ track) — prova que o custo por clique não depende de N.
Deno.test("GET resolve com 1500 destinatários sem varredura (só point lookups)", async () => {
  const ids: string[] = [TOKEN_UUID_A, TOKEN_UUID_B];
  for (let i = 0; i < 1498; i++) {
    const tail = String(i).padStart(12, "0");
    ids.push(`33333333-3333-4333-8333-${tail}`);
  }
  const token = await trackingTokenForTest(TRACKING_SECRET, TOKEN_UUID_A);
  const { supabase, seen, queries } = makeTokenFake({
    link: tokenLinkRow(),
    recipientIds: ids,
    clickResult: { target_url: "https://loja.com/checkout", link_id: "link-1" },
  });
  const req = new Request(`https://example.com/talkx-link?s=promo&r=${token}`, { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv({ TALKX_CONVERT_SECRET: TRACKING_SECRET }) });
  assert(res.status === 302, `com 1500 recipients deve redirecionar, status ${res.status}`);
  const click = seen.find((c) => c.fn === "record_talkx_link_click");
  assert(click !== undefined, "o clique deveria ser registrado na RPC");
  assert(click.args.p_recipient === TOKEN_UUID_A, `deve atribuir ao dono do token, recebido: ${JSON.stringify(click.args)}`);
  assert(queries.length === 3, `só 3 point lookups (link por slug, recipient por id, link por id), vieram ${queries.length}: ${JSON.stringify(queries)}`);
  assert(
    queries[1].table === "talkx_recipients" && queries[1].col === "id",
    `o lookup de recipient deve ser por id, veio: ${JSON.stringify(queries[1])}`,
  );
  assert(
    queries.every((q) => q.col === "slug" || q.col === "id"),
    `nenhum lookup pode ser varredura por campaign_id: ${JSON.stringify(queries)}`,
  );
});

// ── contrato ponta a ponta: implementação independente == código real ──────
// trackingTokenForTest (acima) é uma implementação INDEPENDENTE do contrato;
// encodeTalkxRecipientToken é o código real usado pelo talkx-send. Se um dia
// divergirem, este teste quebra — e com ele a prova de que o token válido
// do teste "GET com token válido..." representa o que o envio gera.
Deno.test("token do teste == token real do talkx-send (contrato único)", async () => {
  for (const uuid of [TOKEN_UUID_A, TOKEN_UUID_B]) {
    const mirror = await trackingTokenForTest(TRACKING_SECRET, uuid);
    const real = await encodeTalkxRecipientToken(uuid, TRACKING_SECRET);
    assert(real === mirror, `contrato divergiu para ${uuid}: real=${real} espelho=${mirror}`);
  }
});
// O token é válido (MAC passa) mas o recipient pertence a camp-2 e o link é
// da camp-1: o clique segue anônimo, nunca atribuído à campanha errada.
// ── [refazer 2.2] token de OUTRA campanha: p_recipient null ──────────────────
Deno.test("GET com token de outra campanha NÃO atribui (p_recipient null)", async () => {
  const token = await trackingTokenForTest(TRACKING_SECRET, TOKEN_UUID_B);
  const { supabase, seen } = makeTokenFake({
    link: tokenLinkRow(),
    recipients: { [TOKEN_UUID_A]: "camp-1", [TOKEN_UUID_B]: "camp-2" },
    clickResult: { target_url: "https://loja.com/checkout", link_id: "link-1" },
  });
  const req = new Request(`https://example.com/talkx-link?s=promo&r=${token}`, { method: "GET" });
  const res = await handleTalkxLink(req, { supabase, env: makeEnv({ TALKX_CONVERT_SECRET: TRACKING_SECRET }) });
  assert(res.status === 302, `redirect não pode quebrar por campanha errada, status ${res.status}`);
  const click = seen.find((c) => c.fn === "record_talkx_link_click");
  assert(click !== undefined, "o clique deveria ser registrado na RPC");
  assert(click.args.p_recipient === null, `token de outra campanha não pode atribuir, recebido: ${JSON.stringify(click.args)}`);
});
