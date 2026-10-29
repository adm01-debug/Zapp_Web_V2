// paridade V3 -> V2: convite de usuario por e-mail com papel definido.
// Prova os caminhos PADRAO e os NEGADOS: sem JWT, JWT invalido, sem papel,
// supervisor pedindo papel privilegiado, e o dominio fora da empresa.
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/invite-user/index.test.ts

import { handleInviteUserRequest } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const CALLER_ID = "10000000-0000-0000-0000-00000000000a";
const NEW_USER_ID = "20000000-0000-0000-0000-00000000000b";

// Cliente de escopo do usuario (anon key) — valida o JWT e le user_roles.
function makeCaller(opts: {
  user?: { id: string } | null;
  roles?: string[];
  roleError?: boolean;
  // deno-lint-ignore no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
} = {}): any {
  return {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: opts.user ?? null },
          error: opts.user ? null : new Error("no user"),
        }),
    },
    from(_table: string) {
      // deno-lint-ignore no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => b,
        eq: () => b,
        then: (
          onOk: (v: unknown) => unknown,
          onErr?: (e: unknown) => unknown,
        ) =>
          Promise.resolve({
            data: (opts.roles ?? []).map((role) => ({ role })),
            error: opts.roleError ? { message: "rls denied" } : null,
          }).then(onOk, onErr),
      };
      return b;
    },
  };
}

// Cliente service-role: convida, atribui papel e audita.
function makeAdmin(opts: {
  inviteError?: boolean;
  user?: { id: string } | null;
  roleUpdateRows?: { id: string }[];
  roleAssignError?: boolean;
  auditError?: boolean;
} = {}) {
  const calls: string[] = [];
  const invites: Array<{ email: string; options: Record<string, unknown> | undefined }> = [];
  // deno-lint-ignore no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state: { roleWrite: any } = { roleWrite: null };

  // deno-lint-ignore no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = {
    auth: {
      admin: {
        inviteUserByEmail: (email: string, options?: Record<string, unknown>) => {
          calls.push("inviteUserByEmail");
          invites.push({ email, options });
          if (opts.inviteError) {
            return Promise.resolve({ data: null, error: { message: "already registered" } });
          }
          return Promise.resolve({
            data: { user: opts.user === undefined ? { id: NEW_USER_ID } : opts.user },
            error: null,
          });
        },
        deleteUser: (id: string) => {
          calls.push(`deleteUser:${id}`);
          return Promise.resolve({ data: {}, error: null });
        },
      },
    },
    from(table: string) {
      let op = "";
      // deno-lint-ignore no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let payload: any = null;
      // deno-lint-ignore no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        // deno-lint-ignore no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: (p: any) => { op = "update"; payload = p; return b; },
        // deno-lint-ignore no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
        insert: (p: any) => { op = "insert"; payload = p; return b; },
        select: () => { if (!op) op = "select"; return b; },
        eq: () => b,
        then: (
          onOk: (v: unknown) => unknown,
          onErr?: (e: unknown) => unknown,
        ) => {
          calls.push(`${table}:${op}`);
          if (table === "user_roles") state.roleWrite = payload;
          // deno-lint-ignore no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let res: any = { data: null, error: null };
          if (table === "user_roles" && op === "update") {
            res = opts.roleAssignError
              ? { data: null, error: { message: "assign boom" } }
              : { data: opts.roleUpdateRows ?? [], error: null };
          } else if (table === "user_roles" && op === "insert") {
            res = opts.roleAssignError ? { data: null, error: { message: "assign boom" } } : { data: null, error: null };
          } else if (table === "audit_logs" && op === "insert") {
            res = { data: null, error: opts.auditError ? { message: "audit boom" } : null };
          }
          return Promise.resolve(res).then(onOk, onErr);
        },
      };
      return b;
    },
  };
  return { admin, calls, invites, state };
}

