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
