// R2-AUTH-016 (#245) — escopo seguro da rodada 2.
// Prova que a ausência de `role` não dispara update vazio em user_roles.
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/create-user/index.test.ts

import {
  handleCreateUserRequest,
  type CreateUserAdminClient,
  type CreateUserCallerClient,
} from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const CALLER_ID = "10000000-0000-0000-0000-00000000000a";
const NEW_USER_ID = "20000000-0000-0000-0000-00000000000b";

const callerOk: CreateUserCallerClient = {
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: CALLER_ID } }, error: null }),
  },
};

function fakeAdmin() {
  const calls: string[] = [];
  const admin: CreateUserAdminClient = {
    auth: {
      admin: {
        createUser: () => {
          calls.push("auth.admin.createUser");
          return Promise.resolve({ data: { user: { id: NEW_USER_ID } }, error: null });
        },
      },
    },
    from(table: string) {
      let op = "";
      // deno-lint-ignore no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => { op = "select"; return builder; },
        update: () => { op = "update"; return builder; },
        insert: () => { op = "insert"; return builder; },
        eq: () => builder,
        single: () => {
          calls.push(`${table}:select`);
          return Promise.resolve({ data: { role: "admin" }, error: null });
        },
        then: (
          onOk: (v: { data: unknown; error: unknown }) => unknown,
          onErr?: (e: unknown) => unknown,
        ) => {
          calls.push(`${table}:${op}`);
          return Promise.resolve({ data: null, error: null }).then(onOk, onErr);
        },
      };
      return builder;
    },
  };
  return { admin, calls };
}

function makeRequest(body: unknown): Request {
  return new Request("https://stub.supabase.co/functions/v1/create-user", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer token-de-teste" },
    body: JSON.stringify(body),
  });
}

Deno.test("R2-AUTH-016 (#245): sem role no corpo não faz update vazio em user_roles", async () => {
  const { admin, calls } = fakeAdmin();
  const res = await handleCreateUserRequest(makeRequest({
    email: "novo@empresa.com",
    password: "senha-forte-123",
    name: "Novo Usuário",
  }), {
    caller: callerOk,
    admin,
    checkRateLimit: () => ({ allowed: true }),
  });

  assert(res.status === 200, `sem role deve manter o caminho feliz, veio ${res.status}`);
  const body = await res.json() as Record<string, unknown>;
  assert(body.success === true && body.user_id === NEW_USER_ID, `resposta inesperada: ${JSON.stringify(body)}`);
  assert(
    !calls.includes("user_roles:update"),
    `sem role no corpo não pode chamar user_roles:update vazio — ${JSON.stringify(calls)}`,
  );
});
