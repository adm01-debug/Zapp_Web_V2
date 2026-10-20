/**
 * feat(voice): copiloto de voz busca tarefas pessoais — contrato executável.
 *
 * Defeito/escopo: o copiloto não conhecia as tarefas PESSOAIS do usuário
 * (módulo Tarefas, src/components/tasks/). A ação `search_tasks` lê
 * `conversation_tasks` pelo client do PRÓPRIO chamador (authedClient), para que
 * a RLS real decida o que ele enxerga — o service_role bypassaria a RLS e
 * vazaria tarefa de outra pessoa.
 *
 * O teste chama o handler REAL (`handleVoiceCopilotAction`) com um Request real
 * e dois clients falsos: o `authedClient` (só as tarefas que o usuário vê) e o
 * `supabase` service_role (com uma tarefa SECRETA de outro agente). Se o handler
 * usasse o service_role para `conversation_tasks`, a tarefa secreta vazaria e o
 * teste falharia. Roda offline, sem rede, sem banco e sem env: tudo entra por
 * `deps`.
 *
 * Comando do CI: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read <este arquivo>
 */
import { handleVoiceCopilotAction, type VoiceCopilotDeps } from "./index.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

type Row = Record<string, unknown>;

/** Tarefa do próprio usuário (o que a RLS dele deixa ver). */
const MINHA: Row = {
  id: "t-minha",
  title: "Enviar proposta",
  description: null,
  status: "doing",
  priority: "alta",
  due_date: "2026-10-11T12:00:00.000Z",
  assigned_to: "u1",
  created_by: "u1",
  contact_id: null,
};

/** Tarefa que o usuário NÃO vê (fica no client service_role). */
const SECRETA: Row = {
  id: "t-secreta",
  title: "Tarefa confidencial de outro agente",
  description: null,
  status: "todo",
  priority: "alta",
  due_date: null,
  assigned_to: "u2",
  created_by: "u2",
  contact_id: null,
};

interface ClientCtx {
  tables: string[];
  filters: string[];
}

/** Parseia `title.ilike."%x%",description.ilike."%y%"` do `.or()` do PostgREST. */
function parseOrIlike(expr: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const part of expr.split(",")) {
    const m = /^([a-z_]+)\.ilike\.(.*)$/.exec(part);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) {
      v = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    out.push([m[1], v.replace(/^%/, "").replace(/%$/, "")]);
  }
  return out;
}

/**
 * Client falso no formato do PostgREST. Registra tabelas/filtros usados (é assim
 * que o teste prova QUAL client leu `conversation_tasks`) e aplica os filtros
 * sobre as linhas que aquele client "enxerga".
 */
function makeClient(rows: Row[]): { client: unknown; ctx: ClientCtx } {
  const ctx: ClientCtx = { tables: [], filters: [] };
  function from(table: string) {
    ctx.tables.push(table);
    const predicates: Array<(r: Row) => boolean> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: Record<string, any> = {};
    const chain = () => b;
    b.select = chain;
    b.order = chain;
    b.limit = chain;
    b.eq = (col: string, val: unknown) => {
      ctx.filters.push(`eq:${col}:${String(val)}`);
      predicates.push((r) => String(r[col]) === String(val));
      return b;
    };
    b.not = (col: string, op: string, val: string) => {
      ctx.filters.push(`not:${col}:${op}:${val}`);
      const list = val.replace(/^\(/, "").replace(/\)$/, "").split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
      predicates.push((r) => !list.includes(String(r[col])));
      return b;
    };
    b.or = (expr: string) => {
      ctx.filters.push(`or:${expr}`);
      const terms = parseOrIlike(expr);
      predicates.push((r) => terms.some(([col, term]) => String(r[col] ?? "").toLowerCase().includes(term.toLowerCase())));
      return b;
    };
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows.filter((r) => predicates.every((p) => p(r))), error: null }).then(res, rej);
    b.catch = (rej: (e: unknown) => unknown) => Promise.resolve().catch(rej);
    return b;
  }
  return { client: { from }, ctx };
}

function makeRequest(body: unknown): Request {
  return new Request("https://edge.test/voice-copilot-action", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
    body: JSON.stringify(body),
  });
}

function makeDeps(visible: Row[], secret: Row[]): { deps: VoiceCopilotDeps; authed: ClientCtx; service: ClientCtx } {
  const authed = makeClient(visible);
  const service = makeClient(secret);
  const deps: VoiceCopilotDeps = {
    authorize: () => Promise.resolve({ userId: "user-1" }),
    supabase: service.client as never,
    authedClient: authed.client as never,
    env: (key) => `env-${key}`,
  };
  return { deps, authed: authed.ctx, service: service.ctx };
}

