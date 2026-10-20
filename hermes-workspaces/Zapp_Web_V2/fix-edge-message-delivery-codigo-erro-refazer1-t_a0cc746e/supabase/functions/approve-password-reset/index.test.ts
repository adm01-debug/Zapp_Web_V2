// Cartão t_786331e6 — approve-password-reset: só admin, envia o e-mail pelo
// GoTrue e NUNCA devolve o link. Antes: aceitava supervisor, gerava o link com
// `generateLink` e devolvia `resetLink` (action_link com token) na resposta,
// sem enviar e-mail nenhum.
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/approve-password-reset/index.test.ts

import {
  handleApprovePasswordResetRequest,
  type ApproveResetAdminClient,
  type ApproveResetCallerClient,
  type ApproveResetEmailClient,
} from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const CALLER_ID = "10000000-0000-0000-0000-00000000000a";
const TARGET_USER_ID = "20000000-0000-0000-0000-00000000000b";
const REQUEST_ID = "30000000-0000-0000-0000-00000000000c";
const CANONICAL = "https://zapp-web-v2.vercel.app";

interface DbCall {
  table: string;
  op: string;
  payload?: Record<string, unknown>;
}

function fakeCaller(opts: { isAdmin?: boolean; userId?: string | null } = {}) {
  const calls: string[] = [];
  const userId = opts.userId === undefined ? CALLER_ID : opts.userId;
  const caller: ApproveResetCallerClient = {
    auth: {
      getUser: () => Promise.resolve({ data: { user: userId ? { id: userId } : null }, error: null }),
    },
    rpc: (fn, args) => {
      calls.push(`rpc:${fn}:${JSON.stringify(args)}`);
      return Promise.resolve({ data: opts.isAdmin === false ? false : true, error: null });
    },
  };
  return { caller, calls };
}

function fakeAdmin(
  row: Record<string, unknown> | null,
  opts: { updateError?: { message: string }; auditError?: { message: string } } = {},
) {
  const calls: DbCall[] = [];
  const admin = {
    from(table: string) {
      let op = "";
      let payload: Record<string, unknown> | undefined;
      // deno-lint-ignore no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => {
          op = op || "select";
          return builder;
        },
        update: (p: Record<string, unknown>) => {
          op = "update";
          payload = p;
          return builder;
        },
        insert: (p: Record<string, unknown>) => {
          op = "insert";
          payload = p;
          return builder;
        },
        eq: () => builder,
        single: () => {
          calls.push({ table, op: op || "select" });
          return Promise.resolve({ data: row, error: row ? null : { message: "not found" } });
        },
        then: (
          onOk: (v: { data: unknown; error: unknown }) => unknown,
          onErr?: (e: unknown) => unknown,
        ) => {
          calls.push({ table, op, payload });
          const result = op === "update"
            ? { data: null, error: opts.updateError ?? null }
            : op === "insert"
            ? { data: null, error: opts.auditError ?? null }
            : { data: null, error: null };
          return Promise.resolve(result).then(onOk, onErr);
        },
      };
      return builder;
    },
  } as unknown as ApproveResetAdminClient;
  return { admin, calls };
}

function fakeEmail(opts: { error?: { message: string } | null } = {}) {
  const calls: { email: string; redirectTo: string }[] = [];
  const client: ApproveResetEmailClient = {
    auth: {
      resetPasswordForEmail: (email, options) => {
        calls.push({ email, redirectTo: options.redirectTo });
        return Promise.resolve({ data: {}, error: opts.error ?? null });
      },
    },
  };
  return { client, calls };
}

const env = (name: string) => {
  if (name === "SUPABASE_URL") return "https://stub.supabase.co";
  if (name === "SUPABASE_ANON_KEY") return "stub-anon-key";
  if (name === "SUPABASE_SERVICE_ROLE_KEY") return "stub-service-key";
  throw new Error(`env inesperado: ${name}`);
};

const baseDeps = { env, checkRateLimit: () => ({ allowed: true }) };

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://stub.supabase.co/functions/v1/approve-password-reset", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer token-de-teste",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    user_id: TARGET_USER_ID,
    email: "alvo@empresa.com",
    status: "pending",
    ...overrides,
  };
}

const APPROVE_BODY = { requestId: REQUEST_ID, action: "approve" };
const REJECT_BODY = { requestId: REQUEST_ID, action: "reject", rejectionReason: "pedido do RH" };

