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
  rpcError?: boolean;
  // deno-lint-ignore no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
} = {}): any {
  // Chamadas a public.admin_set_role via cliente com o JWT do chamador.
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  return {
    __rpcCalls: rpcCalls,
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: opts.user ?? null },
          error: opts.user ? null : new Error("no user"),
        }),
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(
        opts.rpcError ? { data: null, error: { message: "rpc_failed" } } : { data: null, error: null },
      );
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
  const state: { roleWrite: any; auditWrite: any } = { roleWrite: null, auditWrite: null };

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
          if (table === "audit_logs") state.auditWrite = payload;
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
  const caller = makeCaller({ user: { id: CALLER_ID }, roles: ["supervisor"] });
  const { admin, calls, state } = makeAdmin();
  const res = await handleInviteUserRequest(makeRequest({ email: "novo@promobrindes.com.br", role: "agent" }), OK_DEPS({
    caller,
    admin,
  }));
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  assert(state.roleWrite?.role === "agent", `papel gravado veio ${JSON.stringify(state.roleWrite)}`);
  assert(calls.includes("audit_logs:insert"), `auditoria deveria registrar o convite: ${JSON.stringify(calls)}`);
  assert(state.auditWrite?.details?.domain_trusted === true, `auditoria deveria marcar dominio confiavel: ${JSON.stringify(state.auditWrite)}`);
  // Supervisor nao passa pela RPC de admin: escrita direta com service_role.
  assert(caller.__rpcCalls.length === 0, `supervisor nao deveria chamar rpc: ${JSON.stringify(caller.__rpcCalls)}`);
});

Deno.test("invite-user: admin convidando supervisor → 200 e papel pela RPC admin_set_role", async () => {
  const caller = makeCaller({ user: { id: CALLER_ID }, roles: ["admin"] });
  const { admin, state } = makeAdmin({ roleUpdateRows: [{ id: "r1" }] });
  const res = await handleInviteUserRequest(makeRequest({ email: "chefe@promobrindes.com.br", role: "supervisor" }), OK_DEPS({
    caller,
    admin,
  }));
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  // Caminho V2: papel concedido pela RPC publica com o JWT do chamador...
  assert(
    JSON.stringify(caller.__rpcCalls) === JSON.stringify([{ fn: "admin_set_role", args: { _user_id: NEW_USER_ID, _role: "supervisor" } }]),
    `RPC admin_set_role nao chamada como esperado: ${JSON.stringify(caller.__rpcCalls)}`,
  );
  // ...e sem escrita direta em user_roles nesse caminho.
  assert(state.roleWrite === null, `nao deveria escrever direto em user_roles: ${JSON.stringify(state.roleWrite)}`);
});

Deno.test("invite-user: supervisor convidando dominio fora → 403 e nenhum convite", async () => {
  const { admin, calls } = makeAdmin();
  const res = await handleInviteUserRequest(makeRequest({ email: "parceiro@parceiro.com", role: "agent" }), OK_DEPS({
    caller: makeCaller({ user: { id: CALLER_ID }, roles: ["supervisor"] }),
    admin,
  }));
  assert(res.status === 403, `esperado 403, veio ${res.status}`);
  assert(!calls.includes("inviteUserByEmail"), `nao deveria criar conta: ${JSON.stringify(calls)}`);
});

Deno.test("invite-user: admin convidando dominio fora → 200 com auditoria marcando o dominio", async () => {
  // handle_new_user_role (migration 20260925140000) so auto-provisiona 'agent'
  // para promobrindes.com.br, mas permite que um admin conceda papel a conta
  // de outro dominio (parceiro, freelancer). O convite segue essa regra:
  // dominio fora exige admin e fica registrado na auditoria.
  const caller = makeCaller({ user: { id: CALLER_ID }, roles: ["admin"] });
  const { admin, calls, state } = makeAdmin();
  const res = await handleInviteUserRequest(makeRequest({ email: "parceiro@parceiro.com", role: "agent" }), OK_DEPS({
    caller,
    admin,
  }));
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  assert(
    JSON.stringify(caller.__rpcCalls) === JSON.stringify([{ fn: "admin_set_role", args: { _user_id: NEW_USER_ID, _role: "agent" } }]),
    `RPC admin_set_role nao chamada como esperado: ${JSON.stringify(caller.__rpcCalls)}`,
  );
  assert(calls.includes("audit_logs:insert"), `auditoria deveria registrar o convite: ${JSON.stringify(calls)}`);
  assert(state.auditWrite?.details?.domain_trusted === false, `auditoria deveria marcar dominio fora: ${JSON.stringify(state.auditWrite)}`);
});

Deno.test("invite-user: TRUSTED_DOMAINS via env libera dominio parceiro para supervisor", async () => {
  const caller = makeCaller({ user: { id: CALLER_ID }, roles: ["supervisor"] });
  const { admin } = makeAdmin();
  const res = await handleInviteUserRequest(makeRequest({ email: "apoio@parceiro.com", role: "agent" }), OK_DEPS({
    caller,
    admin,
    env: (_name: string) => "parceiro.com",
  }));
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
});

