/**
 * Contrato executável do copiloto de voz (`voice-copilot-action`). Cobre duas
 * ações que o handler REAL expõe:
 *
 *  - `search_tasks` — tarefas PESSOAIS do módulo Tarefas (src/components/tasks/):
 *    a leitura sai pelo client do PRÓPRIO chamador (authedClient) para que a RLS
 *    real decida o que ele enxerga; o service_role (que bypassa a RLS) nunca lê
 *    `conversation_tasks`, senão vazaria tarefa de outra pessoa.
 *
 *  - `search_files_in_conversation` (cartão t_b8b573c3) — o copiloto precisa
 *    ACHAR ARQUIVO numa conversa. O defeito medido: `voice-copilot-action` tinha
 *    7 ações e nenhuma devolvia arquivo de conversa; pedir "acha o contrato.pdf"
 *    não tinha para onde ir. A ação devolve o `messageId` que o frontend usa
 *    para abrir a conversa rolada até o arquivo; a visibilidade é decidida pela
 *    RLS de `messages` e a leitura vai SEMPRE pelo authedClient (token do próprio
 *    chamador) — o service_role nunca é tocado.
 *
 * Além disso, provamos que a busca por arquivo não varre tudo quando não foi dito
 * nem o termo nem a conversa, e que nenhum dos dois clientes service_role é
 * acionado nessas leituras.
 *
 * O teste chama o handler REAL (`handleVoiceCopilotAction`) com Request real e
 * clients falsos injetados por `deps` (VoiceCopilotDeps). Roda offline, sem rede,
 * sem banco e sem env.
 *
 * Comando do CI: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read <este arquivo>
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { handleVoiceCopilotAction, type VoiceCopilotDeps } from "./index.ts";

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

// ---------------------------------------------------------------------------
// search_files_in_conversation — cartão t_b8b573c3
// ---------------------------------------------------------------------------

const UID = "0f1e2d3c-4b5a-4978-8899-aabbccddeeff";
const CONVERSA_A = "11111111-1111-4111-8111-111111111111";
const CONVERSA_B = "22222222-2222-4222-8222-222222222222";
const MSG_CONTRATO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MSG_FOTO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Linha = Record<string, unknown>;

function arquivo(id: string, conversa: string, tipo: string, nome: string): Linha {
  return {
    id,
    contact_id: conversa,
    media_type: tipo,
    media_filename: nome,
    media_url: `https://storage.local/${nome}`,
    is_deleted: false,
    created_at: "2026-10-10T12:00:00.000Z",
  };
}

/** Uma consulta PostgREST registrada (para conferir os filtros emitidos). */
interface Consulta {
  table: string;
  calls: string[];
}

/**
 * Client autenticado falso: devolve só as linhas que "a RLS" dá ao chamador.
 * `visiveis` é o que o usuário enxerga — a mesma fronteira que a RLS de
 * `messages` aplica em produção (contatos atribuídos ao profile ou admin).
 */
function fakeAuthedClient(
  visiveis: Linha[],
  consultas: Consulta[],
): { from: (table: string) => unknown } {
  return {
    from(table: string) {
      const consulta: Consulta = { table, calls: [] };
      consultas.push(consulta);
      const b: Record<string, unknown> = {};
      const encadeia = (nome: string, ...args: unknown[]) => {
        consulta.calls.push(`${nome}:${args.map((a) => JSON.stringify(a)).join(",")}`);
        return b;
      };
      b.select = (...a: unknown[]) => encadeia("select", ...a);
      b.not = (...a: unknown[]) => encadeia("not", ...a);
      b.eq = (...a: unknown[]) => encadeia("eq", ...a);
      b.or = (...a: unknown[]) => encadeia("or", ...a);
      b.order = (...a: unknown[]) => encadeia("order", ...a);
      b.limit = (...a: unknown[]) => encadeia("limit", ...a);
      b.then = (resolve: (v: unknown) => void) => resolve({ data: visiveis, error: null });
      return b;
    },
  };
}

/** service_role falso: se for usado para ler qualquer coisa, explode. */
function fakeServiceClient(tocados: string[]): { from: (table: string) => unknown } {
  return {
    from(table: string) {
      tocados.push(table);
      throw new Error(`service_role não pode ser usado aqui (tabela ${table})`);
    },
  };
}

function pedido(action: string, params: Record<string, unknown>): Request {
  return new Request("https://local.test/voice-copilot-action", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer token-de-teste" },
    body: JSON.stringify({ action, params }),
  });
}

