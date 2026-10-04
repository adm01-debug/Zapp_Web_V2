import { handleAuthLogin } from "./index.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function makeRequest(email: string, password: string, ip: string): Request {
  return new Request("https://edge.invalid", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ email, password }),
  });
}

type ProfileRow = { id: string; is_active: boolean | null };

type AdminOpts = {
  profile?: ProfileRow | null;
  profileError?: { code?: string; message?: string } | null;
  locked?: boolean;
};

type AnonOpts = {
  error?: { status?: number; message?: string } | null;
  session?: boolean;
};

type Harness = {
  admin: unknown;
  anon: unknown;
  signInCalls: () => number;
  recordFailedCalls: () => number;
};

function makeHarness(adminOpts: AdminOpts = {}, anonOpts: AnonOpts = {}): Harness {
  let signInCalls = 0;
  let recordFailedCalls = 0;

  const admin = {
    rpc: async (fn: string) => {
      if (fn === "is_account_locked") {
        return {
          data: [{ is_locked: adminOpts.locked ?? false, locked_until: null, attempts: 0 }],
          error: null,
        };
      }
      if (fn === "record_failed_login") {
        recordFailedCalls++;
        return { data: [{ is_locked: false, locked_until: null, attempts: 1 }], error: null };
      }
      if (fn === "clear_login_attempts") {
        return { data: null, error: null };
      }
      throw new Error("unexpected rpc: " + fn);
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: adminOpts.profile ?? null,
            error: adminOpts.profileError ?? null,
          }),
        }),
      }),
    }),
  };

  const anon = {
    auth: {
      signInWithPassword: async () => {
        signInCalls++;
        if (anonOpts.error) return { data: { user: null, session: null }, error: anonOpts.error };
        if (anonOpts.session === false) return { data: { user: { id: "u1" }, session: null }, error: null };
        return {
          data: {
            user: { id: "u1" },
            session: {
              access_token: "at",
              refresh_token: "rt",
              expires_in: 3600,
              expires_at: 1234567890,
              token_type: "bearer",
            },
          },
          error: null,
        };
      },
    },
  };

  return {
    admin,
    anon,
    signInCalls: () => signInCalls,
    recordFailedCalls: () => recordFailedCalls,
  };
}

Deno.test("perfil inativo com senha correta retorna 401 generico e nao chama signInWithPassword", async () => {
  const h = makeHarness({ profile: { id: "p1", is_active: false } }, {});
  const res = await handleAuthLogin(makeRequest("inativo@example.com", "senha-correta", "10.0.0.1"), h);
  const body = await readJson(res);

  assert(res.status === 401, `esperava 401, veio ${res.status}`);
  assert(body.error === "Invalid login credentials", "mensagem deve ser a generica de credencial invalida");
  assert(!("access_token" in body) && !("refresh_token" in body), "nao pode emitir tokens");
  assert(h.signInCalls() === 0, "nao pode tocar no GoTrue para perfil inativo");
});

Deno.test("conta sem perfil retorna 401 generico e nao chama signInWithPassword", async () => {
  const h = makeHarness({ profile: null }, {});
  const res = await handleAuthLogin(makeRequest("sem-perfil@example.com", "qualquer", "10.0.0.2"), h);
  const body = await readJson(res);

  assert(res.status === 401, `esperava 401, veio ${res.status}`);
  assert(body.error === "Invalid login credentials", "mensagem deve ser a generica de credencial invalida");
  assert(h.signInCalls() === 0, "conta sem perfil nao pode chegar ao GoTrue");
});

Deno.test("perfil com is_active nulo fecha em 401 (fail-closed, sem tocar no GoTrue)", async () => {
  const h = makeHarness({ profile: { id: "p2", is_active: null } }, {});
  const res = await handleAuthLogin(makeRequest("nulo@example.com", "senha", "10.0.0.3"), h);

  assert(res.status === 401, `esperava 401, veio ${res.status}`);
  assert(h.signInCalls() === 0, "is_active nulo nao pode chegar ao GoTrue");
});

Deno.test("falha na consulta do perfil fecha em 500 e nao segue para o GoTrue", async () => {
  const h = makeHarness({ profileError: { code: "PGRST116", message: "boom" } }, {});
  const res = await handleAuthLogin(makeRequest("erro-consulta@example.com", "senha", "10.0.0.4"), h);
  const body = await readJson(res);

  assert(res.status === 500, `esperava 500 (fail-closed), veio ${res.status}`);
  assert(body.error === "Internal server error", "500 deve ser generico, sem detalhes internos");
  assert(h.signInCalls() === 0, "erro de consulta nao pode vazar para o GoTrue");
});

Deno.test("perfil ativo autentica e retorna a sessao", async () => {
  const h = makeHarness({ profile: { id: "p3", is_active: true } }, {});
  const res = await handleAuthLogin(makeRequest("ativo@example.com", "senha", "10.0.0.5"), h);
  const body = await readJson(res);

  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  assert(body.access_token === "at", "deve retornar access_token");
  assert(body.refresh_token === "rt", "deve retornar refresh_token");
  assert(h.signInCalls() === 1, "perfil ativo deve chegar ao GoTrue exatamente uma vez");
});

Deno.test("perfil ativo com senha errada retorna 401 e registra a falha", async () => {
  const h = makeHarness(
    { profile: { id: "p4", is_active: true } },
    { error: { status: 400, message: "invalid credentials" } },
  );
  const res = await handleAuthLogin(makeRequest("senha-errada@example.com", "senha", "10.0.0.6"), h);
  const body = await readJson(res);

  assert(res.status === 401, `esperava 401, veio ${res.status}`);
  assert(body.error === "Invalid login credentials", "mensagem generica de credencial invalida");
  assert(h.recordFailedCalls() === 1, "falha real deve registrar a tentativa (lockout)");
  assert(!("access_token" in body), "nao pode emitir token");
});

Deno.test("conta travada retorna 423 antes de resolver o perfil", async () => {
  const h = makeHarness({ locked: true }, {});
  const res = await handleAuthLogin(makeRequest("travado@example.com", "senha", "10.0.0.7"), h);
  const body = await readJson(res);

  assert(res.status === 423, `esperava 423, veio ${res.status}`);
  assert(body.error === "Account locked", "mensagem de conta travada");
  assert(h.signInCalls() === 0, "conta travada nao chega ao GoTrue");
});
