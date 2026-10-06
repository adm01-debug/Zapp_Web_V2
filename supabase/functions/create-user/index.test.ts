// R2-AUTH-016 (P2) — criação de usuário não pode responder sucesso quando uma
// escrita dependente falha.
//
// Estes testes são OFFLINE: o client admin service_role, o client do chamador e
// o rate limit são INJETADOS, então nenhuma chamada toca banco nem GoTrue. O
// que se prova é o CONTRATO do handler real:
//
//   (a) update de `user_roles` falha     -> não 200 + compensação (deleteUser);
//   (a2) sem `role` no corpo             -> não faz update vazio em user_roles;
//   (b) update de `profiles` falha       -> não 200 + compensação;
//   (c) insert em `gmail_accounts` falha -> não 200 + compensação;
//   (d) insert google em `user_service_accounts` falha -> não 200 + compensação;
//   (e) insert dropbox em `user_service_accounts` falha -> não 200 + compensação;
//   (f) caminho feliz -> 200 {success:true, user_id} e deleteUser NÃO chamado;
//   (g) compensação (deleteUser) falha   -> ainda erro, nunca 200.
//
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

const BODY_BASE = {
  email: "novo@empresa.com",
  password: "senha-forte-123",
  name: "Novo Usuário",
};

/** Client do chamador: JWT válido de um admin qualquer. */
const callerOk: CreateUserCallerClient = {
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: CALLER_ID } }, error: null }),
  },
};

interface FakeAdminOpts {
  /** "tabela:op" -> erro a devolver naquela escrita. user_service_accounts usa ":google"/":dropbox". */
  failOn?: Record<string, { message: string }>;
  deleteUserError?: { message: string } | null;
}

/**
 * Client admin falso: `from()` devolve um builder encadeável que resolve o erro
 * scriptado para a escrita daquela tabela; `auth.admin` registra createUser e
 * deleteUser (a compensação provada por `deleted`).
 */
function fakeAdmin(opts: FakeAdminOpts = {}) {
  const calls: string[] = [];
  const deleted: string[] = [];
  const finish = (key: string, okData: unknown = null) => {
    calls.push(key);
    const err = opts.failOn?.[key] ?? null;
    return Promise.resolve({ data: err ? null : okData, error: err });
  };
  const admin: CreateUserAdminClient = {
    auth: {
      admin: {
        createUser: () => {
          calls.push("auth.admin.createUser");
          return Promise.resolve({ data: { user: { id: NEW_USER_ID } }, error: null });
        },
        deleteUser: (id: string) => {
          calls.push("auth.admin.deleteUser");
          deleted.push(id);
          return Promise.resolve({ data: {}, error: opts.deleteUserError ?? null });
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
        insert: (rows: unknown) => {
          const arr = Array.isArray(rows) ? rows : [rows];
          const svc = (arr[0] as { service_type?: string } | undefined)?.service_type;
          const key = table === "user_service_accounts"
            ? `user_service_accounts:${svc === "dropbox" ? "dropbox" : "google"}`
            : `${table}:insert`;
          return finish(key);
        },
        delete: () => { op = "delete"; return builder; },
        eq: () => builder,
        single: () => finish(`${table}:select`, { role: "admin" }),
        then: (
          onOk: (v: { data: unknown; error: unknown }) => unknown,
          onErr?: (e: unknown) => unknown,
        ) => finish(`${table}:${op}`).then(onOk, onErr),
      };
      return builder;
    },
  };
  return { admin, calls, deleted };
}

function makeRequest(body: unknown): Request {
  return new Request("https://stub.supabase.co/functions/v1/create-user", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer token-de-teste" },
    body: JSON.stringify(body),
  });
}

function run(body: unknown, admin: CreateUserAdminClient): Promise<Response> {
  return handleCreateUserRequest(makeRequest(body), {
    caller: callerOk,
    admin,
    checkRateLimit: () => ({ allowed: true }),
  });
}

async function assertFalhaComCompensacao(res: Response, calls: string[], deleted: string[], cenario: string) {
  assert(res.status === 500, `${cenario}: esperado 500, veio ${res.status}`);
  const body = await res.json() as Record<string, unknown>;
  assert(body.success !== true, `${cenario}: corpo não pode trazer success:true — ${JSON.stringify(body)}`);
  assert(typeof body.error === "string", `${cenario}: corpo de erro esperado — ${JSON.stringify(body)}`);
  assert(
    deleted.includes(NEW_USER_ID),
    `${cenario}: deleteUser deveria ter sido chamado com o usuário recém-criado — ${JSON.stringify(deleted)}`,
  );
}

Deno.test("R2-AUTH-016 (a): update de user_roles falha -> erro + deleteUser", async () => {
  const { admin, calls, deleted } = fakeAdmin({ failOn: { "user_roles:update": { message: "rls violada" } } });
  const res = await run({ ...BODY_BASE, role: "admin" }, admin);
  await assertFalhaComCompensacao(res, calls, deleted, "role");
});

