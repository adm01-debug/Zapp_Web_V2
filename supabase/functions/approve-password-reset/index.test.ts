// R2-AUTH-007 (item 73): aprovar um pedido de reset gerava um link que a UI
// descartava e anunciava "e-mail enviado" sem envio nenhum (generateLink nao
// envia). Estes testes chamam o handler REAL com um Request e um client
// Supabase FALSO injetado que reproduz a semantica do claim atomico
// (update guardado por eq sobre o estado) e registra os envios.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/approve-password-reset/index.test.ts

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleApprovePasswordReset } from "./index.ts";

const URL_ = "https://example.supabase.co/functions/v1/approve-password-reset";
const REQUEST_ID = "11111111-2222-3333-4444-555555555555";
const ADMIN_ID = "99999999-8888-7777-6666-555555555555";

let ipSeq = 0;
function post(body: unknown, withAuth = true): Request {
  return new Request(URL_, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.9.9.${++ipSeq}`,
      ...(withAuth ? { authorization: "Bearer tok" } : {}),
    },
    body: JSON.stringify(body),
  });
}

interface ResetRow {
  id: string;
  email: string;
  status: string;
  delivery_status: string | null;
  delivered_at: string | null;
  delivery_error: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  updated_at: string;
}

function seedRow(over: Partial<ResetRow> = {}): ResetRow {
  return {
    id: REQUEST_ID,
    email: "destinatario@example.com",
    status: "pending",
    delivery_status: null,
    delivered_at: null,
    delivery_error: null,
    reviewed_by: null,
    reviewed_at: null,
    rejection_reason: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

type Terminal = { data: unknown; error: unknown };

/** Builder PostgREST falso: update() acumula os filtros eq(); o select()
 *  terminal aplica o patch SOMENTE nas linhas que casam todos os filtros — a
 *  mesma semantica do compare-and-swap do Postgres. */
function fakeTable(rows: ResetRow[], updateCalls: Array<{ patch: Record<string, unknown>; filters: Record<string, unknown>; matched: number }>) {
  return {
    update(patch: Record<string, unknown>) {
      const filters: Record<string, unknown> = {};
      let applied = false;
      // o patch so e aplicado no terminal (select ou o proprio await do builder,
      // como no PostgrestFilterBuilder real) e uma unica vez por cadeia.
      const applyUpdate = () => {
        if (applied) return [] as ResetRow[];
        applied = true;
        const matched = rows.filter((r) =>
          Object.entries(filters).every(([c, v]) =>
            (r as unknown as Record<string, unknown>)[c] === v
          )
        );
        for (const r of matched) Object.assign(r, patch);
        updateCalls.push({ patch, filters, matched: matched.length });
        return matched;
      };
      const builder: Record<string, unknown> = {};
      builder.eq = (col: string, val: unknown) => {
        filters[col] = val;
        return builder;
      };
      builder.select = (cols: string) => {
        const matched = applyUpdate();
        const wanted = cols.split(",").map((c) => c.trim());
        const projected = matched.map((r) =>
          Object.fromEntries(
            wanted.map((c) => [c, (r as unknown as Record<string, unknown>)[c]]),
          )
        );
        return Promise.resolve({ data: projected, error: null } as Terminal);
      };
      builder.then = (
        resolve: (v: Terminal) => unknown,
        reject: (e: unknown) => unknown,
      ) => {
        const matched = applyUpdate();
        return Promise.resolve({ data: matched, error: null } as Terminal).then(resolve, reject);
      };
      return builder;
    },
  };
}

function fakeAdmin(rows: ResetRow[], opts: { sendError?: { message: string } | null } = {}) {
  const sends: Array<{ email: string; options: Record<string, unknown> | undefined }> = [];
  const updateCalls: Array<{ patch: Record<string, unknown>; filters: Record<string, unknown>; matched: number }> = [];
  return {
    sends,
    updateCalls,
    from: (_table: string) => fakeTable(rows, updateCalls),
    auth: {
      resetPasswordForEmail(email: string, options?: Record<string, unknown>) {
        sends.push({ email, options });
        return Promise.resolve(
          opts.sendError
            ? { data: {}, error: opts.sendError }
            : { data: {}, error: null },
        );
      },
    },
  };
}

function fakeUser(opts: { isAdmin?: boolean; userError?: boolean } = {}) {
  return {
    auth: {
      getUser: () =>
        Promise.resolve(
          opts.userError
            ? { data: { user: null }, error: { message: "bad token" } }
            : { data: { user: { id: ADMIN_ID } }, error: null },
        ),
    },
    rpc: (fn: string) => {
      assertEquals(fn, "is_admin_or_supervisor");
      return Promise.resolve({ data: opts.isAdmin !== false, error: null });
    },
  };
}

function deps(rows: ResetRow[], opts: { sendError?: { message: string } | null; isAdmin?: boolean; userError?: boolean } = {}) {
  return { supabaseUser: fakeUser(opts), supabaseAdmin: fakeAdmin(rows, opts) };
}

function bodyMustNotLeakLink(body: Record<string, unknown>) {
  const serialized = JSON.stringify(body);
  assert(!("resetLink" in body), "corpo nao pode carregar resetLink");
  assert(!serialized.includes("action_link"), "corpo nao pode carregar action_link");
  assert(!serialized.includes("token"), "corpo nao pode carregar token");
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.test("T1 approve: claim atomico -> envio real -> delivery 'sent' (200)", async () => {
  const rows = [seedRow()];
  const admin = fakeAdmin(rows);
  const res = await handleApprovePasswordReset(
    post({ requestId: REQUEST_ID, action: "approve" }),
    { supabaseUser: fakeUser(), supabaseAdmin: admin },
  );

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.delivery, "sent");
  bodyMustNotLeakLink(body);

  assertEquals(admin.sends.length, 1);
  assertEquals(admin.sends[0].email, "destinatario@example.com");

  // a decisao foi UMA escrita condicionada a status='pending' (compare-and-swap)
  const claim = admin.updateCalls[0];
  assertEquals(claim.filters.status, "pending");
  assertEquals(claim.patch.status, "approved");
  assertEquals(claim.patch.delivery_status, "queued");

  // o 'sent' so foi gravado depois de o transporte aceitar, guardado por 'queued'
  const delivered = admin.updateCalls[1];
  assertEquals(delivered.filters.delivery_status, "queued");
  assertEquals(delivered.patch.delivery_status, "sent");

  assertEquals(rows[0].status, "approved");
  assertEquals(rows[0].delivery_status, "sent");
  assert(typeof rows[0].delivered_at === "string" && rows[0].delivered_at.length > 0);
});

Deno.test("T2 envio recusado: delivery 'failed', resposta 502, nunca 'sent'", async () => {
  const rows = [seedRow()];
  const admin = fakeAdmin(rows, { sendError: { message: "smtp down" } });
  const res = await handleApprovePasswordReset(
    post({ requestId: REQUEST_ID, action: "approve" }),
    { supabaseUser: fakeUser(), supabaseAdmin: admin },
  );

  assertEquals(res.status, 502);
  const body = await res.json();
  assertEquals(body.success, false);
  assertEquals(body.delivery, "failed");
  assertStringIncludes(body.message, "Falha ao enviar");
  assert(!JSON.stringify(body).includes("smtp down"), "nao devolve err.message de terceiro");
  bodyMustNotLeakLink(body);

  assertEquals(rows[0].status, "approved");
  assertEquals(rows[0].delivery_status, "failed");
  assertEquals(rows[0].delivered_at, null);
});

Deno.test("T3 nenhum desfecho devolve link/token no corpo", async () => {
  // desfecho feliz
  const rowsOk = [seedRow()];
  const resOk = await handleApprovePasswordReset(
    post({ requestId: REQUEST_ID, action: "approve" }),
    deps(rowsOk),
  );
  bodyMustNotLeakLink(await resOk.json());

  // desfecho de envio recusado
  const rowsFail = [seedRow()];
  const resFail = await handleApprovePasswordReset(
    post({ requestId: REQUEST_ID, action: "approve" }),
    deps(rowsFail, { sendError: { message: "x" } }),
  );
  bodyMustNotLeakLink(await resFail.json());

  // pedido ja decidido
  const rowsDone = [seedRow({ status: "approved", delivery_status: "sent" })];
  const resDone = await handleApprovePasswordReset(
    post({ requestId: REQUEST_ID, action: "approve" }),
    deps(rowsDone),
  );
  bodyMustNotLeakLink(await resDone.json());
});

Deno.test("T4 corrida: segunda aprovacao do mesmo pedido -> 409 e um unico envio", async () => {
  const rows = [seedRow()];
  const admin = fakeAdmin(rows);
  const d = { supabaseUser: fakeUser(), supabaseAdmin: admin };

  const first = await handleApprovePasswordReset(post({ requestId: REQUEST_ID, action: "approve" }), d);
  assertEquals(first.status, 200);
  await first.json();

  const second = await handleApprovePasswordReset(post({ requestId: REQUEST_ID, action: "approve" }), d);
  assertEquals(second.status, 409);
  const body = await second.json();
  bodyMustNotLeakLink(body);

  assertEquals(admin.sends.length, 1);
});

Deno.test("T4b reject concorrente com approve: quem chega depois recebe 409", async () => {
  const rows = [seedRow()];
  const admin = fakeAdmin(rows);
  const d = { supabaseUser: fakeUser(), supabaseAdmin: admin };

  const approve = await handleApprovePasswordReset(post({ requestId: REQUEST_ID, action: "approve" }), d);
  assertEquals(approve.status, 200);
  await approve.json();

  const reject = await handleApprovePasswordReset(
    post({ requestId: REQUEST_ID, action: "reject", rejectionReason: "duplicado" }),
    d,
  );
  assertEquals(reject.status, 409);
  assertEquals(rows[0].status, "approved");
});

Deno.test("T5 nao-admin -> 403 sem envio; sem Authorization -> 401", async () => {
  const rows = [seedRow()];
  const admin = fakeAdmin(rows);
  const res = await handleApprovePasswordReset(
    post({ requestId: REQUEST_ID, action: "approve" }),
    { supabaseUser: fakeUser({ isAdmin: false }), supabaseAdmin: admin },
  );
  assertEquals(res.status, 403);
  assertEquals(admin.sends.length, 0);
  assertEquals(rows[0].status, "pending");

  const noAuth = await handleApprovePasswordReset(
    post({ requestId: REQUEST_ID, action: "approve" }, false),
    deps([seedRow()]),
  );
  assertEquals(noAuth.status, 401);
});

Deno.test("T6 resend: so vale em approved+failed; em pending -> 409", async () => {
  // approved + failed -> reenfileira e envia de novo
  const rows = [seedRow({ status: "approved", delivery_status: "failed", delivery_error: "smtp down" })];
  const admin = fakeAdmin(rows);
  const res = await handleApprovePasswordReset(
    post({ requestId: REQUEST_ID, action: "resend" }),
    { supabaseUser: fakeUser(), supabaseAdmin: admin },
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.delivery, "sent");
  bodyMustNotLeakLink(body);
  assertEquals(admin.sends.length, 1);
  assertEquals(rows[0].delivery_status, "sent");

  // pending -> o claim nao casa, 409 e nenhum envio
  const pending = [seedRow()];
  const adminPending = fakeAdmin(pending);
  const resPending = await handleApprovePasswordReset(
    post({ requestId: REQUEST_ID, action: "resend" }),
    { supabaseUser: fakeUser(), supabaseAdmin: adminPending },
  );
  assertEquals(resPending.status, 409);
  assertEquals(adminPending.sends.length, 0);
  assertEquals(pending[0].status, "pending");

  // approved + sent (ja entregue) -> tambem 409, sem reenvio duplo
  const sent = [seedRow({ status: "approved", delivery_status: "sent" })];
  const adminSent = fakeAdmin(sent);
  const resSent = await handleApprovePasswordReset(
    post({ requestId: REQUEST_ID, action: "resend" }),
    { supabaseUser: fakeUser(), supabaseAdmin: adminSent },
  );
  assertEquals(resSent.status, 409);
  assertEquals(adminSent.sends.length, 0);
});

Deno.test("reject feliz: claim condicionado a pending, 200 sem envio", async () => {
  const rows = [seedRow()];
  const admin = fakeAdmin(rows);
  const res = await handleApprovePasswordReset(
    post({ requestId: REQUEST_ID, action: "reject", rejectionReason: "abuso" }),
    { supabaseUser: fakeUser(), supabaseAdmin: admin },
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  bodyMustNotLeakLink(body);
  assertEquals(rows[0].status, "rejected");
  assertEquals(rows[0].rejection_reason, "abuso");
  assertEquals(admin.sends.length, 0);
});
