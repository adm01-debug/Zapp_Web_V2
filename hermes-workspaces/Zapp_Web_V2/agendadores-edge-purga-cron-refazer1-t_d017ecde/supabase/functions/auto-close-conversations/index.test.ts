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
 * R2-API-028 (item #203): cada escrita do encerramento é conferida; `closed` só
 * sobe quando todas concluem.
 *
 * PK-01 (t_ec25181f) — inatividade de verdade e lote:
 *   - inatividade medida pela ÚLTIMA MENSAGEM, não por contacts.updated_at;
 *   - só conversa aberta, viva (deleted_at IS NULL) e atribuída;
 *   - teto de 200 contatos por execução;
 *   - mensagem de encerramento ENFILEIRADA no outbox (status 'sending' +
 *     client_message_id), não inserida como enviada;
 *   - reexecução (23505 no client_message_id) não duplica fechamento/desatribuição.
 *
 * Roda sem rede, sem banco e sem env: tudo entra por `injected`.
 * Comando do CI: deno test --config scripts/ci/deno.json --frozen --allow-env <este arquivo>
 */
import {
  handleAutoCloseConversations,
  CRON_SECRET_HEADER,
  CRON_SECRET_ENV,
  AUTO_CLOSE_BATCH_LIMIT,
  AUTO_CLOSE_CLIENT_MESSAGE_PREFIX,
  deriveAutoCloseClientMessageId,
} from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const TEST_CRON_SECRET = "cron-secret-auto-close-64chars-for-timing-safe-comparison-xxxxx";
/** Mensagem antiga o bastante para ser considerada inatividade em qualquer execução. */
const DEFAULT_STALE_AT = "2020-01-01T00:00:00.000Z";

interface ServiceCtx {
  tables: string[];
  selects: string[];
  inserts: Array<{ table: string; row: unknown }>;
  updates: Array<{ table: string; row: unknown; id?: string }>;
  filters: Array<{ table: string; op: string; args: unknown[] }>;
}

interface LastMessage {
  contact_id: string;
  sender: string;
  created_at: string;
}

interface ServiceOpts {
  config?: unknown;
  staleContacts?: unknown[];
  /** Última mensagem por contato (select em `messages`). Ausente → default stale/agent. */
  lastMessages?: LastMessage[];
  /** Erro PostgREST devolvido pelo insert da tabela (valor fixo ou função da linha). */
  insertErrors?: Record<string, unknown>;
  /** Erro PostgREST devolvido pelo update da tabela (valor fixo ou função da linha). */
  updateErrors?: Record<string, unknown>;
}

/** Permite injetar o erro por linha (ex.: só o 2º contato falha), como o PostgREST faz. */
function resolveInjectedError(injected: unknown, row: Record<string, unknown>): unknown {
  if (typeof injected === "function") {
    return (injected as (r: Record<string, unknown>) => unknown)(row);
  }
  return injected ?? null;
}

/**
 * Client service role falso: responde `auto_close_config`/`contacts`/`messages`
 * conforme a cadeia PostgREST capturada e registra TODO acesso de tabela, insert,
 * update e filtro — é assim que o teste prova "nenhum efeito após rejeição" e
 * "o lote caiu no teto de 200".
 */
function makeServiceClient(opts: ServiceOpts = {}): { client: unknown; ctx: ServiceCtx } {
  const ctx: ServiceCtx = { tables: [], selects: [], inserts: [], updates: [], filters: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function from(table: string): any {
    ctx.tables.push(table);
    let mode: "select" | "insert" | "update" = "select";
    let contactId: string | undefined;
    let pendingUpdateRow: Record<string, unknown> | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: Record<string, any> = {};
    const chain = () => b;
    b.select = () => {
      ctx.selects.push(table);
      mode = "select";
      return b;
    };
    b.lt = chain;
    b.eq = (col: string, val: unknown) => {
      ctx.filters.push({ table, op: "eq", args: [col, val] });
      if (col === "contact_id") contactId = val as string;
      return b;
    };
    b.not = (...args: unknown[]) => {
      ctx.filters.push({ table, op: "not", args });
      return b;
    };
    b.is = (...args: unknown[]) => {
      ctx.filters.push({ table, op: "is", args });
      return b;
    };
    b.limit = (n: number) => {
      ctx.filters.push({ table, op: "limit", args: [n] });
      return b;
    };
    b.order = (...args: unknown[]) => {
      ctx.filters.push({ table, op: "order", args });
      return b;
    };
    b.maybeSingle = () =>
      Promise.resolve({ data: table === "auto_close_config" ? (opts.config ?? null) : null, error: null });
    b.insert = (row: Record<string, unknown>) => {
      ctx.inserts.push({ table, row });
      return Promise.resolve({ data: null, error: resolveInjectedError(opts.insertErrors?.[table], row) });
    };
    b.update = (row: Record<string, unknown>) => {
      pendingUpdateRow = row;
      mode = "update";
      return b;
    };
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
      let value: { data: unknown; error: unknown };
      if (mode === "update") {
        ctx.updates.push({ table, row: pendingUpdateRow, id: contactId });
        value = { data: null, error: resolveInjectedError(opts.updateErrors?.[table], pendingUpdateRow ?? {}) };
      } else if (table === "contacts") {
        value = { data: opts.staleContacts ?? [], error: null };
      } else if (table === "messages") {
        const rows = opts.lastMessages
          ? opts.lastMessages.filter((m) => m.contact_id === contactId)
          : contactId
          ? [{ contact_id: contactId, sender: "agent", created_at: DEFAULT_STALE_AT }]
          : [];
        value = { data: rows, error: null };
      } else {
        value = { data: null, error: null };
      }
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

Deno.test("R2-API-022: fluxo autorizado encerra conversas stale (outbox + fechamento + desatribuição)", async () => {
  const config = { is_enabled: true, inactivity_hours: 24, close_message: "Conversa encerrada por inatividade." };
  const staleContacts = [
    {
      id: "c-1",
      name: "Contato",
      phone: "+55",
      assigned_to: "p-1",
      whatsapp_connection_id: "w-1",
      conversation_status: "open",
      deleted_at: null,
    },
  ];
  const { client, ctx } = makeServiceClient({ config, staleContacts });
  const authClient = makeAuthClient({ userId: "u-admin", isAdmin: true });
  const res = await handleAutoCloseConversations(
    makeRequest({ bearer: "jwt-de-admin" }),
    makeDeps({ serviceClient: client, authClient, cronSecret: TEST_CRON_SECRET }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.closed === 1, `esperado closed:1, recebido ${JSON.stringify(body)}`);
  assert(ctx.inserts.some((i) => i.table === "messages"), "deve enfileirar a mensagem de fechamento");
  assert(ctx.inserts.some((i) => i.table === "conversation_closures"), "deve inserir o fechamento");
  assert(ctx.updates.some((u) => u.table === "contacts"), "deve desatribuir o contato");
});

// ------------------------------------------------- R2-API-028 / item #203
//
// O defeito: o laço ignorava o `error` das três escritas e somava `closed++`
// de qualquer jeito — o relatório do cron anunciava encerramento que não
// aconteceu. Agora só conta quando TODAS as escritas da conversa concluem.

const CLOSABLE_CONFIG = {
  is_enabled: true,
  inactivity_hours: 24,
  close_message: "Conversa encerrada por inatividade.",
};
const ONE_STALE = [
  {
    id: "c-1",
    name: "Contato",
    phone: "+55",
    assigned_to: "p-1",
    whatsapp_connection_id: "w-1",
    conversation_status: "open",
    deleted_at: null,
  },
];

function makeCloseRun(opts: { insertErrors?: Record<string, unknown>; updateErrors?: Record<string, unknown>; staleContacts?: unknown[]; lastMessages?: LastMessage[] }) {
  const { client, ctx } = makeServiceClient({
    config: CLOSABLE_CONFIG,
    staleContacts: opts.staleContacts ?? ONE_STALE,
    lastMessages: opts.lastMessages,
    insertErrors: opts.insertErrors,
    updateErrors: opts.updateErrors,
  });
  return { client, ctx };
}

Deno.test("R2-API-028: enqueue da mensagem falha → NÃO conta e não grava fechamento", async () => {
  const { client, ctx } = makeCloseRun({ insertErrors: { messages: { message: "insert denied" } } });
  const res = await handleAutoCloseConversations(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ serviceClient: client, cronSecret: TEST_CRON_SECRET }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.closed === 0, `não pode contar encerramento: ${JSON.stringify(body)}`);
  assert(body.failed === 1, `deve reportar 1 falha: ${JSON.stringify(body)}`);
  assert(ctx.inserts.some((i) => i.table === "messages"), "a tentativa de mensagem tem de ter ocorrido");
  assert(!ctx.inserts.some((i) => i.table === "conversation_closures"), "sem mensagem enfileirada não há fechamento");
  assert(ctx.updates.length === 0, "sem mensagem enfileirada não há desatribuição");
});

Deno.test("R2-API-028: insert do fechamento falha (ex.: já fechado no dia) → NÃO conta encerramento", async () => {
  const { client, ctx } = makeCloseRun({
    insertErrors: { conversation_closures: { code: "23505", message: "duplicate key value violates unique constraint" } },
  });
  const res = await handleAutoCloseConversations(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ serviceClient: client, cronSecret: TEST_CRON_SECRET }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.closed === 0, `não pode contar encerramento: ${JSON.stringify(body)}`);
  assert(body.failed === 1, `deve reportar 1 falha: ${JSON.stringify(body)}`);
  assert(ctx.inserts.some((i) => i.table === "conversation_closures"), "a tentativa de fechamento tem de ter ocorrido");
});

Deno.test("R2-API-028: desatribuição falha → NÃO conta encerramento", async () => {
  const { client, ctx } = makeCloseRun({ updateErrors: { contacts: { message: "update denied" } } });
  const res = await handleAutoCloseConversations(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ serviceClient: client, cronSecret: TEST_CRON_SECRET }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.closed === 0, `não pode contar encerramento: ${JSON.stringify(body)}`);
  assert(body.failed === 1, `deve reportar 1 falha: ${JSON.stringify(body)}`);
  assert(ctx.updates.some((u) => u.table === "contacts"), "a tentativa de desatribuição tem de ter ocorrido");
});

Deno.test("R2-API-028: contagem é por conversa — 1 fecha, 1 falha", async () => {
  const { client } = makeCloseRun({
    staleContacts: [...ONE_STALE, {
      id: "c-2",
      name: "Outro",
      phone: "+55",
      assigned_to: "p-2",
      whatsapp_connection_id: "w-1",
      conversation_status: "open",
      deleted_at: null,
    }],
    insertErrors: {
      conversation_closures: (row: Record<string, unknown>) =>
        row.contact_id === "c-2" ? { message: "closure denied" } : null,
    },
  });
  const res = await handleAutoCloseConversations(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ serviceClient: client, cronSecret: TEST_CRON_SECRET }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.closed === 1, `esperado closed:1, recebido ${JSON.stringify(body)}`);
  assert(body.failed === 1, `esperado failed:1, recebido ${JSON.stringify(body)}`);
});

Deno.test("R2-API-028: conversa sem falha continua contando (guarda de regressão)", async () => {
  const { client } = makeCloseRun({});
  const res = await handleAutoCloseConversations(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ serviceClient: client, cronSecret: TEST_CRON_SECRET }),
  );
  const body = await res.json();
  assert(body.closed === 1, `esperado closed:1, recebido ${JSON.stringify(body)}`);
  assert(body.failed === 0, `esperado failed:0, recebido ${JSON.stringify(body)}`);
});

