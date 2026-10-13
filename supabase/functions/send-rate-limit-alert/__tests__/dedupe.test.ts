// Deduplicação do alerta de rate limit (achado 13/10/2026 — auditoria 05-features-admin).
//
// Aceite:
//  1. 3 chamadas seguidas do mesmo (ip, endpoint) → 1 security_alert e 1 lote
//     de notifications (a 2ª e a 3ª atualizam request_count/last_seen_at);
//  2. escalada de gravidade (warning/medium → blocked/high) → nova notificação;
//  3. (ip, endpoint) diferente ou fora da janela → novo alerta.
import { handleRateLimitAlert } from "../index.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

interface AlertRow {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  ip_address: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>;
  is_resolved: boolean;
  created_at: string;
}

// Mock stateful do PostgREST para security_alerts, com a semântica que o
// handler usa: insert cria; select com eq/gte/order/limit filtra; update().eq()
// aplica o patch nas linhas que casam. user_roles devolve os admins;
// notifications guarda os lotes; blocked_ips responde sucesso (ou erro).
function statefulMock(opts: {
  admins?: { user_id: string }[];
  now: () => Date;
  blockError?: { message: string } | null;
} = { now: () => new Date() }) {
  const alerts: AlertRow[] = [];
  const notificationBatches: unknown[] = [];
  const fromCalls: string[] = [];

  const buildAlerts = () => {
    // Filtros acumulados por eq/gte na cadeia de select.
    const filters: Array<(row: AlertRow) => boolean> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      insert: (payload: Partial<AlertRow>) => {
        const row: AlertRow = {
          id: crypto.randomUUID(),
          alert_type: String(payload.alert_type ?? ""),
          severity: String(payload.severity ?? "medium"),
          title: String(payload.title ?? ""),
          description: String(payload.description ?? ""),
          ip_address: String(payload.ip_address ?? ""),
          metadata: (payload.metadata ?? {}) as Record<string, unknown>,
          is_resolved: false,
          created_at: payload.created_at ?? opts.now().toISOString(),
        };
        alerts.push(row);
        return Promise.resolve({ data: [row], error: null });
      },
      select: () => b,
      eq: (col: string, val: unknown) => {
        filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val);
        return b;
      },
      gte: (col: string, val: unknown) => {
        filters.push((r) => String((r as unknown as Record<string, unknown>)[col]) >= String(val));
        return b;
      },
      order: () => b,
      limit: () => b,
      then: (resolve: (v: unknown) => void) =>
        resolve({
          data: alerts.filter((a) => filters.every((f) => f(a))).map((a) => ({ ...a })),
          error: null,
        }),
      update: () => {
        const filters: Array<(row: AlertRow) => boolean> = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          eq: (col: string, val: unknown) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filters.push((r) => (r as any)[col] === val);
            return chain;
          },
          then: (resolve: (v: unknown) => void) => {
            for (const row of alerts) {
              if (filters.every((f) => f(row))) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Object.assign(row, (chain as any).patch ?? {});
              }
            }
            resolve({ data: null, error: null });
          },
        };
        return Object.assign(chain, { patch: undefined });
      },
    };
    // update(patch) precisa capturar o patch: reescrevemos o método com fechamento.
    const originalUpdate = b.update;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.update = (patch: Record<string, any>) => {
      const built = originalUpdate();
      built.patch = patch;
      return built;
    };
    return b;
  };

  const buildBlocked = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      upsert: () => Promise.resolve({ data: null, error: opts.blockError ?? null }),
      update: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {};
        chain.eq = () => chain;
        chain.lt = () => chain;
        chain.then = (resolve: (v: unknown) => void) =>
          resolve({ data: null, error: opts.blockError ?? null });
        return chain;
      },
    };
    return b;
  };

  const buildGeneric = (t: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: () => b,
      order: () => b,
      limit: () => b,
      insert: (payload: unknown) => {
        if (t === "notifications") notificationBatches.push(payload);
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: t === "user_roles" ? (opts.admins ?? []) : [], error: null }),
    };
    return b;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = {
    from: (t: string) => {
      fromCalls.push(t);
      if (t === "security_alerts") return buildAlerts();
      if (t === "blocked_ips") return buildBlocked();
      return buildGeneric(t);
    },
  };
  return { supabase, alerts, notificationBatches, fromCalls };
}

function req(ip: string, endpoint: string, requestCount: number, blocked: boolean) {
  return new Request("https://edge.invalid/send-rate-limit-alert", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Internal-Secret": "segredo" },
    body: JSON.stringify({ ip_address: ip, endpoint, request_count: requestCount, blocked }),
  });
}

const ADMIN = { user_id: "11111111-1111-1111-1111-111111111111" };

