// R2-AUTH-016 / R2-AUTH-016b (P2) — criação de usuário não pode responder sucesso
// quando uma escrita dependente falha, nunca pode nascer sem papel e precisa ser
// auditada.
//
// Estes testes são OFFLINE: o client admin service_role, o client do chamador e
// o rate limit são INJETADOS, então nenhuma chamada toca banco nem GoTrue. O
// que se prova é o CONTRATO do handler real:
//
//   (a)  falha ao gravar user_roles       -> não 200 + compensação (deleteUser);
//   (a2) sem `role` no corpo              -> grava 'agent' por upsert (nunca sem papel);
//   (a3) domínio não confiável            -> papel pedido é gravado (não depende do trigger);
//   (b)  update de `profiles` falha        -> não 200 + compensação;
//   (c)  insert em `gmail_accounts` falha  -> não 200 + compensação;
//   (d)  insert google em `user_service_accounts` falha -> não 200 + compensação;
//   (e)  insert dropbox em `user_service_accounts` falha -> não 200 + compensação;
//   (f)  caminho feliz                     -> 200 {success:true, user_id} e deleteUser NÃO chamado;
//   (g)  compensação (deleteUser) falha     -> ainda erro, nunca 200;
//   (h)  admin com mais de um papel         -> cria (checagem filtra role='admin' + limit(1));
//   (i)  chamador sem papel 'admin'         -> 403, não cria;
//   (j)  createUser falha                   -> erro GENÉRICO (não vaza a mensagem do provedor);
//   (k)  auditoria gravada                  -> ator, ação e user_id criado, sem e-mail/senha;
//   (l)  falha ao gravar auditoria          -> não 200 + compensação.
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
  /** "tabela:op" -> erro a devolver. user_service_accounts usa ":google"/":dropbox". */
  failOn?: Record<string, { message: string }>;
  deleteUserError?: { message: string } | null;
  createUserError?: { message: string } | null;
  /** Linhas devolvidas pelo SELECT em user_roles (checagem de admin do chamador). */
  callerRoleRows?: Array<{ role: string }>;
}

/**
 * Client admin falso: `from()` devolve um builder encadeável que resolve o erro
 * scriptado para a escrita daquela tabela; `auth.admin` registra createUser e
 * deleteUser (a compensação provada por `deleted`). `written` guarda as linhas
 * gravadas (upsert/insert) e `filters` os filtros aplicados (prova de que a
 * checagem de admin filtra role='admin').
 */
function fakeAdmin(opts: FakeAdminOpts = {}) {
  const calls: string[] = [];
  const deleted: string[] = [];
  const written: Record<string, Array<Record<string, unknown>>> = {};
  const filters: string[] = [];
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
          return Promise.resolve(
            opts.createUserError
              ? { data: { user: null }, error: opts.createUserError }
              : { data: { user: { id: NEW_USER_ID } }, error: null },
          );
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
        upsert: (row: Record<string, unknown> | Record<string, unknown>[]) => {
          op = "upsert";
          written[`${table}:upsert`] = Array.isArray(row) ? row : [row];
          return builder;
        },
        insert: (rows: unknown) => {
          const arr = Array.isArray(rows) ? rows : [rows];
          written[`${table}:insert`] = arr as Array<Record<string, unknown>>;
          const svc = (arr[0] as { service_type?: string } | undefined)?.service_type;
          const key = table === "user_service_accounts"
            ? `user_service_accounts:${svc === "dropbox" ? "dropbox" : "google"}`
            : `${table}:insert`;
          return finish(key);
        },
        delete: () => { op = "delete"; return builder; },
        eq: (col: string, val: unknown) => {
          filters.push(`${table}.${col}=${String(val)}`);
          return builder;
        },
        limit: () => builder,
        then: (
          onOk: (v: { data: unknown; error: unknown }) => unknown,
          onErr?: (e: unknown) => unknown,
        ) => {
          const key = `${table}:${op}`;
          const def = op === "select" ? (opts.callerRoleRows ?? [{ role: "admin" }]) : null;
          return finish(key, def).then(onOk, onErr);
        },
      };
      return builder;
    },
  };
  return { admin, calls, deleted, written, filters };
}

function makeRequest(body: unknown): Request {
  return new Request("https://stub.supabase.co/functions/v1/create-user", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer token-de-teste" },
    body: JSON.stringify(body),
  });
}

function run(body: unknown, admin: CreateUserAdminClient): Promise<Response> {
  return runWith(body, admin, async () => ({ allowed: true }));
}

/** Permite scriptar o rate limit (persistente) para provar o gate e a chave. */
function runWith(
  body: unknown,
  admin: CreateUserAdminClient,
  enforceRateLimit: (key: string, maxRequests: number, windowMs: number) => PromiseLike<{ allowed: boolean }>,
): Promise<Response> {
  return handleCreateUserRequest(makeRequest(body), {
    caller: callerOk,
    admin,
    enforceRateLimit,
  });
}