async function callSearchTasks(deps: VoiceCopilotDeps, params: Record<string, unknown>): Promise<Row[]> {
  const res = await handleVoiceCopilotAction(makeRequest({ action: "search_tasks", params }), deps);
  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const body = await res.json() as { result: unknown };
  assert(Array.isArray(body.result), `search_tasks deve devolver lista, veio ${JSON.stringify(body.result)}`);
  return body.result as Row[];
}

Deno.test("search_tasks: não devolve tarefa de outro usuário — a leitura sai pelo client do caller (RLS), nunca pelo service_role", async () => {
  const { deps, authed, service } = makeDeps([MINHA], [SECRETA]);

  const ids = (await callSearchTasks(deps, {})).map((r) => r.id);

  assert(ids.includes("t-minha"), "a tarefa visível ao usuário deveria aparecer");
  assert(!ids.includes("t-secreta"), "VAZAMENTO: tarefa de outro usuário voltou pelo agente");
  assert(authed.tables.includes("conversation_tasks"), "conversation_tasks deveria ser lida pelo client do caller (RLS real)");
  assert(
    !service.tables.includes("conversation_tasks"),
    "o service_role NÃO pode ler conversation_tasks: ele bypassa a RLS",
  );
});

Deno.test("search_tasks: busca por texto livre filtra título E descrição", async () => {
  const outra: Row = { ...MINHA, id: "t-outra", title: "Ligar para o fornecedor", description: null };
  const porDescricao: Row = { ...MINHA, id: "t-desc", title: "Follow-up", description: "enviar a proposta revisada" };
  const { deps, authed } = makeDeps([MINHA, outra, porDescricao], []);

  const ids = (await callSearchTasks(deps, { query: "proposta" })).map((r) => r.id).sort();

  assert(
    JSON.stringify(ids) === JSON.stringify(["t-desc", "t-minha"]),
    `esperava as duas tarefas com 'proposta' (título e descrição), veio ${JSON.stringify(ids)}`,
  );
  assert(
    authed.filters.some((f) => f.startsWith("or:") && f.includes("title.ilike") && f.includes("description.ilike")),
    "o filtro de texto deveria cobrir título E descrição",
  );
});

Deno.test("search_tasks: 'minhas tarefas abertas' exclui done e cancelled", async () => {
  const todo: Row = { ...MINHA, id: "t-todo", status: "todo" };
  const doing: Row = { ...MINHA, id: "t-doing", status: "doing" };
  const done: Row = { ...MINHA, id: "t-done", status: "done" };
  const cancelled: Row = { ...MINHA, id: "t-cancelled", status: "cancelled" };
  const { deps, authed } = makeDeps([todo, doing, done, cancelled], []);

  const ids = (await callSearchTasks(deps, { status: "abertas" })).map((r) => r.id).sort();

  assert(
    JSON.stringify(ids) === JSON.stringify(["t-doing", "t-todo"]),
    `'abertas' deveria trazer só todo/doing, veio ${JSON.stringify(ids)}`,
  );
  assert(
    authed.filters.includes("not:status:in:(done,cancelled)"),
    "o atalho 'abertas' deveria filtrar status NOT IN (done,cancelled)",
  );
});

Deno.test("search_tasks: status canônico filtra exatamente aquele status", async () => {
  const todo: Row = { ...MINHA, id: "t-todo", status: "todo" };
  const doing: Row = { ...MINHA, id: "t-doing", status: "doing" };
  const { deps, authed } = makeDeps([todo, doing], []);

  const ids = (await callSearchTasks(deps, { status: "doing" })).map((r) => r.id);

  assert(JSON.stringify(ids) === JSON.stringify(["t-doing"]), `esperava só 'doing', veio ${JSON.stringify(ids)}`);
  assert(authed.filters.includes("eq:status:doing"), "deveria filtrar status = doing no banco");
});

Deno.test("search_tasks: status fora do vocabulário recusa sem consultar o banco", async () => {
  const { deps, authed } = makeDeps([MINHA], []);

  const rows = await callSearchTasks(deps, { status: "urgente" });

  assert(rows.length === 0, "status inválido deve devolver lista vazia");
  assert(authed.tables.length === 0, "status inválido não deveria tocar o banco");
});

Deno.test("search_tasks: termo sem correspondência devolve lista vazia (não inventa tarefa)", async () => {
  const { deps } = makeDeps([MINHA], []);

  const rows = await callSearchTasks(deps, { query: "xyz-nao-existe" });

  assert(rows.length === 0, "nenhuma tarefa casa com o termo: a resposta deve ser vazia");
});
