/**
 * X034 — integração do motor com provedor falso, contra Postgres descartável
 * (migrations reais aplicadas) e PostgREST local.
 *
 * O arranjo (Postgres descartável + migrations + PostgREST) é o MESMO de
 * scripts/db-audit/talkx-transition-postgrest.test.ts; o harness que sobe o
 * banco é scripts/db-audit/talkx-engine-provider.test.sh.
 *
 * Diferença central para os testes Deno do talkx-send: aqui o handler REAL
 * (`handleTalkxSend`) roda contra banco e PostgREST de verdade, com dezenas de
 * destinatários, enquanto o provedor Evolution é o `fake-evolution.ts` local —
 * o provedor de produção NUNCA é endereçado.
 *
 * O arquivo é lido pelo gate Deno (`supabase/functions/**'/\*.test.ts`) mesmo sem
 * as variáveis do harness: nesse caso registra um único teste ignorado, então o
 * gate segue verde. Com TALKX_ENGINE_POSTGREST_URL e TALKX_ENGINE_JWT definidos
 * (pelo harness), roda a integração completa.
 */
import { handleTalkxSend } from "./index.ts";
import { createFakeEvolution, type FakeEvolution } from "../_shared/__tests__/fake-evolution.ts";

const pgrest = Deno.env.get("TALKX_ENGINE_POSTGREST_URL");
const jwt = Deno.env.get("TALKX_ENGINE_JWT");
const anonJwt = Deno.env.get("TALKX_ENGINE_ANON_JWT") ?? "";
const enabled = Boolean(pgrest && jwt);

// ---- ids determinísticos semeados pelo harness -----------------------------
const C1 = "40000000-0000-4000-8000-000000000001"; // 60 destinatários / 3 invocações
const C2 = "40000000-0000-4000-8000-000000000002"; // morte simulada + sweep
const C3 = "40000000-0000-4000-8000-000000000003"; // worker antigo vivo
const C4 = "40000000-0000-4000-8000-000000000004"; // suprimido no meio
const C5 = "40000000-0000-4000-8000-000000000005"; // limite diário
const C6 = "40000000-0000-4000-8000-000000000006"; // cancelamento no meio
const C7 = "40000000-0000-4000-8000-000000000007"; // agente tentando agendar

function rid(n: number): string {
  return `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

// Telefones registrados no provedor falso ao longo de TODO o arquivo — a
// asserção final prova que nenhum número recebeu duas vezes.
const todosOsTelefones: string[] = [];

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} — esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);
  }
}

// ---- cliente HTTP cru contra o PostgREST (asserções e fixtures) ------------
function serviceHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: jwt as string,
    Authorization: `Bearer ${jwt}`,
    ...extra,
  };
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${pgrest}${path}`, {
    ...init,
    headers: { ...serviceHeaders(), ...((init.headers as Record<string, string>) ?? {}) },
  });
}

async function restJson<T>(path: string): Promise<T> {
  const res = await rest(path);
  if (!res.ok) throw new Error(`GET ${path} respondeu ${res.status}: ${await res.text()}`);
  return await res.json() as T;
}