async function assertFalhaComCompensacao(res: Response, deleted: string[], cenario: string) {
  assert(res.status === 500, `${cenario}: esperado 500, veio ${res.status}`);
  const body = await res.json() as Record<string, unknown>;
  assert(body.success !== true, `${cenario}: corpo não pode trazer success:true — ${JSON.stringify(body)}`);
  assert(typeof body.error === "string", `${cenario}: corpo de erro esperado — ${JSON.stringify(body)}`);
  assert(
    deleted.includes(NEW_USER_ID),
    `${cenario}: deleteUser deveria ter sido chamado com o usuário recém-criado — ${JSON.stringify(deleted)}`,
  );
}

Deno.test("R2-AUTH-016 (a): falha no upsert de user_roles -> erro + deleteUser", async () => {
  const { admin, deleted } = fakeAdmin({ failOn: { "user_roles:upsert": { message: "rls violada" } } });
  const res = await run({ ...BODY_BASE, role: "admin" }, admin);
  await assertFalhaComCompensacao(res, deleted, "role");
});

Deno.test("R2-AUTH-016b (a2): sem role no corpo grava 'agent' por upsert (nunca sem papel)", async () => {
  const { admin, calls, deleted, written } = fakeAdmin();
  const res = await run(BODY_BASE, admin);
  assert(res.status === 200, `sem role deve manter o caminho feliz, veio ${res.status}`);
  const body = await res.json() as Record<string, unknown>;
  assert(body.success === true && body.user_id === NEW_USER_ID, `resposta inesperada: ${JSON.stringify(body)}`);
  assert(calls.includes("user_roles:upsert"), `o papel deve vir por upsert: ${JSON.stringify(calls)}`);
  const row = written["user_roles:upsert"]?.[0];
  assert(row?.user_id === NEW_USER_ID && row?.role === "agent", `upsert inesperado: ${JSON.stringify(row)}`);
  assert(!calls.includes("user_roles:update"), `não pode mais usar update em user_roles: ${JSON.stringify(calls)}`);
  assert(deleted.length === 0, `sem role não pode compensar/apagar usuário: ${JSON.stringify(deleted)}`);
});

Deno.test("R2-AUTH-016b (a3): domínio não confiável recebe o papel pedido", async () => {
  // Trigger handle_new_user_role() só provisiona 'agent' para dominio confiavel;
  // com dominio comum a conta nascia sem papel. O upsert garante o papel pedido.
  const { admin, written } = fakeAdmin();
  const res = await run({ ...BODY_BASE, email: "parceiro@gmail.com", role: "supervisor" }, admin);
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  const row = written["user_roles:upsert"]?.[0];
  assert(row?.user_id === NEW_USER_ID && row?.role === "supervisor", `upsert inesperado: ${JSON.stringify(row)}`);
});

Deno.test("R2-AUTH-016 (b): update de profiles falha -> erro + deleteUser", async () => {
  const { admin, deleted } = fakeAdmin({ failOn: { "profiles:update": { message: "coluna inexistente" } } });
  const res = await run({ ...BODY_BASE, nickname: "Nick" }, admin);
  await assertFalhaComCompensacao(res, deleted, "perfil");
});

Deno.test("R2-AUTH-016 (c): insert em gmail_accounts falha -> erro + deleteUser", async () => {
  const { admin, deleted } = fakeAdmin({ failOn: { "gmail_accounts:insert": { message: "unique violada" } } });
  const res = await run({ ...BODY_BASE, gmail_email: "novo@gmail.com" }, admin);
  await assertFalhaComCompensacao(res, deleted, "gmail");
});

Deno.test("R2-AUTH-016 (d): insert google em user_service_accounts falha -> erro + deleteUser", async () => {
  const { admin, calls, deleted } = fakeAdmin({ failOn: { "user_service_accounts:google": { message: "fk inexistente" } } });
  const res = await run(
    { ...BODY_BASE, gmail_email: "novo@gmail.com", google_services: ["google_sheets", "google_drive"] },
    admin,
  );
  await assertFalhaComCompensacao(res, deleted, "google services");
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
  await assertFalhaComCompensacao(res, deleted, "dropbox");
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
    "user_roles:upsert",
    "profiles:update",
    "gmail_accounts:insert",
    "user_service_accounts:google",
    "user_service_accounts:dropbox",
    "audit_logs:insert",
  ]) {
    assert(calls.includes(esperada), `escrita dependente deveria ter rodado: ${esperada} (calls=${JSON.stringify(calls)})`);
  }
});

Deno.test("R2-AUTH-016 (g): deleteUser de compensação falha -> ainda erro, nunca 200", async () => {
  const { admin, deleted } = fakeAdmin({
    failOn: { "user_roles:upsert": { message: "rls violada" } },
    deleteUserError: { message: "GoTrue indisponível" },
  });
  const res = await run({ ...BODY_BASE, role: "admin" }, admin);
  assert(res.status === 500, `esperado 500 mesmo com compensação falha, veio ${res.status}`);
  const body = await res.json() as Record<string, unknown>;
  assert(body.success !== true, `corpo não pode trazer success:true — ${JSON.stringify(body)}`);
  assert(deleted.includes(NEW_USER_ID), `a compensação deveria ter sido tentada — ${JSON.stringify(deleted)}`);
});