interface Cenario {
  deps: VoiceCopilotDeps;
  consultas: Consulta[];
  serviceTocado: string[];
}

function cenario(visiveis: Linha[]): Cenario {
  const consultas: Consulta[] = [];
  const serviceTocado: string[] = [];
  return {
    consultas,
    serviceTocado,
    deps: {
      authorize: () => Promise.resolve({ userId: UID }),
      authedClient: fakeAuthedClient(visiveis, consultas) as never,
      supabase: fakeServiceClient(serviceTocado) as never,
      env: (key) => `env-${key}`,
    },
  };
}

async function chamar(
  c: Cenario,
  params: Record<string, unknown>,
): Promise<{ status: number; result: unknown }> {
  const res = await handleVoiceCopilotAction(
    pedido("search_files_in_conversation", params),
    c.deps,
  );
  const body = await res.json();
  return { status: res.status, result: body.result };
}

Deno.test("acha o arquivo pelo nome e devolve o messageId da conversa", async () => {
  const c = cenario([arquivo(MSG_CONTRATO, CONVERSA_A, "document", "contrato.pdf")]);
  const { status, result } = await chamar(c, { query: "contrato", contactId: CONVERSA_A });

  assertEquals(status, 200);
  const linhas = result as Array<Record<string, unknown>>;
  assertEquals(linhas.length, 1);
  // O id é o que o frontend usa para abrir a conversa rolada até o arquivo.
  assertEquals(linhas[0].messageId, MSG_CONTRATO);
  assertEquals(linhas[0].filename, "contrato.pdf");
  assertEquals(linhas[0].contactId, CONVERSA_A);

  // A leitura foi em `messages`, pelo authedClient, filtrando nome E tipo.
  const consulta = c.consultas.find((x) => x.table === "messages");
  assert(consulta, "a busca tem de consultar messages");
  const or = consulta!.calls.find((x) => x.startsWith("or:"));
  assert(or?.includes("media_filename.ilike"), "o nome do arquivo é filtrado no servidor");
  assert(or?.includes("media_type.ilike"), "o tipo do arquivo também é filtrado no servidor");
  assert(consulta!.calls.some((x) => x.startsWith("limit:")), "a busca é limitada");
  assert(
    consulta!.calls.some((x) => x.startsWith("eq:") && x.includes("contact_id")),
    "restrita à conversa dita",
  );

  // E o service_role (que bypassa a RLS) não foi tocado.
  assertEquals(c.serviceTocado, []);
});

Deno.test("usuário sem visibilidade NÃO recebe o arquivo (RLS decide)", async () => {
  // Mesmo arquivo existe, mas a RLS não o dá a este chamador (contato não é dele).
  const c = cenario([]);
  const { status, result } = await chamar(c, { query: "contrato", contactId: CONVERSA_A });

  assertEquals(status, 200);
  assertEquals(result, []);
  assertEquals(c.serviceTocado, []);
});

Deno.test("nenhum resultado quando não há arquivo na conversa", async () => {
  const c = cenario([]);
  const { status, result } = await chamar(c, { query: "proposta", contactId: CONVERSA_B });

  assertEquals(status, 200);
  assertEquals(result, []);
});

Deno.test("sem termo e sem conversa não varre tudo: devolve vazio e nem consulta", async () => {
  const c = cenario([arquivo(MSG_FOTO, CONVERSA_A, "image", "foto.png")]);
  const { status, result } = await chamar(c, {});

  assertEquals(status, 200);
  assertEquals(result, []);
  assertEquals(c.consultas, [], "sem intenção dita, nenhuma consulta é emitida");
});

Deno.test("busca pelo tipo leva o media_type ao filtro do servidor", async () => {
  const c = cenario([
    arquivo(MSG_CONTRATO, CONVERSA_A, "document", "contrato.pdf"),
    arquivo(MSG_FOTO, CONVERSA_A, "image", "foto.png"),
  ]);
  const { status, result } = await chamar(c, { query: "image", contactId: CONVERSA_A });

  assertEquals(status, 200);
  const consulta = c.consultas.find((x) => x.table === "messages");
  const or = consulta!.calls.find((x) => x.startsWith("or:"));
  assert(or?.includes("media_type.ilike"), "media_type entra no filtro do banco");
  assertEquals((result as unknown[]).length, 2);
});
