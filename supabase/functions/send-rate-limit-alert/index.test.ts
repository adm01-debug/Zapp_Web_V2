// R2-API-022 (P1) — gate de autorização do send-rate-limit-alert.
//
// Aceite: segredo INTERNAL_ALERT_SECRET ausente/vazio/incorreto → 401 sem
// nenhuma escrita via service-role (zero from()); segredo correto → 200 e
// o alerta é gravado. A comparação do segredo é em tempo constante e o gate
// roda ANTES de criar o cliente service-role ou de confiar em ip/count/blocked.
import { handleRateLimitAlert } from "./index.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function makePost(opts: { headers?: Record<string, string>; body?: unknown } = {}) {
  return new Request("https://edge.invalid/send-rate-limit-alert", {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
    body: JSON.stringify(opts.body ?? {
      ip_address: "203.0.113.7",
      endpoint: "/api/teste",
      request_count: 42,
      blocked: false,
    }),
  });
}

// Cliente service-role (usado SÓ depois da autorização) com contagem de tabelas.
function serviceMock(opts: { admins?: unknown[] } = {}) {
  const fromCalls: string[] = [];
  const makeBuilder = (_table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
      update: () => builder,
      select: () => builder,
      eq: () => builder,
      lt: () => builder,
      // thenable: await .from("user_roles").select("user_id").eq("role","admin")
      then: (resolve: (v: unknown) => void) => resolve({ data: opts.admins ?? [], error: null }),
    };
    return builder;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = {
    from: (table: string) => {
      fromCalls.push(table);
      return makeBuilder(table);
    },
  };
  return { supabase, fromCalls };
}

Deno.test("alerta: segredo ausente → 401 e zero escrita service-role", async () => {
  const mock = serviceMock();
  const res = await handleRateLimitAlert(makePost(), { supabase: mock.supabase, internalSecret: "" });
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  assert(mock.fromCalls.length === 0, `from() não deveria ser chamado: ${JSON.stringify(mock.fromCalls)}`);
});

Deno.test("alerta: segredo vazio com header presente → 401 (falha fechada)", async () => {
  const mock = serviceMock();
  const res = await handleRateLimitAlert(
    makePost({ headers: { "X-Internal-Secret": "qualquer" } }),
    { supabase: mock.supabase, internalSecret: "" },
  );
  assert(res.status === 401, `esperado 401 (falha fechada), recebido ${res.status}`);
  assert(mock.fromCalls.length === 0, `from() não deveria ser chamado: ${JSON.stringify(mock.fromCalls)}`);
});

Deno.test("alerta: segredo incorreto → 401 e zero escrita", async () => {
  const mock = serviceMock();
  const res = await handleRateLimitAlert(
    makePost({ headers: { "X-Internal-Secret": "errado" } }),
    { supabase: mock.supabase, internalSecret: "segredo" },
  );
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  assert(mock.fromCalls.length === 0, `from() não deveria ser chamado: ${JSON.stringify(mock.fromCalls)}`);
});

Deno.test("alerta: segredo correto → 200 e grava security_alerts", async () => {
  const mock = serviceMock();
  const res = await handleRateLimitAlert(
    makePost({ headers: { "X-Internal-Secret": "segredo" } }),
    { supabase: mock.supabase, internalSecret: "segredo" },
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(mock.fromCalls.includes("security_alerts"), `security_alerts deveria ser gravado: ${JSON.stringify(mock.fromCalls)}`);
  const body = await res.json();
  assert(body.success === true, `success esperado true: ${JSON.stringify(body)}`);
});

Deno.test("alerta: segredo correto + blocked → grava security_alerts, blocked_ips e notifications", async () => {
  const mock = serviceMock({ admins: [{ user_id: crypto.randomUUID() }] });
  const res = await handleRateLimitAlert(
    makePost({
      headers: { "X-Internal-Secret": "segredo" },
      body: { ip_address: "203.0.113.7", endpoint: "/api/teste", request_count: 99, blocked: true },
    }),
    { supabase: mock.supabase, internalSecret: "segredo" },
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(mock.fromCalls.includes("security_alerts"), "security_alerts deveria ser gravado");
  assert(mock.fromCalls.includes("blocked_ips"), "blocked_ips deveria ser gravado (blocked=true)");
  assert(mock.fromCalls.includes("notifications"), "notifications deveria ser gravado (admin presente)");
});

// ─── R2-API-056 (P2) — alerta de rate limit não apaga bloqueio permanente ───
//
// Fake do PostgREST para blocked_ips em memória, com a semântica real:
//   - upsert(payload, { onConflict, ignoreDuplicates }): insere se a chave
//     não existe; se existe, sobrescreve quando ignoreDuplicates=false e NÃO
//     toca quando ignoreDuplicates=true (ON CONFLICT DO NOTHING);
//   - update(patch).eq(col,v).lt(col,v): aplica o patch SÓ nas linhas que
//     casam TODOS os filtros (NULL não casa lt, como no Postgres).
// As demais tabelas resolvem como no serviceMock acima.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BlockedIpRow = Record<string, any> & { ip_address: string };

function serviceMockBlockedIps(
  initialRows: BlockedIpRow[] = [],
  opts: { admins?: unknown[] } = {},
) {
  const table = new Map<string, BlockedIpRow>();
  for (const r of initialRows) table.set(r.ip_address, { ...r });

  const makeBlockedIpsBuilder = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      upsert: (
        payload: BlockedIpRow,
        uopts: { onConflict?: string; ignoreDuplicates?: boolean } = {},
      ) => {
        const key = String(payload[uopts.onConflict ?? "ip_address"]);
        if (!table.has(key)) {
          table.set(key, { ...payload });
        } else if (!uopts.ignoreDuplicates) {
          table.set(key, { ...table.get(key), ...payload });
        }
        return Promise.resolve({ data: null, error: null });
      },
      update: (patch: Partial<BlockedIpRow>) => {
        const filters: Array<(row: BlockedIpRow) => boolean> = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const filtered: any = {
          eq: (col: string, val: unknown) => {
            filters.push((r) => r[col] === val);
            return filtered;
          },
          lt: (col: string, val: unknown) => {
            filters.push((r) => r[col] != null && String(r[col]) < String(val));
            return filtered;
          },
          then: (resolve: (v: unknown) => void) => {
            for (const [key, row] of table) {
              if (filters.every((f) => f(row))) {
                table.set(key, { ...row, ...patch });
              }
            }
            resolve({ data: null, error: null });
          },
        };
        return filtered;
      },
      insert: () => Promise.resolve({ data: null, error: null }),
      select: () => builder,
      eq: () => builder,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    };
    return builder;
  };

  const makeGenericBuilder = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
      select: () => b,
      eq: () => b,
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: opts.admins ?? [], error: null }),
    };
    return b;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = {
    from: (t: string) =>
      t === "blocked_ips" ? makeBlockedIpsBuilder() : makeGenericBuilder(),
  };
  return { supabase, table };
}