Deno.test("R2-AUTH-016b (h): admin com mais de um papel consegue criar", async () => {
  // O chamador tem agent + admin; o SELECT filtra role='admin', então devolve a
  // linha do admin (limit(1)) e não dispara o erro de ambiguidade do `.single()`.
  const { admin, filters } = fakeAdmin({ callerRoleRows: [{ role: "admin" }] });
  const res = await run({ ...BODY_BASE, role: "agent" }, admin);
  assert(res.status === 200, `admin com 2 papéis deve criar, veio ${res.status}`);
  assert(
    filters.includes(`user_roles.role=admin`),
    `a checagem deve filtrar pelo papel admin: ${JSON.stringify(filters)}`,
  );
});

Deno.test("R2-AUTH-016b (i): chamador sem papel 'admin' -> 403 e não cria usuário", async () => {
  const { admin, calls } = fakeAdmin({ callerRoleRows: [] });
  const res = await run(BODY_BASE, admin);
  assert(res.status === 403, `esperado 403, veio ${res.status}`);
  assert(
    !calls.includes("auth.admin.createUser"),
    `não pode criar usuário para não-admin: ${JSON.stringify(calls)}`,
  );
});

Deno.test("R2-AUTH-016b (j): createUser falha -> erro genérico, sem a mensagem do provedor", async () => {
  const bruto = "User already registered or invalid SQLSTATE 23505";
  const { admin, deleted } = fakeAdmin({ createUserError: { message: bruto } });
  const res = await run(BODY_BASE, admin);
  assert(res.status === 400, `esperado 400, veio ${res.status}`);
  const body = await res.json() as Record<string, unknown>;
  assert(body.success !== true, `corpo não pode trazer success:true — ${JSON.stringify(body)}`);
  assert(
    typeof body.error === "string" && !body.error.includes(bruto) && !body.error.includes("23505"),
    `erro não pode vazar a mensagem do provedor — ${JSON.stringify(body.error)}`,
  );
  assert(deleted.length === 0, `createUser falhou: não há usuário a compensar — ${JSON.stringify(deleted)}`);
});

Deno.test("R2-AUTH-016b (k): auditoria grava ator, ação e user_id criado, sem e-mail/senha", async () => {
  const { admin, written } = fakeAdmin();
  const res = await run({ ...BODY_BASE, role: "supervisor" }, admin);
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  const row = written["audit_logs:insert"]?.[0];
  assert(!!row, `auditoria deveria ter sido gravada: ${JSON.stringify(written)}`);
  assert(row.user_id === CALLER_ID, `auditoria deve guardar o ator: ${JSON.stringify(row)}`);
  assert(row.action === "user_created", `ação inesperada: ${JSON.stringify(row.action)}`);
  assert(row.entity_id === NEW_USER_ID, `auditoria deve referir o usuário criado: ${JSON.stringify(row)}`);
  const details = row.details as Record<string, unknown> | undefined;
  assert(details?.role === "supervisor", `details deve trazer o papel: ${JSON.stringify(details)}`);
  const serialized = JSON.stringify(row);
  assert(
    !serialized.includes(BODY_BASE.email) && !serialized.includes(BODY_BASE.password),
    `auditoria não pode conter e-mail nem senha: ${serialized}`,
  );
});

Deno.test("rate limit (IP): negado antes de autenticar -> 429 e nada criado", async () => {
  const { admin, calls } = fakeAdmin();
  const res = await runWith(BODY_BASE, admin, async () => ({ allowed: false }));
  assert(res.status === 429, `esperado 429, veio ${res.status}`);
  assert(calls.length === 0, `nada pode tocar banco/GoTrue antes do gate: ${JSON.stringify(calls)}`);
});

Deno.test("rate limit (usuario): limite persistente por USUARIO apos autenticar -> 429", async () => {
  // Primeira chamada = pre-auth (por IP) permite; a segunda = pos-auth (por
  // usuario) nega. Prova que o handler conta por conta, nao so por IP.
  const { admin, calls } = fakeAdmin();
  const keys: string[] = [];
  const res = await runWith(BODY_BASE, admin, async (key) => {
    keys.push(key);
    return { allowed: !key.includes(":user:") };
  });
  assert(res.status === 429, `esperado 429, veio ${res.status}`);
  assert(
    keys.length === 2 &&
      keys[0] === "create-user:unknown" &&
      keys[1] === `create-user:user:${CALLER_ID}`,
    `chaves inesperadas: ${JSON.stringify(keys)}`,
  );
  assert(
    !calls.includes("auth.admin.createUser"),
    `nao pode criar com o limite por usuario estourado: ${JSON.stringify(calls)}`,
  );
});

Deno.test("R2-AUTH-016 (l): falha ao gravar auditoria -> erro + compensação", async () => {
  const { admin, deleted } = fakeAdmin({ failOn: { "audit_logs:insert": { message: "permission denied" } } });
  const res = await run(BODY_BASE, admin);
  await assertFalhaComCompensacao(res, deleted, "auditoria");
});