// ---------------------------------------- PK-01 / t_ec25181f — inatividade real + lote

const openContact = (id: string, assigned = "p-1", connection = "w-1") => ({
  id,
  assigned_to: assigned,
  conversation_status: "open",
  deleted_at: null,
  whatsapp_connection_id: connection,
});
const staleLast = (contact_id: string, sender = "agent"): LastMessage => ({
  contact_id,
  sender,
  created_at: DEFAULT_STALE_AT,
});

Deno.test("PK-01: conversa resolvida/arquivada ou contato excluído/sem dono NÃO é encerrada", async () => {
  const staleContacts = [
    openContact("c-open"),
    { id: "c-res", assigned_to: "p-1", conversation_status: "resolved", deleted_at: null, whatsapp_connection_id: "w-1" },
    { id: "c-arc", assigned_to: "p-1", conversation_status: "archived", deleted_at: null, whatsapp_connection_id: "w-1" },
    { id: "c-del", assigned_to: "p-1", conversation_status: "open", deleted_at: "2026-01-01T00:00:00.000Z", whatsapp_connection_id: "w-1" },
    { id: "c-null", assigned_to: null, conversation_status: "open", deleted_at: null, whatsapp_connection_id: "w-1" },
  ];
  const lastMessages = ["c-open", "c-res", "c-arc", "c-del"].map((id) => staleLast(id));
  const { client, ctx } = makeCloseRun({ staleContacts, lastMessages });
  const res = await handleAutoCloseConversations(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ serviceClient: client, cronSecret: TEST_CRON_SECRET }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.closed === 1, `só a conversa aberta pode fechar: ${JSON.stringify(body)}`);
  const ignored = new Set(["c-res", "c-arc", "c-del", "c-null"]);
  const touched = [
    ...ctx.inserts.map((i) => (i.row as { contact_id?: string })?.contact_id),
    ...ctx.updates.map((u) => u.id),
  ].filter((id): id is string => typeof id === "string");
  assert(!touched.some((id) => ignored.has(id)), `nada podia tocar ${JSON.stringify(touched)}`);
});

