/**
 * CT-77 — contratos executáveis das 6 ações da edge `promogifts-catalog`
 * (list_products, get_product, list_categories, list_suppliers, catalog_stats,
 * bootstrap) + rate limit.
 *
 * O extClient é criado com `Deno.env.get(PROMOGIFTS_SUPABASE_*)` dentro do
 * handler; para exercitar as ações sem banco real o handler expõe o seam
 * opcional `CatalogHandlerDeps` (index.ts) e o client falso é injetado por ele
 * — produção segue criando os clients como antes (deps undefined).
 *
 * Sem imports de `std/assert`: o lock do CI é `--frozen`, então as asserções
 * são locais (mesmo padrão de index.test.ts / crm-integration/index.test.ts).
 */
import { promogiftsCatalogHandler, RATE_LIMIT, type CatalogHandlerDeps } from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message ?? 'assertEquals falhou'}: esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`,
    );
  }
}

function assertExists<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === null || value === undefined) throw new Error(message ?? 'valor não existe');
}

type ExtClient = NonNullable<CatalogHandlerDeps['extClient']>;
type LocalClient = NonNullable<CatalogHandlerDeps['localClient']>;

interface CatalogResult {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

interface RecordedCall {
  table: string;
  methods: string[];
  args: unknown[][];
}

/**
 * Builder encadeável mínimo do PostgREST: cada método filtra/organiza e volta
 * no próprio builder; `await` (via `then`) ou `maybeSingle()` resolvem no
 * próximo resultado enfileirado para a tabela, na ordem das chamadas.
 */
class MockQueryBuilder {
  private readonly methods: string[] = [];
  private readonly args: unknown[][] = [];

  constructor(
    private readonly table: string,
    private readonly queue: CatalogResult[],
    private readonly log: RecordedCall[],
  ) {}

  private chain(name: string, callArgs: unknown[]): this {
    this.methods.push(name);
    this.args.push(callArgs);
    return this;
  }

  select(...a: unknown[]): this { return this.chain('select', a); }
  eq(...a: unknown[]): this { return this.chain('eq', a); }
  in(...a: unknown[]): this { return this.chain('in', a); }
  is(...a: unknown[]): this { return this.chain('is', a); }
  like(...a: unknown[]): this { return this.chain('like', a); }
  gte(...a: unknown[]): this { return this.chain('gte', a); }
  lte(...a: unknown[]): this { return this.chain('lte', a); }
  not(...a: unknown[]): this { return this.chain('not', a); }
  or(...a: unknown[]): this { return this.chain('or', a); }
  textSearch(...a: unknown[]): this { return this.chain('textSearch', a); }
  order(...a: unknown[]): this { return this.chain('order', a); }
  range(...a: unknown[]): this { return this.chain('range', a); }

  maybeSingle(): Promise<CatalogResult> {
    return this.settle('maybeSingle');
  }

  then<TResult1 = CatalogResult, TResult2 = never>(
    onfulfilled?: ((value: CatalogResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.settle().then(onfulfilled, onrejected);
  }

  private settle(extra?: string): Promise<CatalogResult> {
    if (extra) this.methods.push(extra);
    this.log.push({ table: this.table, methods: [...this.methods], args: [...this.args] });
    return Promise.resolve(this.queue.shift() ?? { data: null, error: null, count: 0 });
  }
}

/** Client externo falso: resulta cada tabela/RPC pela fila configurada e
 * registra a cadeia de chamadas para as asserções de filtro. */
class MockCatalogClient {
  readonly calls: RecordedCall[] = [];
  private readonly tables: Record<string, CatalogResult[]>;
  private readonly rpcs: Record<string, CatalogResult[]>;

  constructor(tables: Record<string, CatalogResult[]> = {}, rpcs: Record<string, CatalogResult[]> = {}) {
    this.tables = tables;
    this.rpcs = rpcs;
  }

  from(table: string): MockQueryBuilder {
    const queue = this.tables[table] ?? (this.tables[table] = []);
    return new MockQueryBuilder(table, queue, this.calls);
  }

  rpc(fn: string): Promise<CatalogResult> {
    this.calls.push({ table: `rpc:${fn}`, methods: ['rpc'], args: [[]] });
    const queue = this.rpcs[fn] ?? (this.rpcs[fn] = []);
    return Promise.resolve(queue.shift() ?? { data: null, error: null });
  }
}

/** Client local falso — só o suficiente para a validação do JWT (auth.getUser). */
function localClient(userId: string | null): LocalClient {
  return {
    auth: {
      getUser: async () => (userId
        ? { data: { user: { id: userId } }, error: null }
        : { data: { user: null }, error: { message: 'invalid token' } }),
    },
  } as unknown as LocalClient;
}

function deps(ext: MockCatalogClient, userId = 'user-ct77'): CatalogHandlerDeps {
  return { localClient: localClient(userId), extClient: ext as unknown as ExtClient };
}

function catalogRequest(body: unknown, token: string | null = 'Bearer test-token'): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== null) headers.Authorization = token;
  return new Request('https://edge.invalid/promogifts-catalog', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function invoke(
  body: unknown,
  deps: CatalogHandlerDeps,
  token: string | null = 'Bearer test-token',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await promogiftsCatalogHandler(catalogRequest(body, token), deps);
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function argOf(call: RecordedCall, method: string, index: number): unknown {
  const i = call.methods.indexOf(method);
  assert(i >= 0, `método ${method} não foi chamado em ${call.table}`);
  return call.args[i][index];
}

/** Colunas passadas a `.eq(coluna, valor)` — o método pode repetir na cadeia. */
function eqColumns(call: RecordedCall): unknown[] {
  return call.methods
    .map((method, i) => (method === 'eq' ? call.args[i][0] : null))
    .filter((column) => column !== null);
}

const PRODUCT_ID = '11111111-1111-1111-1111-111111111111';

// ─── Autenticação / configuração ────────────────────────────────

Deno.test('CT-77 sem Authorization devolve 401 e nem toca no client externo', async () => {
  const ext = new MockCatalogClient();
  const response = await promogiftsCatalogHandler(
    catalogRequest({ action: 'catalog_stats' }, null),
    deps(ext),
  );
  assertEquals(response.status, 401);
  assertEquals(ext.calls.length, 0);
});

Deno.test('CT-77 ação desconhecida devolve 400 Invalid request', async () => {
  const ext = new MockCatalogClient();
  const { status, body } = await invoke({ action: 'nao_existe' }, deps(ext));
  assertEquals(status, 400);
  assertEquals(body.error, 'Invalid request');
});

Deno.test('CT-77 sem secrets do catálogo (e sem client injetado) devolve 503 CATALOG_NOT_CONFIGURED', async () => {
  Deno.env.delete('PROMOGIFTS_SUPABASE_URL');
  Deno.env.delete('PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY');
  const { status, body } = await invoke({ action: 'catalog_stats' }, { localClient: localClient('u') });
  assertEquals(status, 503);
  assertEquals(body.code, 'CATALOG_NOT_CONFIGURED');
});

// ─── list_products ──────────────────────────────────────────────

Deno.test('CT-77 list_products devolve data + meta.total e aplica busca sem acento e OR de cores', async () => {
  const ext = new MockCatalogClient({
    products: [{ data: [{ id: 'p1', name: 'Caneca' }], error: null, count: 1 }],
  });
  const { status, body } = await invoke({
    action: 'list_products',
    params: { search: 'açucareiro', color: ['azul', 'verde'], limit: 10, offset: 0 },
  }, deps(ext));

  assertEquals(status, 200);
  assertEquals((body.data as unknown[]).length, 1);
  assertEquals((body.meta as { total: number }).total, 1);

  const productsCall = ext.calls.find((c) => c.table === 'products');
  assertExists(productsCall, 'a ação precisa consultar a tabela products');
  assert(productsCall.methods.includes('range'), 'a consulta paginada precisa de range');
  assert(productsCall.methods.includes('or'), 'o filtro color precisa virar um OR-expr');

  assertEquals(argOf(productsCall, 'textSearch', 0), 'search_vector');
  assertEquals(argOf(productsCall, 'textSearch', 1), 'acucareiro', 'unaccent aplicado ao termo (bate com o vetor)');

  const orExpr = argOf(productsCall, 'or', 0);
  assert(typeof orExpr === 'string' && orExpr.includes('colors.cs.["azul"]'), `OR-expr de cor inesperado: ${String(orExpr)}`);
  assert(orExpr.includes('colors.cs.[{"nome":"verde"}]'), 'cada cor precisa das duas formas (string e {nome})');
});

Deno.test('CT-77 list_products PGRST103 vira página vazia com o total real (não 503)', async () => {
  const ext = new MockCatalogClient({
    products: [
      { data: null, error: { message: 'Requested range not satisfiable', code: 'PGRST103' }, count: null },
      { data: null, error: null, count: 7 },
    ],
  });
  const { status, body } = await invoke({
    action: 'list_products',
    params: { limit: 10, offset: 100 },
  }, deps(ext));

  assertEquals(status, 200);
  assertEquals((body.data as unknown[]).length, 0);
  assertEquals((body.meta as { total: number }).total, 7);
});

Deno.test('CT-77 list_products erro do banco externo vira 503 CATALOG_UPSTREAM_ERROR', async () => {
  const ext = new MockCatalogClient({
    products: [{ data: null, error: { message: 'externo fora do ar' }, count: null }],
  });
  const { status, body } = await invoke({ action: 'list_products' }, deps(ext));
  assertEquals(status, 503);
  assertEquals(body.code, 'CATALOG_UPSTREAM_ERROR');
});

Deno.test('CT-77 list_products credencial inválida (42501) vira 503 CATALOG_CREDENTIALS_INVALID', async () => {
  const ext = new MockCatalogClient({
    products: [{ data: null, error: { message: 'permission denied', code: '42501' }, count: null }],
  });
  const { status, body } = await invoke({ action: 'list_products' }, deps(ext));
  assertEquals(status, 503);
  assertEquals(body.code, 'CATALOG_CREDENTIALS_INVALID');
});

Deno.test('CT-77 list_products parâmetro inválido (limit fora do range) devolve 400', async () => {
  const ext = new MockCatalogClient();
  const { status, body } = await invoke({ action: 'list_products', params: { limit: 0 } }, deps(ext));
  assertEquals(status, 400);
  assertEquals(body.error, 'Invalid parameters');
});

// ─── get_product ────────────────────────────────────────────────

Deno.test('CT-77 get_product devolve o produto com as variants ativas', async () => {
  const ext = new MockCatalogClient({
    products: [{ data: { id: PRODUCT_ID, name: 'Caneca' }, error: null }],
    product_variants: [{ data: [{ id: 'v1', color_name: 'Azul' }], error: null }],
  });
  const { status, body } = await invoke({ action: 'get_product', params: { product_id: PRODUCT_ID } }, deps(ext));

  assertEquals(status, 200);
  const data = body.data as { id: string; variants: unknown[] };
  assertEquals(data.id, PRODUCT_ID);
  assertEquals(data.variants.length, 1);

  const variantsCall = ext.calls.find((c) => c.table === 'product_variants');
  assertExists(variantsCall);
  assert(eqColumns(variantsCall).includes('product_id'), 'filtra a variant pelo produto');
  assert(eqColumns(variantsCall).includes('is_active'), 'só variants ativas');
});

Deno.test('CT-77 get_product inexistente devolve 404 Product not found', async () => {
  const ext = new MockCatalogClient({ products: [{ data: null, error: null }] });
  const { status, body } = await invoke({ action: 'get_product', params: { product_id: PRODUCT_ID } }, deps(ext));
  assertEquals(status, 404);
  assertEquals(body.error, 'Product not found');
});

Deno.test('CT-77 get_product id fora do formato UUID devolve 400 antes de consultar', async () => {
  const ext = new MockCatalogClient();
  const { status, body } = await invoke({ action: 'get_product', params: { product_id: 'nao-uuid' } }, deps(ext));
  assertEquals(status, 400);
  assertEquals(body.error, 'Invalid parameters');
  assertEquals(ext.calls.length, 0);
});

// ─── list_categories / list_suppliers ───────────────────────────

Deno.test('CT-77 list_categories devolve categorias ativas e não deletadas', async () => {
  const ext = new MockCatalogClient({
    categories: [{ data: [{ id: 'c1', name: 'Casa' }], error: null }],
  });
  const { status, body } = await invoke({ action: 'list_categories' }, deps(ext));

  assertEquals(status, 200);
  assertEquals((body.data as unknown[]).length, 1);

  const call = ext.calls.find((c) => c.table === 'categories');
  assertExists(call);
  assertEquals(argOf(call, 'eq', 0), 'is_active');
  assertEquals(argOf(call, 'is', 0), 'deleted_at');
});

Deno.test('CT-77 list_suppliers devolve fornecedores ativos', async () => {
  const ext = new MockCatalogClient({
    suppliers: [{ data: [{ id: 's1', name: 'ACME' }], error: null }],
  });
  const { status, body } = await invoke({ action: 'list_suppliers' }, deps(ext));

  assertEquals(status, 200);
  assertEquals((body.data as unknown[]).length, 1);

  const call = ext.calls.find((c) => c.table === 'suppliers');
  assertExists(call);
  assertEquals(argOf(call, 'eq', 0), 'active');
});

// ─── catalog_stats / bootstrap ──────────────────────────────────

Deno.test('CT-77 catalog_stats chama a RPC e o segundo acesso usa o cache do isolate', async () => {
  const ext = new MockCatalogClient({}, { zapp_catalog_stats: [{ data: { products: 42 }, error: null }] });
  const d = deps(ext);

  const first = await invoke({ action: 'catalog_stats' }, d);
  assertEquals(first.status, 200);
  assertExists(first.body.data);

  const second = await invoke({ action: 'catalog_stats' }, d);
  assertEquals(second.status, 200);
  assertEquals((second.body.meta as { cached: boolean }).cached, true);

  // O cache nunca pode ter batido na RPC mais de uma vez (a primeira chamada
  // pode já vir cacheada por outro teste; o invariante é "no máximo 1").
  const rpcCalls = ext.calls.filter((c) => c.table === 'rpc:zapp_catalog_stats');
  assert(rpcCalls.length <= 1, `RPC chamada ${rpcCalls.length}x — cache não funcionou`);
});

Deno.test('CT-77 bootstrap devolve categorias + fornecedores + stats numa chamada só', async () => {
  const ext = new MockCatalogClient({
    categories: [{ data: [{ id: 'c1' }], error: null }],
    suppliers: [{ data: [{ id: 's1' }], error: null }],
  }, { zapp_catalog_stats: [{ data: { products: 1 }, error: null }] });

  const { status, body } = await invoke({ action: 'bootstrap' }, deps(ext));
  assertEquals(status, 200);

  const data = body.data as { categories: unknown[]; suppliers: unknown[]; stats: unknown };
  assertEquals(data.categories.length, 1);
  assertEquals(data.suppliers.length, 1);
  assertExists(data.stats, 'bootstrap sempre devolve stats (da RPC ou do cache)');
});

// ─── rate limit ─────────────────────────────────────────────────

Deno.test('CT-77 rate limit: as RATE_LIMIT primeiras requisições do mesmo usuário passam e a seguinte devolve 429', async () => {
  const userId = `ct77-ratelimit-${crypto.randomUUID()}`;
  const ext = new MockCatalogClient();

  for (let i = 0; i < RATE_LIMIT; i++) {
    const { status } = await invoke({ action: 'catalog_stats' }, deps(ext, userId));
    assertEquals(status, 200, `requisição ${i + 1}/${RATE_LIMIT} deveria passar`);
  }

  const { status, body } = await invoke({ action: 'catalog_stats' }, deps(ext, userId));
  assertEquals(status, 429);
  assertEquals(body.error, 'Too many requests. Try again in 1 minute.');
});

Deno.test('CT-77 rate limit: o limite do módulo é o alvo atual (60) ou o alvo do CT-19 (120) — teste pronto para a troca', async () => {
  // Não trava o valor: quando o CT-19 subir para 120/min este teste continua
  // válido, e o teste de borda acima acompanha sozinho (deriva de RATE_LIMIT).
  assert(RATE_LIMIT === 60 || RATE_LIMIT === 120, `limite inesperado: ${RATE_LIMIT} (esperado 60 agora, 120 após CT-19)`);
});
