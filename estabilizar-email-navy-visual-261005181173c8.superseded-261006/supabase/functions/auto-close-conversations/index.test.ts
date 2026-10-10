/**
 * R2-API-022 — contrato executável do auto-close-conversations.
 *
 * Trava o que a decisão de decomposição (2026-10-04) promete:
 *   1. sem identidade → 401; x-cron-secret inválido → 401; CRON_SECRET vazio/ausente
 *      NÃO habilita o caminho do cron (fail-closed) → 401;
 *   2. usuário comum (JWT válido sem papel admin/supervisor) → 403; JWT inválido → 401;
 *   3. admin/supervisor e x-cron-secret válido → autorizados (scan roda, fecha 200);
 *   4. nenhuma rejeição toca o banco: zero scan (.from), zero insert e zero update.
 *
 * Roda sem rede, sem banco e sem env: tudo entra por `injected`.
 * Comando do CI: deno test --config scripts/ci/deno.json --frozen --allow-env <este arquivo>
 */
import { handleAutoCloseConversations, CRON_SECRET_HEADER, CRON_SECRET_ENV } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const TEST_CRON_SECRET = "cron-secret-auto-close-64chars-for-timing-safe-comparison-xxxxx";

interface ServiceCtx {
  tables: string[];
  selects: string[];
  inserts: Array<{ table: string; row: unknown }>;
  updates: Array<{ table: string; row: unknown }>;
}

interface ServiceOpts {
  config?: unknown;
  staleContacts?: unknown[];
}

/**
 * Client service role falso: responde `auto_close_config`/`contacts` conforme a
 * cadeia PostgREST capturada e registra TODO acesso de tabela, insert e update — é
 * assim que o teste prova "nenhum efeito após rejeição".
 */
function makeServiceClient(opts: ServiceOpts = {}): { client: unknown; ctx: ServiceCtx } {
  const ctx: ServiceCtx = { tables: [], selects: [], inserts: [], updates: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function from(table: string): any {
    ctx.tables.push(table);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: Record<string, any> = {};
    const chain = () => b;
    b.select = () => {
      ctx.selects.push(table);
      return b;
    };
    b.eq = chain;
    b.lt = chain;
    b.not = chain;
    b.is = chain;
    b.limit = chain;
    b.order = chain;
    b.maybeSingle = () =>
      Promise.resolve({ data: table === "auto_close_config" ? (opts.config ?? null) : null, error: null });
    b.insert = (row: Record<string, unknown>) => {
      ctx.inserts.push({ table, row });
      return Promise.resolve({ data: null, error: null });
    };
    b.update = (row: Record<string, unknown>) => {
      ctx.updates.push({ table, row });
      return b;
    };
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
      const value = table === "contacts" ? { data: opts.staleContacts ?? [], error: null } : { data: null, error: null };
      return Promise.resolve(value).then(res, rej);
    };
    b.catch = (rej: (e: unknown) => unknown) => Promise.resolve().catch(rej);
    return b;
  }
  return { client: { from }, ctx };
}

interface AuthClientOpts {
  userId?: string | null;
  userError?: unknown;
  isAdmin?: boolean;
  roleError?: unknown;
}

/** Client anon falso: getUser resolve o usuário e rpc resolve o papel admin/supervisor. */
function makeAuthClient(opts: AuthClientOpts = {}): unknown {
  return {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: opts.userId ? { id: opts.userId } : null },
          error: opts.userError ?? null,
        }),
    },
    rpc: () => Promise.resolve({ data: opts.isAdmin ?? false, error: opts.roleError ?? null }),
  };
}

function makeRequest(opts: { cronSecret?: string; bearer?: string } = {}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.cronSecret !== undefined) headers[CRON_SECRET_HEADER] = opts.cronSecret;
  if (opts.bearer !== undefined) headers["Authorization"] = `Bearer ${opts.bearer}`;
  return new Request("https://edge.test/auto-close-conversations", { method: "POST", headers, body: "{}" });
}

function makeDeps(o: { serviceClient: unknown; authClient?: unknown; cronSecret?: string }): {
  supabase: unknown;
  authClient?: unknown;
  cronSecret?: string;
  env: (key: string) => string | undefined;
} {
  return {
    supabase: o.serviceClient,
    authClient: o.authClient,
    cronSecret: o.cronSecret,
    env: (key: string) => (key === "SUPABASE_URL" ? "https://supabase-test.example" : undefined),
  };
}

function assertNoEffects(ctx: ServiceCtx, label: string): void {
  assert(ctx.tables.length === 0, `${label}: nenhum .from()/scan pode ocorrer (tocou ${ctx.tables.join(",")})`);
  assert(ctx.selects.length === 0, `${label}: nenhum select pode ocorrer (${ctx.selects.length})`);
  assert(ctx.inserts.length === 0, `${label}: nenhum insert/encerramento pode ocorrer (${ctx.inserts.length})`);
  assert(ctx.updates.length === 0, `${label}: nenhum update pode ocorrer (${ctx.updates.length})`);
}