Deno.test("supervisor (não-admin) NÃO decide reset — 403 e nenhum efeito", async () => {
  const { caller, calls: callerCalls } = fakeCaller({ isAdmin: false });
  const { admin, calls } = fakeAdmin(pendingRow());
  const email = fakeEmail();

  const res = await handleApprovePasswordResetRequest(makeRequest(APPROVE_BODY), {
    ...baseDeps,
    caller,
    admin,
    emailClient: email.client,
  });

  assert(res.status === 403, `supervisor deve receber 403, veio ${res.status}`);
  assert(
    callerCalls.some((c) => c.startsWith("rpc:is_admin:")),
    `a guarda deve usar is_admin (não is_admin_or_supervisor): ${JSON.stringify(callerCalls)}`,
  );
  assert(email.calls.length === 0, "supervisor não pode disparar e-mail");
  assert(calls.length === 0, "supervisor não pode tocar o banco");
});

Deno.test("admin aprova: e-mail sai pelo GoTrue e a resposta NÃO traz link", async () => {
  const { caller } = fakeCaller();
  const { admin, calls } = fakeAdmin(pendingRow());
  const email = fakeEmail();

  const res = await handleApprovePasswordResetRequest(
    makeRequest(APPROVE_BODY, { origin: CANONICAL }),
    { ...baseDeps, caller, admin, emailClient: email.client },
  );

  assert(res.status === 200, `aprovação deve responder 200, veio ${res.status}`);

  const raw = JSON.stringify(await res.json());
  for (const proibido of ["resetLink", "action_link", "token", "actionLink"]) {
    assert(!raw.includes(proibido), `a resposta não pode conter '${proibido}': ${raw}`);
  }

  assert(email.calls.length === 1, `o e-mail de recuperação deve ser enviado 1x: ${JSON.stringify(email.calls)}`);
  assert(email.calls[0].email === "alvo@empresa.com", `e-mail para o alvo, veio ${email.calls[0].email}`);
  assert(
    email.calls[0].redirectTo === `${CANONICAL}/reset-password`,
    `redirectTo deve ser a origem canônica + /reset-password, veio ${email.calls[0].redirectTo}`,
  );

  const approved = calls.find((c) => c.table === "password_reset_requests" && c.op === "update");
  assert(!!approved, `a solicitação deve ser atualizada: ${JSON.stringify(calls)}`);
  assert(approved.payload?.status === "approved", `status deve virar approved: ${JSON.stringify(approved.payload)}`);
  assert(approved.payload?.reviewed_by === CALLER_ID, "reviewed_by deve ser o admin que decidiu");

  const audit = calls.find((c) => c.table === "audit_logs" && c.op === "insert");
  assert(!!audit, `a decisão deve ir para a auditoria: ${JSON.stringify(calls)}`);
  assert(
    (audit.payload?.details as { result?: string })?.result === "approved",
    `resultado da auditoria deve ser approved: ${JSON.stringify(audit.payload)}`,
  );
});

Deno.test("origem não permitida cai no endereço canônico (sem open redirect)", async () => {
  const { caller } = fakeCaller();
  const { admin } = fakeAdmin(pendingRow());
  const email = fakeEmail();

  const res = await handleApprovePasswordResetRequest(
    makeRequest(APPROVE_BODY, { origin: "https://malicioso.example" }),
    { ...baseDeps, caller, admin, emailClient: email.client },
  );

  assert(res.status === 200, `veio ${res.status}`);
  assert(
    email.calls[0]?.redirectTo === `${CANONICAL}/reset-password`,
    `origem não permitida deve cair no canônico, veio ${email.calls[0]?.redirectTo}`,
  );
});

Deno.test("falha do e-mail: 502, emailSent=false, approved_email_failed e NADA aprovado", async () => {
  const { caller } = fakeCaller();
  const { admin, calls } = fakeAdmin(pendingRow(), { });
  const email = fakeEmail({ error: { message: "smtp fora do ar" } });

  const res = await handleApprovePasswordResetRequest(makeRequest(APPROVE_BODY), {
    ...baseDeps,
    caller,
    admin,
    emailClient: email.client,
  });

  assert(res.status === 502, `falha do e-mail deve responder 502, veio ${res.status}`);
  const body = await res.json() as Record<string, unknown>;
  assert(body.success === false, `success deve ser false: ${JSON.stringify(body)}`);
  assert(body.emailSent === false, `emailSent deve ser false: ${JSON.stringify(body)}`);
  assert(body.status === "approved_email_failed", `status deve ser approved_email_failed: ${JSON.stringify(body)}`);
  assert(!JSON.stringify(body).includes("token"), `resposta sem token: ${JSON.stringify(body)}`);

  assert(
    !calls.some((c) => c.table === "password_reset_requests" && c.op === "update"),
    `falha FECHADA: a solicitação não pode ser marcada aprovada: ${JSON.stringify(calls)}`,
  );
  const audit = calls.find((c) => c.table === "audit_logs" && c.op === "insert");
  assert(
    (audit?.payload?.details as { result?: string })?.result === "approved_email_failed",
    `auditoria deve registrar a falha: ${JSON.stringify(audit?.payload)}`,
  );
});