Deno.test("PK-01: atividade recente ou última mensagem do cliente não fecha", async () => {
  const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h atrás (< 24h)
  const staleContacts = [openContact("c-recent", "p-1"), openContact("c-client", "p-2"), openContact("c-empty", "p-3")];
  const lastMessages: LastMessage[] = [
    { contact_id: "c-recent", sender: "agent", created_at: recent },
    { contact_id: "c-client", sender: "contact", created_at: DEFAULT_STALE_AT },
  ];
  const { client, ctx } = makeCloseRun({ staleContacts, lastMessages });
  const res = await handleAutoCloseConversations(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ serviceClient: client, cronSecret: TEST_CRON_SECRET }),
  );
  const body = await res.json();
  assert(body.closed === 0, `nada pode fechar: ${JSON.stringify(body)}`);
  assert(body.skipped === 3, `as 3 conversas devem ser puladas: ${JSON.stringify(body)}`);
  assert(ctx.inserts.length === 0 && ctx.updates.length === 0, "pular não pode escrever nada");
});

Deno.test("PK-01: teto de 200 contatos por execução", async () => {
  const staleContacts = Array.from({ length: 250 }, (_, i) => openContact(`c-${i}`, `p-${i}`, `w-${i}`));
  const lastMessages = staleContacts.map((c) => staleLast((c as { id: string }).id));
  const { client, ctx } = makeCloseRun({ staleContacts, lastMessages });
  const res = await handleAutoCloseConversations(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ serviceClient: client, cronSecret: TEST_CRON_SECRET }),
  );
  const body = await res.json();
  const enqueued = ctx.inserts.filter((i) => i.table === "messages").length;
  assert(enqueued === AUTO_CLOSE_BATCH_LIMIT, `esperado ${AUTO_CLOSE_BATCH_LIMIT} enfileiradas, recebido ${enqueued}`);
  assert(body.closed === AUTO_CLOSE_BATCH_LIMIT, `esperado closed:${AUTO_CLOSE_BATCH_LIMIT}: ${JSON.stringify(body)}`);
  assert(
    ctx.filters.some((f) => f.table === "contacts" && f.op === "limit" && f.args[0] === AUTO_CLOSE_BATCH_LIMIT),
    "a consulta de contatos precisa limitar no banco ao teto do lote",
  );
});