// --------------------------------------------------------------------------- auth

Deno.test("R2-API-022: sem identidade → 401 e nenhum scan/efeito", async () => {
  const { client, ctx } = makeServiceClient();
  const res = await handleAutoCloseConversations(
    makeRequest(),
    makeDeps({ serviceClient: client, cronSecret: TEST_CRON_SECRET }),
  );
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
  assertNoEffects(ctx, "sem identidade");
});

Deno.test("R2-API-022: x-cron-secret inválido → 401 e nenhum scan/efeito", async () => {
  const { client, ctx } = makeServiceClient();
  const res = await handleAutoCloseConversations(
    makeRequest({ cronSecret: "segredo-errado" }),
    makeDeps({ serviceClient: client, cronSecret: TEST_CRON_SECRET }),
  );
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  assertNoEffects(ctx, "cron inválido");
});

Deno.test(`R2-API-022: ${CRON_SECRET_ENV} vazio não habilita cron → 401 (fail-closed)`, async () => {
  const { client, ctx } = makeServiceClient();
  const res = await handleAutoCloseConversations(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ serviceClient: client, cronSecret: "" }),
  );
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  assertNoEffects(ctx, "cron sem segredo configurado");
});

Deno.test("R2-API-022: usuário comum (JWT válido, papel ausente) → 403 e nenhum scan/efeito", async () => {
  const { client, ctx } = makeServiceClient();
  const authClient = makeAuthClient({ userId: "u-comum", isAdmin: false });
  const res = await handleAutoCloseConversations(
    makeRequest({ bearer: "jwt-de-usuario-comum" }),
    makeDeps({ serviceClient: client, authClient, cronSecret: TEST_CRON_SECRET }),
  );
  assert(res.status === 403, `esperado 403, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Forbidden", `body inesperado: ${JSON.stringify(body)}`);
  assertNoEffects(ctx, "usuário comum");
});

Deno.test("R2-API-022: JWT inválido/vencido → 401 e nenhum scan/efeito", async () => {
  const { client, ctx } = makeServiceClient();
  const authClient = makeAuthClient({ userId: null, userError: new Error("invalid token") });
  const res = await handleAutoCloseConversations(
    makeRequest({ bearer: "jwt-invalido" }),
    makeDeps({ serviceClient: client, authClient, cronSecret: TEST_CRON_SECRET }),
  );
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  assertNoEffects(ctx, "jwt inválido");
});

// --------------------------------------------------------------------------- admissão

Deno.test("R2-API-022: admin/supervisor → autorizado e o scan roda (200)", async () => {
  const { client, ctx } = makeServiceClient({ config: null, staleContacts: [] });
  const authClient = makeAuthClient({ userId: "u-admin", isAdmin: true });
  const res = await handleAutoCloseConversations(
    makeRequest({ bearer: "jwt-de-admin" }),
    makeDeps({ serviceClient: client, authClient, cronSecret: TEST_CRON_SECRET }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.message === "Auto-close is disabled", `body inesperado: ${JSON.stringify(body)}`);
  assert(ctx.selects.includes("auto_close_config"), "o scan de auto_close_config deve ocorrer após autorizar");
});

Deno.test("R2-API-022: x-cron-secret válido → autorizado e o scan roda (200)", async () => {
  const { client, ctx } = makeServiceClient({ config: null, staleContacts: [] });
  const res = await handleAutoCloseConversations(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ serviceClient: client, cronSecret: TEST_CRON_SECRET }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.message === "Auto-close is disabled", `body inesperado: ${JSON.stringify(body)}`);
  assert(ctx.selects.includes("auto_close_config"), "o scan de auto_close_config deve ocorrer após autorizar");
});

Deno.test("R2-API-022: fluxo autorizado encerra conversas stale (mensagem + fechamento + desatribuição)", async () => {
  const config = { is_enabled: true, inactivity_hours: 24, close_message: "Conversa encerrada por inatividade." };
  const staleContacts = [{ id: "c-1", name: "Contato", phone: "+55", assigned_to: "p-1" }];
  const { client, ctx } = makeServiceClient({ config, staleContacts });
  const authClient = makeAuthClient({ userId: "u-admin", isAdmin: true });
  const res = await handleAutoCloseConversations(
    makeRequest({ bearer: "jwt-de-admin" }),
    makeDeps({ serviceClient: client, authClient, cronSecret: TEST_CRON_SECRET }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.closed === 1, `esperado closed:1, recebido ${JSON.stringify(body)}`);
  assert(ctx.inserts.some((i) => i.table === "messages"), "deve inserir a mensagem de fechamento");
  assert(ctx.inserts.some((i) => i.table === "conversation_closures"), "deve inserir o fechamento");
  assert(ctx.updates.some((u) => u.table === "contacts"), "deve desatribuir o contato");
});