Deno.test("dedupe: 3 chamadas do mesmo (ip, endpoint) → 1 alerta e 1 lote de notifications", async () => {
  const clock = () => new Date("2026-10-13T12:00:00.000Z");
  const mock = statefulMock({ admins: [ADMIN], now: clock });

  for (const count of [10, 20, 30]) {
    const res = await handleRateLimitAlert(req("203.0.113.50", "/api/login", count, false), {
      supabase: mock.supabase,
      internalSecret: "segredo",
      now: clock,
    });
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  }

  assert(mock.alerts.length === 1, `deveria existir 1 alerta: ${mock.alerts.length}`);
  assert(
    mock.notificationBatches.length === 1,
    `deveria sair 1 lote de notifications: ${mock.notificationBatches.length}`,
  );
  const alert = mock.alerts[0];
  assert(
    alert.metadata.request_count === 30,
    `request_count deveria ser atualizado para 30: ${JSON.stringify(alert.metadata)}`,
  );
  assert(
    typeof alert.metadata.last_seen_at === "string",
    `last_seen_at deveria estar no metadata: ${JSON.stringify(alert.metadata)}`,
  );
  assert(alert.alert_type === "rate_limit_warning", `alert_type: ${alert.alert_type}`);
});

Deno.test("dedupe: escalada warning→blocked gera NOVA notificação e atualiza o alerta", async () => {
  const clock = () => new Date("2026-10-13T12:00:00.000Z");
  const mock = statefulMock({ admins: [ADMIN], now: clock, blockError: null });

  const first = await handleRateLimitAlert(req("203.0.113.51", "/api/login", 10, false), {
    supabase: mock.supabase,
    internalSecret: "segredo",
    now: clock,
  });
  assert(first.status === 200, `chamada 1: ${first.status}`);

  const second = await handleRateLimitAlert(req("203.0.113.51", "/api/login", 200, true), {
    supabase: mock.supabase,
    internalSecret: "segredo",
    now: clock,
  });
  assert(second.status === 200, `chamada 2: ${second.status}`);

  assert(mock.alerts.length === 1, `deveria continuar 1 alerta: ${mock.alerts.length}`);
  assert(
    mock.notificationBatches.length === 2,
    `escalada deveria notificar de novo (2 lotes): ${mock.notificationBatches.length}`,
  );
  const alert = mock.alerts[0];
  assert(alert.alert_type === "rate_limit_blocked", `alert_type: ${alert.alert_type}`);
  assert(alert.severity === "high", `severity: ${alert.severity}`);
});

Deno.test("dedupe: (ip, endpoint) diferente NÃO reaproveita o alerta aberto", async () => {
  const clock = () => new Date("2026-10-13T12:00:00.000Z");
  const mock = statefulMock({ admins: [ADMIN], now: clock });

  await handleRateLimitAlert(req("203.0.113.52", "/api/login", 10, false), {
    supabase: mock.supabase, internalSecret: "segredo", now: clock,
  });
  await handleRateLimitAlert(req("203.0.113.52", "/api/signup", 10, false), {
    supabase: mock.supabase, internalSecret: "segredo", now: clock,
  });

  assert(mock.alerts.length === 2, `endpoints diferentes → 2 alertas: ${mock.alerts.length}`);
  assert(
    mock.notificationBatches.length === 2,
    `cada alerta novo notifica: ${mock.notificationBatches.length}`,
  );
});

Deno.test("dedupe: alerta fora da janela (31 min) cria novo; dentro (29 min) atualiza", async () => {
  let virtual = new Date("2026-10-13T12:00:00.000Z");
  const clock = () => new Date(virtual.getTime());
  const mock = statefulMock({ admins: [ADMIN], now: clock });
  const deps = { supabase: mock.supabase, internalSecret: "segredo", now: clock, dedupeWindowMinutes: 30 };

  await handleRateLimitAlert(req("203.0.113.53", "/api/login", 10, false), deps);
  assert(mock.alerts.length === 1, `1ª chamada cria 1 alerta: ${mock.alerts.length}`);

  // 29 min depois: ainda dentro da janela → atualiza, sem novo alerta.
  virtual = new Date(virtual.getTime() + 29 * 60 * 1000);
  await handleRateLimitAlert(req("203.0.113.53", "/api/login", 11, false), deps);
  const after29: number = mock.alerts.length;
  assert(after29 === 1, `dentro da janela não cria novo: ${after29}`);

  // +31 min: fora da janela desde a CRIAÇÃO → cria novo alerta.
  virtual = new Date(virtual.getTime() + 31 * 60 * 1000);
  await handleRateLimitAlert(req("203.0.113.53", "/api/login", 12, false), deps);
  const after60: number = mock.alerts.length;
  assert(after60 === 2, `fora da janela cria novo alerta: ${after60}`);
});

Deno.test("dedupe: blocked=true com falha de gravação NÃO escala (segue warning, sem nova notificação)", async () => {
  const clock = () => new Date("2026-10-13T12:00:00.000Z");
  const mock = statefulMock({
    admins: [ADMIN],
    now: clock,
    blockError: { message: "permission denied for table blocked_ips" },
  });
  const deps = { supabase: mock.supabase, internalSecret: "segredo", now: clock };

  await handleRateLimitAlert(req("203.0.113.54", "/api/login", 10, false), deps);
  await handleRateLimitAlert(req("203.0.113.54", "/api/login", 200, true), deps);

  assert(mock.alerts.length === 1, `deveria continuar 1 alerta: ${mock.alerts.length}`);
  assert(
    mock.alerts[0].alert_type === "rate_limit_warning",
    `sem bloqueio persistido o alerta deve seguir warning: ${mock.alerts[0].alert_type}`,
  );
  assert(
    mock.notificationBatches.length === 1,
    `falha de bloqueio não pode escalar/notificar: ${mock.notificationBatches.length}`,
  );
});