Deno.test("invite-user: resposta NAO carrega link de convite", async () => {
  const { admin } = makeAdmin();
  const res = await handleInviteUserRequest(makeRequest({ email: "novo@promobrindes.com.br", role: "agent" }), OK_DEPS({
    caller: makeCaller({ user: { id: CALLER_ID }, roles: ["admin"] }),
    admin,
  }));
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  const raw = JSON.stringify(await res.json());
  for (const proibido of ["http", "action_link", "invite", "token", "type="]) {
    assert(!raw.includes(proibido), `resposta nao pode conter "${proibido}": ${raw}`);
  }
});

Deno.test("invite-user: convite ao GoTrue vai sem papel no user_metadata", async () => {
  const { admin, invites } = makeAdmin();
  const res = await handleInviteUserRequest(makeRequest({ email: "novo@promobrindes.com.br", role: "agent" }), OK_DEPS({
    caller: makeCaller({ user: { id: CALLER_ID }, roles: ["admin"] }),
    admin,
  }));
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  assert(invites.length === 1, `esperado 1 convite, veio ${JSON.stringify(invites)}`);
  assert(invites[0].email === "novo@promobrindes.com.br", `email errado: ${JSON.stringify(invites)}`);
  assert(invites[0].options === undefined, `papel nao pode ir no user_metadata: ${JSON.stringify(invites)}`);
});

Deno.test("invite-user: email invalido → 400 e nenhum convite", async () => {
  const { admin, calls } = makeAdmin();
  const res = await handleInviteUserRequest(makeRequest({ email: "nao-email", role: "agent" }), OK_DEPS({
    caller: makeCaller({ user: { id: CALLER_ID }, roles: ["admin"] }),
    admin,
  }));
  assert(res.status === 400, `esperado 400, veio ${res.status}`);
  assert(!calls.includes("inviteUserByEmail"), `nao deveria convidar: ${JSON.stringify(calls)}`);
});

Deno.test("invite-user: falha do GoTrue → 400, sem papel e sem desfazer", async () => {
  const caller = makeCaller({ user: { id: CALLER_ID }, roles: ["admin"] });
  const { admin, calls } = makeAdmin({ inviteError: true });
  const res = await handleInviteUserRequest(makeRequest({ email: "novo@promobrindes.com.br", role: "agent" }), OK_DEPS({
    caller,
    admin,
  }));
  assert(res.status === 400, `esperado 400, veio ${res.status}`);
  assert(!calls.some((c) => c.startsWith("user_roles:")), `nao deveria gravar papel: ${JSON.stringify(calls)}`);
  assert(caller.__rpcCalls.length === 0, `RPC nao deveria ser chamada: ${JSON.stringify(caller.__rpcCalls)}`);
  assert(!calls.some((c) => c.startsWith("deleteUser")), `sem conta criada, nada a desfazer: ${JSON.stringify(calls)}`);
});

Deno.test("invite-user: falha ao atribuir papel → desfaz a conta e erra", async () => {
  const { admin, calls } = makeAdmin({ roleAssignError: true });
  const res = await handleInviteUserRequest(makeRequest({ email: "novo@promobrindes.com.br", role: "agent" }), OK_DEPS({
    caller: makeCaller({ user: { id: CALLER_ID }, roles: ["admin"], rpcError: true }),
    admin,
  }));
  assert(res.status === 500, `esperado 500, veio ${res.status}`);
  assert(
    calls.includes(`deleteUser:${NEW_USER_ID}`),
    `conta deveria ser desfeita: ${JSON.stringify(calls)}`,
  );
});

Deno.test("invite-user: supervisor com falha ao atribuir papel → desfaz a conta e erra", async () => {
  const caller = makeCaller({ user: { id: CALLER_ID }, roles: ["supervisor"] });
  const { admin, calls } = makeAdmin({ roleAssignError: true });
  const res = await handleInviteUserRequest(makeRequest({ email: "novo@promobrindes.com.br", role: "agent" }), OK_DEPS({
    caller,
    admin,
  }));
  assert(res.status === 500, `esperado 500, veio ${res.status}`);
  assert(
    calls.includes(`deleteUser:${NEW_USER_ID}`),
    `conta deveria ser desfeita: ${JSON.stringify(calls)}`,
  );
  assert(caller.__rpcCalls.length === 0, `supervisor nao deveria chamar rpc: ${JSON.stringify(caller.__rpcCalls)}`);
});

Deno.test("invite-user: falha de auditoria nao derruba o convite (best-effort)", async () => {
  const { admin, calls } = makeAdmin({ auditError: true });
  const res = await handleInviteUserRequest(makeRequest({ email: "novo@promobrindes.com.br", role: "agent" }), OK_DEPS({
    caller: makeCaller({ user: { id: CALLER_ID }, roles: ["admin"] }),
    admin,
  }));
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  assert(calls.includes("audit_logs:insert"), `auditoria deveria ter sido tentada: ${JSON.stringify(calls)}`);
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