function makeRequest(body: unknown, withAuth = true): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (withAuth) headers.Authorization = "Bearer token-de-teste";
  return new Request("https://stub.supabase.co/functions/v1/invite-user", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const OK_DEPS = (extra: Record<string, unknown> = {}) => ({
  checkRateLimit: () => ({ allowed: true }),
  ...extra,
});

Deno.test("invite-user: sem Authorization → 401 e nenhum convite", async () => {
  const { admin, calls } = makeAdmin();
  const res = await handleInviteUserRequest(makeRequest({ email: "novo@empresa.com", role: "agent" }, false), OK_DEPS({
    caller: makeCaller(),
    admin,
  }));
  assert(res.status === 401, `esperado 401, veio ${res.status}`);
  assert(!calls.includes("inviteUserByEmail"), `nao deveria convidar: ${JSON.stringify(calls)}`);
});

Deno.test("invite-user: JWT invalido → 401 e nenhum convite", async () => {
  const { admin, calls } = makeAdmin();
  const res = await handleInviteUserRequest(makeRequest({ email: "novo@empresa.com", role: "agent" }), OK_DEPS({
    caller: makeCaller({ user: null }),
    admin,
  }));
  assert(res.status === 401, `esperado 401, veio ${res.status}`);
  assert(!calls.includes("inviteUserByEmail"), `nao deveria convidar: ${JSON.stringify(calls)}`);
});

Deno.test("invite-user: usuario sem papel → 403 e nenhum convite", async () => {
  const { admin, calls } = makeAdmin();
  const res = await handleInviteUserRequest(makeRequest({ email: "novo@empresa.com", role: "agent" }), OK_DEPS({
    caller: makeCaller({ user: { id: CALLER_ID }, roles: ["agent"] }),
    admin,
  }));
  assert(res.status === 403, `esperado 403, veio ${res.status}`);
  assert(!calls.includes("inviteUserByEmail"), `nao deveria convidar: ${JSON.stringify(calls)}`);
});

Deno.test("invite-user: consulta de papel com erro → 403 (fecha, nao abre)", async () => {
  const { admin, calls } = makeAdmin();
  const res = await handleInviteUserRequest(makeRequest({ email: "novo@empresa.com", role: "agent" }), OK_DEPS({
    caller: makeCaller({ user: { id: CALLER_ID }, roleError: true }),
    admin,
  }));
  assert(res.status === 403, `esperado 403, veio ${res.status}`);
  assert(!calls.includes("inviteUserByEmail"), `nao deveria convidar: ${JSON.stringify(calls)}`);
});

Deno.test("invite-user: supervisor pedindo papel privilegiado → 403 e nenhum convite", async () => {
  const { admin, calls } = makeAdmin();
  const res = await handleInviteUserRequest(makeRequest({ email: "novo@empresa.com", role: "supervisor" }), OK_DEPS({
    caller: makeCaller({ user: { id: CALLER_ID }, roles: ["supervisor"] }),
    admin,
  }));
  assert(res.status === 403, `esperado 403, veio ${res.status}`);
  assert(!calls.includes("inviteUserByEmail"), `nao deveria convidar: ${JSON.stringify(calls)}`);
});

Deno.test("invite-user: supervisor convidando agent → 200 e papel agent atribuido", async () => {
  const { admin, calls, state } = makeAdmin();
  const res = await handleInviteUserRequest(makeRequest({ email: "novo@empresa.com", role: "agent" }), OK_DEPS({
    caller: makeCaller({ user: { id: CALLER_ID }, roles: ["supervisor"] }),
    admin,
  }));
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  assert(state.roleWrite?.role === "agent", `papel gravado veio ${JSON.stringify(state.roleWrite)}`);
  assert(calls.includes("audit_logs:insert"), `auditoria deveria registrar o convite: ${JSON.stringify(calls)}`);
});

Deno.test("invite-user: admin convidando supervisor → 200 e papel supervisor atribuido", async () => {
  const { admin, state } = makeAdmin({ roleUpdateRows: [{ id: "r1" }] });
  const res = await handleInviteUserRequest(makeRequest({ email: "chefe@empresa.com", role: "supervisor" }), OK_DEPS({
    caller: makeCaller({ user: { id: CALLER_ID }, roles: ["admin"] }),
    admin,
  }));
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  assert(state.roleWrite?.role === "supervisor", `papel gravado veio ${JSON.stringify(state.roleWrite)}`);
});

Deno.test("invite-user: admin convidando dominio fora da empresa → papel ainda garantido", async () => {
  // handle_new_user_role so cria 'agent' para promobrindes.com.br; o convite
  // NAO pode depender dele. Este caminho grava o papel com service_role.
  const { admin, calls, state } = makeAdmin();
  const res = await handleInviteUserRequest(makeRequest({ email: "parceiro@parceiro.com", role: "agent" }), OK_DEPS({
    caller: makeCaller({ user: { id: CALLER_ID }, roles: ["admin"] }),
    admin,
  }));
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  assert(state.roleWrite?.role === "agent", `papel gravado veio ${JSON.stringify(state.roleWrite)}`);
  assert(
    calls.some((c) => c === "user_roles:update" || c === "user_roles:insert"),
    `papel deveria ser gravado em user_roles: ${JSON.stringify(calls)}`,
  );
});

Deno.test("invite-user: resposta NAO carrega link de convite", async () => {
  const { admin } = makeAdmin();
  const res = await handleInviteUserRequest(makeRequest({ email: "novo@empresa.com", role: "agent" }), OK_DEPS({
    caller: makeCaller({ user: { id: CALLER_ID }, roles: ["admin"] }),
    admin,
  }));
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  const raw = JSON.stringify(await res.json());
  for (const proibido of ["http", "action_link", "invite", "token", "type="]) {
    assert(!raw.includes(proibido), `resposta nao pode conter "${proibido}": ${raw}`);
  }
});

Deno.test("invite-user: falha do GoTrue → 400 e nenhuma escrita de papel", async () => {
  const { admin, calls } = makeAdmin({ inviteError: true });
  const res = await handleInviteUserRequest(makeRequest({ email: "novo@empresa.com", role: "agent" }), OK_DEPS({
    caller: makeCaller({ user: { id: CALLER_ID }, roles: ["admin"] }),
    admin,
  }));
  assert(res.status === 400, `esperado 400, veio ${res.status}`);
  assert(!calls.some((c) => c.startsWith("user_roles:")), `nao deveria gravar papel: ${JSON.stringify(calls)}`);
});

Deno.test("invite-user: falha ao atribuir papel → desfaz a conta e erra", async () => {
  const { admin, calls } = makeAdmin({ roleAssignError: true });
  const res = await handleInviteUserRequest(makeRequest({ email: "novo@empresa.com", role: "agent" }), OK_DEPS({
    caller: makeCaller({ user: { id: CALLER_ID }, roles: ["admin"] }),
    admin,
  }));
  assert(res.status === 500, `esperado 500, veio ${res.status}`);
  assert(
    calls.includes(`deleteUser:${NEW_USER_ID}`),
    `conta deveria ser desfeita: ${JSON.stringify(calls)}`,
  );
});

Deno.test("invite-user: campo extra no corpo → 400 (schema estrito) e nenhum convite", async () => {
  const { admin, calls } = makeAdmin();
  const res = await handleInviteUserRequest(
    makeRequest({ email: "novo@empresa.com", role: "agent", foo: "bar" }),
    OK_DEPS({ caller: makeCaller({ user: { id: CALLER_ID }, roles: ["admin"] }), admin }),
  );
  assert(res.status === 400, `esperado 400, veio ${res.status}`);
  assert(!calls.includes("inviteUserByEmail"), `nao deveria convidar: ${JSON.stringify(calls)}`);
});