Deno.test("PK-01: mensagem de encerramento é enfileirada no outbox, não inserida como enviada", async () => {
  const staleContacts = [openContact("c-1", "p-9", "w-9")];
  const lastMessages = [staleLast("c-1")];
  const { client, ctx } = makeCloseRun({ staleContacts, lastMessages });
  const res = await handleAutoCloseConversations(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ serviceClient: client, cronSecret: TEST_CRON_SECRET }),
  );
  const body = await res.json();
  assert(body.closed === 1, `esperado closed:1, recebido ${JSON.stringify(body)}`);
  const row = ctx.inserts.find((i) => i.table === "messages")?.row as Record<string, unknown>;
  assert(row.status === "sending", `a mensagem precisa nascer 'sending' (outbox), recebido ${String(row.status)}`);
  assert(row.sender === "agent", `sender inesperado: ${String(row.sender)}`);
  assert(row.agent_id === "p-9", "agent_id deve ser o responsável pela conversa");
  assert(row.whatsapp_connection_id === "w-9", "a conexão tem de acompanhar o enfileiramento");
  assert(row.is_read === true, "mensagem de sistema é lida");
  assert(!("external_id" in row), "não pode gravar id do provedor — quem envia é o despacho");
  const expected = await deriveAutoCloseClientMessageId(`${AUTO_CLOSE_CLIENT_MESSAGE_PREFIX}c-1:${DEFAULT_STALE_AT}`);
  assert(row.client_message_id === expected, `client_message_id divergente: ${String(row.client_message_id)}`);
});

Deno.test("PK-01: clientMessageId é determinístico (mesmo seed → mesmo UUID)", async () => {
  const seed = `${AUTO_CLOSE_CLIENT_MESSAGE_PREFIX}c-1:${DEFAULT_STALE_AT}`;
  const a = await deriveAutoCloseClientMessageId(seed);
  const b = await deriveAutoCloseClientMessageId(seed);
  const c = await deriveAutoCloseClientMessageId(`${seed}:outro`);
  assert(a === b, "o mesmo seed deve produzir o mesmo UUID (base da idempotência)");
  assert(a !== c, "seeds diferentes devem produzir UUIDs diferentes");
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(a), `não é UUID: ${a}`);
});

Deno.test("PK-01: reexecução não duplica (enqueue já existente → 23505)", async () => {
  const { client, ctx } = makeCloseRun({
    insertErrors: { messages: { code: "23505", message: "duplicate key value violates unique constraint" } },
  });
  const res = await handleAutoCloseConversations(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    makeDeps({ serviceClient: client, cronSecret: TEST_CRON_SECRET }),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.closed === 0, `não pode fechar de novo: ${JSON.stringify(body)}`);
  assert(body.failed === 0, `23505 não é falha: ${JSON.stringify(body)}`);
  assert(body.skipped === 1, `deve contar como pulada: ${JSON.stringify(body)}`);
  assert(!ctx.inserts.some((i) => i.table === "conversation_closures"), "não pode duplicar o fechamento");
  assert(ctx.updates.length === 0, "não pode desatribuir de novo");
});