async function rpcService(name: string, args: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  const res = await rest(`/rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
  const text = await res.text();
  return { status: res.status, body: text.length ? JSON.parse(text) : null };
}

async function patchRecipients(query: string, body: Record<string, unknown>): Promise<void> {
  const res = await rest(`/talkx_recipients?${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH talkx_recipients?${query} respondeu ${res.status}: ${await res.text()}`);
}

async function patchSetting(key: string, value: unknown): Promise<void> {
  const res = await rest(`/talkx_settings?key=eq.${key}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`PATCH talkx_settings ${key} respondeu ${res.status}: ${await res.text()}`);
}

/** Contadores de status dos destinatários de uma campanha. */
async function statusCounts(campaignId: string): Promise<Record<string, number>> {
  const rows = await restJson<Array<{ status: string }>>(
    `/talkx_recipients?campaign_id=eq.${campaignId}&select=status&limit=1000`,
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}

async function campaignRow(id: string): Promise<{ status: string; pause_reason: string | null; sent_count: number; outcome_unknown_count: number }> {
  const rows = await restJson<Array<{ status: string; pause_reason: string | null; sent_count: number; outcome_unknown_count: number }>>(
    `/talkx_campaigns?id=eq.${id}&select=status,pause_reason,sent_count,outcome_unknown_count`,
  );
  assert(rows.length === 1, `campanha ${id} não encontrada`);
  return rows[0];
}

// ---- proxy: supabase-js fala `/rest/v1/*`; o PostgREST serve a raiz ---------
function startProxy(target: string): Deno.HttpServer {
  return Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    const u = new URL(req.url);
    if (!u.pathname.startsWith("/rest/v1")) {
      return new Response(JSON.stringify({ message: "proxy: rota não suportada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const rest = u.pathname.slice("/rest/v1".length) || "/";
    const headers = new Headers(req.headers);
    headers.delete("host");
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const res = await fetch(`${target}${rest}${u.search}`, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
    });
    const out = new Headers(res.headers);
    out.delete("content-encoding");
    out.delete("content-length");
    return new Response(res.body, { status: res.status, headers: out });
  });
}

function proxyUrl(server: Deno.HttpServer): string {
  const addr = server.addr;
  if (addr.transport !== "tcp") throw new Error("proxy: esperado listener TCP");
  return `http://127.0.0.1:${addr.port}`;
}

/** Chama o handler REAL com o corpo dado (service key ⇒ sem auth de usuário). */
async function callSend(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const req = new Request("https://edge.test/talkx-send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(body),
  });
  const res = await handleTalkxSend(req);
  const text = await res.text();
  return { __status: res.status, ...(text.length ? JSON.parse(text) : {}) };
}

/** Sobe fake + proxy, aponta o ambiente e devolve um runner com cleanup. */
async function withProvider(
  fn: (fake: FakeEvolution, runContinue: (campaignId: string) => Promise<Record<string, unknown>>) => Promise<void>,
): Promise<void> {
  const fake = createFakeEvolution();
  const proxy = startProxy(pgrest as string);
  Deno.env.set("SUPABASE_URL", proxyUrl(proxy));
  Deno.env.set("EVOLUTION_API_URL", fake.url);
  try {
    await fn(fake, (campaignId) => callSend({ action: "continue", campaignId }));
  } finally {
    await proxy.shutdown();
    await fake.stop();
  }
}

/** Consolida os telefones vistos no fake para a asserção final. */
function coletarTelefones(fake: FakeEvolution): string[] {
  const phones = fake.messagePosts().map((p) => String(p.body.number ?? ""));
  todosOsTelefones.push(...phones);
  return phones;
}

if (!enabled) {
  Deno.test({
    name: "X034 engine.integration: ignorado sem TALKX_ENGINE_POSTGREST_URL/TALKX_ENGINE_JWT (rode scripts/db-audit/talkx-engine-provider.test.sh)",
    ignore: true,
    fn() {},
  });
} else {
  // Ambiente estático do handler (o provedor de PRODUÇÃO nunca é endereçado).
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", jwt as string);
  Deno.env.set("EVOLUTION_API_KEY", "test-evolution-api-key");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  Deno.env.set("EVOLUTION_INSTANCE_TOKEN", "test-instance-token");
  Deno.env.set("EVOLUTION_INSTANCE_NAME", "PRINCIPAL");
  Deno.env.set("TALKX_BATCH_SIZE", "20");

  Deno.test("60 destinatários em 3 invocações continue", async () => {
    await withProvider(async (fake, runContinue) => {
      const inv1 = await runContinue(C1);
      assertEqual(inv1.processed, 20, "invocação 1: processados");
      assertEqual(inv1.sent, 20, "invocação 1: enviados");

      // Libera a 2ª leva (retry_after futuro → liberado por id).
      await patchRecipients(`campaign_id=eq.${C1}&id=gte.${rid(21)}&id=lte.${rid(40)}`, { retry_after: null });
      const inv2 = await runContinue(C1);
      assertEqual(inv2.processed, 20, "invocação 2: processados");

      await patchRecipients(`campaign_id=eq.${C1}&id=gte.${rid(41)}&id=lte.${rid(60)}`, { retry_after: null });
      const inv3 = await runContinue(C1);
      assertEqual(inv3.processed, 20, "invocação 3: processados");
      assertEqual(inv3.completed, true, "invocação 3 deveria concluir a campanha");

      const counts = await statusCounts(C1);
      assertEqual(counts.sent ?? 0, 60, "destinatários sent");
      const soma = (counts.sent ?? 0) + (counts.failed ?? 0) + (counts.skipped ?? 0)
        + (counts.outcome_unknown ?? 0) + (counts.cancelled ?? 0);
      assertEqual(soma, 60, "sent + failed + skipped + outcome_unknown + cancelled");

      const phones = coletarTelefones(fake);
      assertEqual(phones.length, 60, "POSTs de mensagem ao provedor falso");
      assertEqual(new Set(phones).size, phones.length, "0 telefone repetido no provedor falso");
    });
  });

  Deno.test("morte simulada entre dispatch_started e record_sent, seguida do sweep", async () => {
    // Emula a queda no meio: claim + mark_dispatch_started reais, SEM record,
    // com o lease vencendo. O sweep real vira o destinatário outcome_unknown.
    const claim = await rpcService("claim_talkx_recipient", {
      p_campaign_id: C2,
      p_recipient_id: rid(61),
      p_worker: "dead-worker",
      p_lease_seconds: 90,
    });
    assertEqual(claim.status, 200, "claim");
    const token = Array.isArray(claim.body) ? (claim.body[0] as { claim_token?: string })?.claim_token : undefined;
    assert(typeof token === "string" && token.length > 0, "claim deveria devolver claim_token");

    const mark = await rpcService("mark_talkx_recipient_dispatch_started", {
      p_recipient_id: rid(61),
      p_claim_token: token,
    });
    assert(mark.status < 300, `mark dispatch started falhou: HTTP ${mark.status} ${JSON.stringify(mark.body)}`);

    await patchRecipients(`id=eq.${rid(61)}`, {
      delivery_claim_expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const swept = await rpcService("sweep_talkx_stuck_recipients", { p_limit: 500 });
    assertEqual(swept.status, 200, "sweep");
    assertEqual(Number(swept.body), 1, "o sweep deveria pegar 1 destinatário preso");

    const counts = await statusCounts(C2);
    assertEqual(counts.outcome_unknown ?? 0, 1, "destinatário preso vira outcome_unknown");
    assertEqual((await campaignRow(C2)).outcome_unknown_count, 1, "contador da campanha");
  });

  Deno.test("pausa e retomada com o worker antigo ainda vivo (CAP-102)", async () => {
    await withProvider(async (fake, runContinue) => {
      const lease = await rpcService("claim_talkx_campaign_worker", {
        p_campaign_id: C3,
        p_worker: "old-worker",
        p_lease_seconds: 90,
      });
      assertEqual(lease.body, true, "o worker antigo deveria obter o lease");

      const bloqueado = await runContinue(C3);
      assertEqual(bloqueado.skipped, "worker_alive", "uma invocação nova não pode roubar o lease vivo");
      assertEqual(bloqueado.processed, 0, "nenhum destinatário processado com o worker antigo vivo");
      assertEqual(fake.messagePosts().length, 0, "nenhum POST ao provedor enquanto o worker antigo vive");

      await rpcService("release_talkx_campaign_worker", { p_campaign_id: C3, p_worker: "old-worker" });

      const paused = await callSend({ action: "pause", campaignId: C3, reason: "manual" });
      assertEqual(paused.status, "paused", "pausa");
      const resumed = await callSend({ action: "start", campaignId: C3 });
      assertEqual(resumed.accepted, true, "retomada");
      assertEqual((await campaignRow(C3)).status, "sending", "campanha retomada");

      const inv = await runContinue(C3);
      assertEqual(inv.processed, 2, "retomada processa a fila");
      coletarTelefones(fake);
    });
  });

  Deno.test("suprimido no meio do lote não recebe POST", async () => {
    await withProvider(async (fake, runContinue) => {
      const inv = await runContinue(C4);
      assertEqual(inv.processed, 4, "processados");
      const counts = await statusCounts(C4);
      assertEqual(counts.sent ?? 0, 3, "enviados");
      assertEqual(counts.skipped ?? 0, 1, "pulados por supressão");
      assertEqual(fake.messagePosts().length, 3, "só 3 POSTs: nenhum para o contato suprimido");
      coletarTelefones(fake);
    });
  });

  Deno.test("limite diário pausa a campanha no meio da fila", async () => {
    // Teto = envios de hoje na conexão + 2: os 2 primeiros saem, o 3º pausa.
    const budget = await rpcService("talkx_connection_send_budget", {
      p_connection_id: "90000000-0000-4000-8000-000000000001",
    });
    assertEqual(budget.status, 200, "orçamento da conexão");
    const daySent = Number((budget.body as { day_sent?: number })?.day_sent ?? 0);
    await patchSetting("daily_limit_per_connection", daySent + 2);
    try {
      await withProvider(async (fake, runContinue) => {
        const inv = await runContinue(C5);
        assertEqual(inv.processed, 2, "processados até o limite diário");
        const camp = await campaignRow(C5);
        assertEqual(camp.status, "paused", "campanha pausada");
        assertEqual(camp.pause_reason, "daily_limit", "motivo da pausa");
        const counts = await statusCounts(C5);
        assertEqual(counts.sent ?? 0, 2, "enviados");
        assertEqual(counts.pending ?? 0, 2, "pendentes restantes");
        assertEqual(fake.messagePosts().length, 2, "2 POSTs ao provedor");
        coletarTelefones(fake);
      });
    } finally {
      await patchSetting("daily_limit_per_connection", 1000);
    }
  });

  Deno.test("cancelamento no meio encerra os pendentes", async () => {
    await withProvider(async (fake, runContinue) => {
      const inv = await runContinue(C6);
      assertEqual(inv.processed, 2, "processados antes de cancelar");

      const cancel = await callSend({ action: "cancel", campaignId: C6 });
      assertEqual(cancel.status, "cancelled", "cancelamento");

      const counts = await statusCounts(C6);
      assertEqual(counts.sent ?? 0, 2, "enviados");
      assertEqual(counts.cancelled ?? 0, 2, "pendentes viram cancelled");
      const soma = (counts.sent ?? 0) + (counts.failed ?? 0) + (counts.skipped ?? 0)
        + (counts.outcome_unknown ?? 0) + (counts.cancelled ?? 0);
      assertEqual(soma, 4, "soma dos terminais");
      assertEqual(fake.messagePosts().length, 2, "cancelar não dispara novos POSTs");
      coletarTelefones(fake);
    });
  });

  Deno.test("agente (authenticated sem papel) não consegue agendar", async () => {
    assert(anonJwt.length > 0, "TALKX_ENGINE_ANON_JWT deveria estar definido pelo harness");
    const res = await fetch(`${pgrest}/rpc/transition_talkx_campaign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonJwt, Authorization: `Bearer ${anonJwt}` },
      body: JSON.stringify({ p_campaign_id: C7, p_action: "start" }),
    });
    assert(res.status >= 400, `o agente deveria ser recusado, veio HTTP ${res.status}`);
    assertEqual((await campaignRow(C7)).status, "draft", "a campanha não pode ter saído de draft");
  });

  Deno.test("asserção final: 0 telefone repetido no provedor falso", () => {
    assert(todosOsTelefones.length >= 60, `esperava ao menos 60 POSTs de mensagem, obtive ${todosOsTelefones.length}`);
    assertEqual(
      new Set(todosOsTelefones).size,
      todosOsTelefones.length,
      "0 telefone repetido no provedor falso ao longo de toda a integração",
    );
  });
}
