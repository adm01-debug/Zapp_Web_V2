// Guarda comportamental da Edge pública `request-password-reset`.
//
// Defeito (t_6d81aebb): `ForgotPassword.tsx` fazia, SEM login, select em
// `profiles` e insert em `password_reset_requests`. O anônimo não lê profiles
// (sem policy para anon) e o INSERT exige sessão: a busca voltava vazia e a tela
// dizia "se o email existir..." sem criar NADA — hoje ninguém consegue pedir
// redefinição. A Edge move o lookup+insert para o service role DENTRO da função.
//
// Os casos abaixo rodam o handler REAL com o `fetch` global stubado: o
// supabase-js passa pelo mesmo `fetch` (profiles GET, contagem GET e insert
// POST em `password_reset_requests`), então o que se prova aqui é o
// comportamento de ponta a ponta, não um mock do handler.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
//   supabase/functions/request-password-reset/index_test.ts
import {
  handleRequestPasswordReset,
  MAX_REASON_LENGTH,
  MAX_REQUESTS_PER_EMAIL_HOUR,
  MAX_REQUESTS_PER_IP_HOUR,
} from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const USER_ID = "10000000-0000-0000-0000-00000000000a";
const IP = "203.0.113.7";
const UA = "UA-Teste/1.0";

type Route = { match: string; method?: string; make: (url: string) => Response };
type Call = { url: string; method: string; init?: RequestInit };

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Stuba o `fetch` global por (trecho de URL + método) e captura as chamadas. */
function withFetch(routes: Route[]) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    calls.push({ url, method, init });
    const route = routes.find((r) => url.includes(r.match) && (!r.method || r.method === method));
    if (!route) return Promise.resolve(new Response("nao stubado", { status: 599 }));
    return Promise.resolve(route.make(url));
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

function withEnv(values: Record<(typeof ENV_KEYS)[number], string>, fn: () => Promise<void>) {
  const saved = ENV_KEYS.map((k) => [k, Deno.env.get(k)] as const);
  for (const key of ENV_KEYS) Deno.env.set(key, values[key]);
  return fn().finally(() => {
    for (const [key, value] of saved) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  });
}

const ENV_OK = {
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-de-teste",
};

/** Rotas do cenário: perfil encontrado (ou não) e histórico de pedidos. */
function resetRoutes(opts: {
  profile: { user_id: string } | null;
  emailCount?: number;
  ipCount?: number;
}): Route[] {
  return [
    {
      match: "/rest/v1/profiles",
      method: "GET",
      make: () => jsonResp(opts.profile ? [opts.profile] : []),
    },
    {
      match: "/rest/v1/password_reset_requests",
      method: "POST",
      make: () => jsonResp([], 201),
    },
    {
      match: "/rest/v1/password_reset_requests",
      method: "GET",
      make: (url) => {
        const n = url.includes("ip_address=") ? (opts.ipCount ?? 0) : (opts.emailCount ?? 0);
        return jsonResp(Array.from({ length: n }, (_, i) => ({ id: `row-${i}` })));
      },
    },
  ];
}