Deno.test("R2-AUTH-016 (a2): sem role no corpo não faz update vazio em user_roles", async () => {
  const { admin, calls, deleted } = fakeAdmin({ failOn: { "user_roles:update": { message: "update vazio rejeitado" } } });
  const res = await run(BODY_BASE, admin);
  assert(res.status === 200, `sem role deve manter o caminho feliz, veio ${res.status}`);
  const body = await res.json() as Record<string, unknown>;
  assert(body.success === true && body.user_id === NEW_USER_ID, `resposta inesperada: ${JSON.stringify(body)}`);
  assert(
    !calls.includes("user_roles:update"),
    `sem role no corpo não pode chamar user_roles:update vazio — ${JSON.stringify(calls)}`,
  );
  assert(deleted.length === 0, `sem role não pode compensar/apagar usuário: ${JSON.stringify(deleted)}`);
});

Deno.test("R2-AUTH-016 (b): update de profiles falha -> erro + deleteUser", async () => {
  const { admin, calls, deleted } = fakeAdmin({ failOn: { "profiles:update": { message: "coluna inexistente" } } });
  const res = await run({ ...BODY_BASE, nickname: "Nick" }, admin);
  await assertFalhaComCompensacao(res, calls, deleted, "perfil");
});

Deno.test("R2-AUTH-016 (c): insert em gmail_accounts falha -> erro + deleteUser", async () => {
  const { admin, calls, deleted } = fakeAdmin({ failOn: { "gmail_accounts:insert": { message: "unique violada" } } });
  const res = await run({ ...BODY_BASE, gmail_email: "novo@gmail.com" }, admin);
  await assertFalhaComCompensacao(res, calls, deleted, "gmail");
});

Deno.test("R2-AUTH-016 (d): insert google em user_service_accounts falha -> erro + deleteUser", async () => {
  const { admin, calls, deleted } = fakeAdmin({ failOn: { "user_service_accounts:google": { message: "fk inexistente" } } });
  const res = await run(
    { ...BODY_BASE, gmail_email: "novo@gmail.com", google_services: ["google_sheets", "google_drive"] },
    admin,
  );
  await assertFalhaComCompensacao(res, calls, deleted, "google services");
  // A conta Gmail foi criada nesta requisição e a FK gmail_accounts_user_id_fkey é
  // ON DELETE RESTRICT (migration 20260926240000): sem removê-la antes, o deleteUser falharia.
  const iGmailInsert = calls.indexOf("gmail_accounts:insert");
  const iGmailUndo = calls.indexOf("gmail_accounts:delete");
  const iDelUser = calls.indexOf("auth.admin.deleteUser");
  assert(
    iGmailInsert >= 0 && iGmailUndo > iGmailInsert && iDelUser > iGmailUndo,
    `(d): esperado insert gmail -> delete gmail -> deleteUser, veio ${JSON.stringify(calls)}`,
  );
});

Deno.test("R2-AUTH-016 (e): insert dropbox em user_service_accounts falha -> erro + deleteUser", async () => {
  const { admin, calls, deleted } = fakeAdmin({ failOn: { "user_service_accounts:dropbox": { message: "fk inexistente" } } });
  const res = await run({ ...BODY_BASE, dropbox_email: "novo@dropbox.com" }, admin);
  await assertFalhaComCompensacao(res, calls, deleted, "dropbox");
  // Sem conta Gmail nesta requisição, a compensação não apaga linha nenhuma de gmail_accounts.
  assert(
    !calls.includes("gmail_accounts:delete"),
    `(e): não havia conta Gmail a desfazer — ${JSON.stringify(calls)}`,
  );
});

Deno.test("R2-AUTH-016 (f): caminho feliz -> 200 success:true e deleteUser NÃO chamado", async () => {
  const { admin, calls, deleted } = fakeAdmin();
  const res = await run({
    ...BODY_BASE,
    role: "supervisor",
    nickname: "Nick",
    gmail_email: "novo@gmail.com",
    google_services: ["google_sheets"],
    dropbox_email: "novo@dropbox.com",
  }, admin);
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  const body = await res.json() as Record<string, unknown>;
  assert(body.success === true && body.user_id === NEW_USER_ID, `resposta inesperada: ${JSON.stringify(body)}`);
  assert(deleted.length === 0, `deleteUser não pode rodar no caminho feliz: ${JSON.stringify(deleted)}`);
  for (const esperada of [
    "user_roles:update",
    "profiles:update",
    "gmail_accounts:insert",
    "user_service_accounts:google",
    "user_service_accounts:dropbox",
  ]) {
    assert(calls.includes(esperada), `escrita dependente deveria ter rodado: ${esperada} (calls=${JSON.stringify(calls)})`);
  }
});

Deno.test("R2-AUTH-016 (g): deleteUser de compensação falha -> ainda erro, nunca 200", async () => {
  const { admin, calls, deleted } = fakeAdmin({
    failOn: { "user_roles:update": { message: "rls violada" } },
    deleteUserError: { message: "GoTrue indisponível" },
  });
  const res = await run({ ...BODY_BASE, role: "admin" }, admin);
  assert(res.status === 500, `esperado 500 mesmo com compensação falha, veio ${res.status}`);
  const body = await res.json() as Record<string, unknown>;
  assert(body.success !== true, `corpo não pode trazer success:true — ${JSON.stringify(body)}`);
  assert(deleted.includes(NEW_USER_ID), `a compensação deveria ter sido tentada — ${JSON.stringify(deleted)}`);
});