Deno.test("admin NÃO aprova a redefinição da própria conta — 403", async () => {
  const { caller } = fakeCaller();
  const { admin, calls } = fakeAdmin(pendingRow({ user_id: CALLER_ID }));
  const email = fakeEmail();

  const res = await handleApprovePasswordResetRequest(makeRequest(APPROVE_BODY), {
    ...baseDeps,
    caller,
    admin,
    emailClient: email.client,
  });

  assert(res.status === 403, `autoaprovação deve receber 403, veio ${res.status}`);
  assert(email.calls.length === 0, "não pode enviar e-mail na autoaprovação");
  assert(
    !calls.some((c) => c.op === "update"),
    `não pode atualizar na autoaprovação: ${JSON.stringify(calls)}`,
  );
});

Deno.test("rejeitar: marca rejected, registra motivo, sem e-mail e na auditoria", async () => {
  const { caller } = fakeCaller();
  const { admin, calls } = fakeAdmin(pendingRow());
  const email = fakeEmail();

  const res = await handleApprovePasswordResetRequest(makeRequest(REJECT_BODY), {
    ...baseDeps,
    caller,
    admin,
    emailClient: email.client,
  });

  assert(res.status === 200, `rejeição deve responder 200, veio ${res.status}`);
  const rejected = calls.find((c) => c.table === "password_reset_requests" && c.op === "update");
  assert(rejected?.payload?.status === "rejected", `status deve virar rejected: ${JSON.stringify(rejected?.payload)}`);
  assert(rejected?.payload?.rejection_reason === "pedido do RH", "o motivo informado deve ser gravado");
  assert(email.calls.length === 0, "rejeição não envia e-mail");

  const audit = calls.find((c) => c.table === "audit_logs" && c.op === "insert");
  assert(
    (audit?.payload?.details as { result?: string })?.result === "rejected",
    `auditoria deve registrar rejected: ${JSON.stringify(audit?.payload)}`,
  );
});

Deno.test("solicitação já processada responde 409 sem efeito", async () => {
  const { caller } = fakeCaller();
  const { admin, calls } = fakeAdmin(pendingRow({ status: "approved" }));
  const email = fakeEmail();

  const res = await handleApprovePasswordResetRequest(makeRequest(APPROVE_BODY), {
    ...baseDeps,
    caller,
    admin,
    emailClient: email.client,
  });

  assert(res.status === 409, `veio ${res.status}`);
  assert(
    email.calls.length === 0 && !calls.some((c) => c.op === "update" || c.op === "insert"),
    "nada pode acontecer numa solicitação já processada",
  );
});

Deno.test("sem Authorization responde 401", async () => {
  const { caller } = fakeCaller();
  const { admin } = fakeAdmin(pendingRow());
  const email = fakeEmail();

  const req = new Request("https://stub.supabase.co/functions/v1/approve-password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(APPROVE_BODY),
  });
  const res = await handleApprovePasswordResetRequest(req, {
    ...baseDeps,
    caller,
    admin,
    emailClient: email.client,
  });

  assert(res.status === 401, `veio ${res.status}`);
});

Deno.test("rate limit responde 429 antes de qualquer efeito", async () => {
  const { caller } = fakeCaller();
  const { admin, calls } = fakeAdmin(pendingRow());
  const email = fakeEmail();

  const res = await handleApprovePasswordResetRequest(makeRequest(APPROVE_BODY), {
    env,
    checkRateLimit: () => ({ allowed: false }),
    caller,
    admin,
    emailClient: email.client,
  });

  assert(res.status === 429, `veio ${res.status}`);
  assert(email.calls.length === 0 && calls.length === 0, "rate limit não pode ter efeito");
});