function reqBlocked(ip: string) {
  return makePost({
    headers: { "X-Internal-Secret": "segredo" },
    body: {
      ip_address: ip,
      endpoint: "/api/login",
      request_count: 120,
      blocked: true,
    },
  });
}

Deno.test("blocked_ips: alerta NÃO sobrescreve bloqueio permanente (motivo/autoria preservados)", async () => {
  const blockedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const adminRow: BlockedIpRow = {
    ip_address: "203.0.113.9",
    reason: "Bloqueio administrativo",
    blocked_at: blockedAt,
    expires_at: null,
    is_permanent: true,
    request_count: 7,
    last_attempt_at: blockedAt,
  };
  const mock = serviceMockBlockedIps([adminRow]);

  const res = await handleRateLimitAlert(
    reqBlocked(adminRow.ip_address),
    { supabase: mock.supabase, internalSecret: "segredo" },
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);

  const final = mock.table.get(adminRow.ip_address);
  assert(final, "linha do bloqueio permanente deveria continuar existindo");
  assert(final.is_permanent === true, `is_permanent deveria continuar true: ${JSON.stringify(final)}`);
  assert(final.expires_at === null, `expires_at deveria continuar null: ${JSON.stringify(final)}`);
  assert(final.reason === "Bloqueio administrativo", `reason deveria ser preservado: ${final.reason}`);
  assert(final.blocked_at === blockedAt, `blocked_at deveria ser preservado: ${final.blocked_at}`);
  assert(final.request_count === 7, `request_count deveria ser preservado: ${final.request_count}`);
});

Deno.test("blocked_ips: alerta NÃO reduz prazo de bloqueio temporário mais longo", async () => {
  const blockedAt = new Date(Date.now() - 60 * 1000).toISOString();
  const longExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const row: BlockedIpRow = {
    ip_address: "203.0.113.10",
    reason: "Bloqueio manual de 1h",
    blocked_at: blockedAt,
    expires_at: longExpiry,
    is_permanent: false,
    request_count: 3,
    last_attempt_at: blockedAt,
  };
  const mock = serviceMockBlockedIps([row]);

  const res = await handleRateLimitAlert(
    reqBlocked(row.ip_address),
    { supabase: mock.supabase, internalSecret: "segredo" },
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);

  const final = mock.table.get(row.ip_address);
  assert(final, "linha deveria continuar existindo");
  assert(final.is_permanent === false, `is_permanent deveria continuar false: ${JSON.stringify(final)}`);
  assert(
    final.expires_at === longExpiry,
    `expires_at não deveria ser reduzido de ${longExpiry}: ${final.expires_at}`,
  );
  assert(final.reason === "Bloqueio manual de 1h", `reason deveria ser preservado: ${final.reason}`);
});

Deno.test("blocked_ips: sem linha → alerta cria bloqueio temporário de ~15min", async () => {
  const mock = serviceMockBlockedIps([]);
  const before = Date.now();

  const res = await handleRateLimitAlert(
    reqBlocked("203.0.113.11"),
    { supabase: mock.supabase, internalSecret: "segredo" },
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);

  assert(mock.table.size === 1, `deveria existir exatamente 1 linha: ${mock.table.size}`);
  const row = mock.table.get("203.0.113.11");
  assert(row, "linha do IP deveria existir");
  assert(row.is_permanent === false, `bloqueio automático deveria ser temporário: ${JSON.stringify(row)}`);
  const exp = Date.parse(row.expires_at);
  const expected = before + 15 * 60 * 1000;
  assert(
    Math.abs(exp - expected) < 60 * 1000,
    `expires_at deveria ser ~agora+15min (${new Date(expected).toISOString()}), recebido ${row.expires_at}`,
  );
});