function makeRequest(body: unknown, withIpHeader = true): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json", "user-agent": UA };
  if (withIpHeader) headers["x-forwarded-for"] = IP;
  return new Request("https://stub.supabase.co/functions/v1/request-password-reset", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function callsTo(calls: Call[], match: string, method: string): Call[] {
  return calls.filter((c) => c.url.includes(match) && c.method === method);
}

function insertedRows(calls: Call[]): Array<Record<string, unknown>> {
  return callsTo(calls, "/rest/v1/password_reset_requests", "POST")
    .map((c) => JSON.parse(String(c.init?.body)) as Record<string, unknown>);
}

Deno.test("e-mail existente grava o pedido e normaliza o e-mail", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(resetRoutes({ profile: { user_id: USER_ID } }));
    try {
      const res = await handleRequestPasswordReset(
        makeRequest({ email: "  User@Example.COM  ", reason: "  esqueci a senha  " }),
      );

      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const body = await res.json() as Record<string, unknown>;
      assert(JSON.stringify(body) === JSON.stringify({ success: true }), `corpo inesperado: ${JSON.stringify(body)}`);

      const rows = insertedRows(stub.calls);
      assert(rows.length === 1, `esperado 1 insert, veio ${rows.length}`);
      assert(rows[0].user_id === USER_ID, `user_id inesperado: ${String(rows[0].user_id)}`);
      assert(rows[0].email === "user@example.com", `e-mail não normalizado: ${String(rows[0].email)}`);
      assert(rows[0].reason === "esqueci a senha", `motivo inesperado: ${String(rows[0].reason)}`);
      assert(rows[0].status === "pending", `status inesperado: ${String(rows[0].status)}`);
      assert(rows[0].ip_address === IP, `ip inesperado: ${String(rows[0].ip_address)}`);
      assert(rows[0].user_agent === UA, `user_agent inesperado: ${String(rows[0].user_agent)}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("e-mail inexistente NÃO grava e responde igual ao caso existente", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(resetRoutes({ profile: null }));
    try {
      const res = await handleRequestPasswordReset(makeRequest({ email: "nao.existe@example.com" }));

      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const body = await res.json() as Record<string, unknown>;
      // Payload IDÊNTICO ao do caminho com e-mail existente.
      assert(JSON.stringify(body) === JSON.stringify({ success: true }), `corpo inesperado: ${JSON.stringify(body)}`);
      assert(
        insertedRows(stub.calls).length === 0,
        "e-mail inexistente não pode gravar pedido",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test(`limite por e-mail (${MAX_REQUESTS_PER_EMAIL_HOUR}/h): não grava e responde igual`, async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(resetRoutes({
      profile: { user_id: USER_ID },
      emailCount: MAX_REQUESTS_PER_EMAIL_HOUR,
    }));
    try {
      const res = await handleRequestPasswordReset(makeRequest({ email: "user@example.com" }));

      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const body = await res.json() as Record<string, unknown>;
      assert(JSON.stringify(body) === JSON.stringify({ success: true }), `corpo inesperado: ${JSON.stringify(body)}`);
      assert(insertedRows(stub.calls).length === 0, "no limite não pode gravar");
    } finally {
      stub.restore();
    }
  });
});

Deno.test(`limite por IP (${MAX_REQUESTS_PER_IP_HOUR}/h): não grava e responde igual`, async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(resetRoutes({
      profile: { user_id: USER_ID },
      ipCount: MAX_REQUESTS_PER_IP_HOUR,
    }));
    try {
      const res = await handleRequestPasswordReset(makeRequest({ email: "user@example.com" }));

      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const body = await res.json() as Record<string, unknown>;
      assert(JSON.stringify(body) === JSON.stringify({ success: true }), `corpo inesperado: ${JSON.stringify(body)}`);
      assert(insertedRows(stub.calls).length === 0, "no limite por IP não pode gravar");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("logo ABAIXO do limite ainda grava (borda 2 < 3)", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(resetRoutes({
      profile: { user_id: USER_ID },
      emailCount: MAX_REQUESTS_PER_EMAIL_HOUR - 1,
    }));
    try {
      const res = await handleRequestPasswordReset(makeRequest({ email: "user@example.com" }));

      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      assert(insertedRows(stub.calls).length === 1, "abaixo do limite o pedido precisa gravar");
    } finally {
      stub.restore();
    }
  });
});

Deno.test(`motivo acima de ${MAX_REASON_LENGTH} caracteres é truncado, não rejeitado`, async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(resetRoutes({ profile: { user_id: USER_ID } }));
    try {
      const res = await handleRequestPasswordReset(
        makeRequest({ email: "user@example.com", reason: "x".repeat(MAX_REASON_LENGTH + 300) }),
      );

      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const rows = insertedRows(stub.calls);
      assert(rows.length === 1, `esperado 1 insert, veio ${rows.length}`);
      assert(
        (rows[0].reason as string).length === MAX_REASON_LENGTH,
        `motivo deveria ter ${MAX_REASON_LENGTH} caracteres, tem ${String(rows[0].reason).length}`,
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("motivo vazio vira null", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(resetRoutes({ profile: { user_id: USER_ID } }));
    try {
      const res = await handleRequestPasswordReset(makeRequest({ email: "user@example.com", reason: "   " }));

      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const rows = insertedRows(stub.calls);
      assert(rows.length === 1, `esperado 1 insert, veio ${rows.length}`);
      assert(rows[0].reason === null, `motivo vazio deveria virar null, veio ${String(rows[0].reason)}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("sem IP no cabeçalho: ip_address null e limite por IP não é consultado", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(resetRoutes({ profile: { user_id: USER_ID } }));
    try {
      const res = await handleRequestPasswordReset(makeRequest({ email: "user@example.com" }, false));

      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const rows = insertedRows(stub.calls);
      assert(rows.length === 1, `esperado 1 insert, veio ${rows.length}`);
      assert(rows[0].ip_address === null, `ip_address deveria ser null, veio ${String(rows[0].ip_address)}`);
      const ipLookups = stub.calls.filter(
        (c) => c.url.includes("/rest/v1/password_reset_requests") && c.url.includes("ip_address="),
      );
      assert(ipLookups.length === 0, "sem IP não há o que contar por IP");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("payload inválido (e-mail ausente) -> 422, sem lookup nem insert", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(resetRoutes({ profile: { user_id: USER_ID } }));
    try {
      const res = await handleRequestPasswordReset(makeRequest({ reason: "sem email" }));

      assert(res.status === 422, `esperado 422, veio ${res.status}`);
      const body = await res.json() as { error?: { code?: string } };
      assert(body.error?.code === "VALIDATION_ERROR", `corpo inesperado: ${JSON.stringify(body)}`);
      assert(insertedRows(stub.calls).length === 0, "payload inválido não pode gravar");
      assert(
        callsTo(stub.calls, "/rest/v1/profiles", "GET").length === 0,
        "payload inválido não pode consultar profiles",
      );
    } finally {
      stub.restore();
    }
  });
});
