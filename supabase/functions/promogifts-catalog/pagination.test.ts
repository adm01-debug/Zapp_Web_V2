/**
 * OTH-004 (#53) — paginação determinística da listagem/exportação do catálogo.
 *
 * Defeito: `list_products` monta a consulta com apenas `.order(order_by)` antes
 * do `.range()`. Quando vários produtos empatam na chave primária (nome
 * repetido é o caso comum) o Postgres/PostgREST NÃO garante uma ordem entre os
 * empatados: duas execuções (planos diferentes, paralelismo, VACUUM) podem
 * devolver as linhas empatadas em ordens distintas. Com offset/range, isso faz
 * a fronteira de página omitir e duplicar registros — a exportação do catálogo
 * perde produtos e repete outros.
 *
 * O fake abaixo modela essa garantia ausente: a ordem "física" das linhas
 * empatadas é insertion-order numa execução e invertida na seguinte (o que um
 * plano diferente legitimamente faria), a menos que a consulta peça um
 * desempate único (`id`), que torna a ordem totalmente determinística.
 *
 * O teste atravessa a fronteira de página (2 empatados de cada lado) e prova
 * que a união das páginas contém TODOS os ids exatamente uma vez.
 *
 * Sem imports de `std/assert` (o lock do CI é `--frozen`): asserções locais,
 * mesmo padrão de index.test.ts / index.actions.test.ts.
 */
import { promogiftsCatalogHandler, buildProductOrderClauses, type CatalogHandlerDeps } from './index.ts';

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

type Row = Record<string, unknown>;

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  const av = a as string | number;
  const bv = b as string | number;
  return av < bv ? -1 : 1;
}

/**
 * Builder encadeável mínimo do PostgREST que, diferente do fake de
 * index.actions.test.ts, realmente ORDENA e PAGINA as linhas — é o único jeito
 * de reproduzir a omissão/duplicação na fronteira de página.
 */
class FakeProductsBuilder {
  private readonly methods: string[] = [];
  private readonly args: unknown[][] = [];
  private readonly orders: Array<{ column: string; ascending: boolean }> = [];
  private readonly eqs: Array<[string, unknown]> = [];
  private rangeArgs: [number, number] | null = null;

  constructor(
    private readonly table: string,
    private readonly rows: Row[],
    private readonly log: RecordedCall[],
    private readonly nextExecution: () => number,
  ) {}

  private chain(name: string, callArgs: unknown[]): this {
    this.methods.push(name);
    this.args.push(callArgs);
    return this;
  }

  select(...a: unknown[]): this { return this.chain('select', a); }
  eq(...a: unknown[]): this { this.eqs.push([a[0] as string, a[1]]); return this.chain('eq', a); }
  in(...a: unknown[]): this { return this.chain('in', a); }
  is(...a: unknown[]): this { return this.chain('is', a); }
  like(...a: unknown[]): this { return this.chain('like', a); }
  gte(...a: unknown[]): this { return this.chain('gte', a); }
  lte(...a: unknown[]): this { return this.chain('lte', a); }
  not(...a: unknown[]): this { return this.chain('not', a); }
  or(...a: unknown[]): this { return this.chain('or', a); }
  textSearch(...a: unknown[]): this { return this.chain('textSearch', a); }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ column, ascending: opts?.ascending !== false });
    return this.chain('order', [column, opts ?? {}]);
  }

  range(from: number, to: number): this {
    this.rangeArgs = [from, to];
    return this.chain('range', [from, to]);
  }

  maybeSingle(): Promise<CatalogResult> {
    return this.settle();
  }

  then<TResult1 = CatalogResult, TResult2 = never>(
    onfulfilled?: ((value: CatalogResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.settle().then(onfulfilled, onrejected);
  }

  private settle(): Promise<CatalogResult> {
    this.log.push({ table: this.table, methods: [...this.methods], args: [...this.args] });

    const filtered = this.rows.filter((row) => this.eqs.every(([col, val]) => row[col] === val));
    const ordenado = this.applyOrder(filtered, this.nextExecution());
    const total = ordenado.length;

    const [from, to] = this.rangeArgs ?? [0, total - 1];
    return Promise.resolve({ data: ordenado.slice(from, to + 1), error: null, count: total });
  }

  private applyOrder(rows: Row[], execution: number): Row[] {
    const physical = new Map<Row, number>();
    rows.forEach((row, i) => physical.set(row, i));

    return [...rows].sort((a, b) => {
      for (const o of this.orders) {
        const cmp = compareValues(a[o.column], b[o.column]);
        if (cmp !== 0) return o.ascending ? cmp : -cmp;
      }
      // Empate em TODAS as chaves pedidas: sem `id` na consulta a ordem entre
      // os empatados não é garantida e pode variar entre execuções (aqui,
      // insertion-order numa e invertida na outra). Com `id` a ordenação
      // acima já desempatou e este ramo nunca é alcançado.
      const pa = physical.get(a) ?? 0;
      const pb = physical.get(b) ?? 0;
      return execution % 2 === 0 ? pa - pb : pb - pa;
    });
  }
}

/** Client externo falso que compartilha a "tabela" e o contador de execuções. */
class FakeProductsClient {
  readonly calls: RecordedCall[] = [];
  private executions = 0;
  private readonly tables: Record<string, Row[]>;

  constructor(tables: Record<string, Row[]>) {
    this.tables = tables;
  }

  from(table: string): FakeProductsBuilder {
    const rows = this.tables[table] ?? (this.tables[table] = []);
    return new FakeProductsBuilder(table, rows, this.calls, () => this.executions++);
  }
}

function localClient(userId: string): LocalClient {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    rpc: async () => ({ data: true, error: null }),
  } as unknown as LocalClient;
}

function deps(ext: FakeProductsClient, userId: string): CatalogHandlerDeps {
  return { localClient: localClient(userId), extClient: ext as unknown as ExtClient };
}

function catalogRequest(body: unknown): Request {
  return new Request('https://edge.invalid/promogifts-catalog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    body: JSON.stringify(body),
  });
}

async function listProducts(
  d: CatalogHandlerDeps,
  params: Record<string, unknown>,
): Promise<{ status: number; ids: string[] }> {
  const response = await promogiftsCatalogHandler(
    catalogRequest({ action: 'list_products', params }),
    d,
  );
  const body = await response.json() as { data?: Array<{ id: string }> };
  return { status: response.status, ids: (body.data ?? []).map((row) => row.id) };
}

function orderColumns(call: RecordedCall): string[] {
  return call.methods
    .map((method, i) => (method === 'order' ? (call.args[i][0] as string) : null))
    .filter((column): column is string => column !== null);
}

// 4 produtos com o MESMO nome => empatam na ordenação primária (`name`).
// O corte de 2 em 2 coloca a fronteira no meio do grupo empatado.
const PRODUTOS_EMPATADOS: Row[] = [
  { id: 'p-01', name: 'Caneca Personalizada', is_active: true },
  { id: 'p-02', name: 'Caneca Personalizada', is_active: true },
  { id: 'p-03', name: 'Caneca Personalizada', is_active: true },
  { id: 'p-04', name: 'Caneca Personalizada', is_active: true },
];

Deno.test('OTH-004: nomes empatados na fronteira da página não omitem nem duplicam produtos', async () => {
  const ext = new FakeProductsClient({ products: [...PRODUTOS_EMPATADOS] });
  const d = deps(ext, 'oth-004-user');

  const pagina1 = await listProducts(d, { order_by: 'name', ascending: true, limit: 2, offset: 0 });
  const pagina2 = await listProducts(d, { order_by: 'name', ascending: true, limit: 2, offset: 2 });

  assertEquals(pagina1.status, 200);
  assertEquals(pagina2.status, 200);

  const ids = [...pagina1.ids, ...pagina2.ids];
  const unicos = [...new Set(ids)].sort();

  assertEquals(ids.length, PRODUTOS_EMPATADOS.length, 'as duas páginas juntas precisam trazer os 4 produtos');
  assertEquals(unicos.length, PRODUTOS_EMPATADOS.length, 'um id duplicado entre páginas indica fronteira instável');
  assertEquals(
    unicos.join(','),
    'p-01,p-02,p-03,p-04',
    'sem desempate determinístico a fronteira de página omite ids e repete outros',
  );

  // Prova estrutural: a ordenação pedida continua primária e `id` entra como
  // desempate único e ascendente no fim da cadeia.
  const productsCall = ext.calls.find((call) => call.table === 'products');
  assert(productsCall, 'a ação precisa consultar a tabela products');
  const cols = orderColumns(productsCall);
  assertEquals(cols[0], 'name', 'a ordenação solicitada deve continuar primária');
  assertEquals(cols[cols.length - 1], 'id', 'id precisa ser o desempate final');
});

Deno.test('OTH-004: cláusulas — chave pedida primária (mantém ascending) e id ASC como desempate único', () => {
  assertEquals(
    JSON.stringify(buildProductOrderClauses('name', true)),
    JSON.stringify([
      { column: 'name', ascending: true },
      { column: 'id', ascending: true },
    ]),
    'nome ascendente + id ascendente',
  );
  assertEquals(
    JSON.stringify(buildProductOrderClauses('sale_price', false)),
    JSON.stringify([
      { column: 'sale_price', ascending: false },
      { column: 'id', ascending: true },
    ]),
    'a direção da chave primária precisa ser preservada; o desempate é sempre id ASC',
  );
});

Deno.test('OTH-004: quando o primário já é id, a ordenação por id não é duplicada', () => {
  assertEquals(
    JSON.stringify(buildProductOrderClauses('id', true)),
    JSON.stringify([{ column: 'id', ascending: true }]),
  );
  assertEquals(
    JSON.stringify(buildProductOrderClauses('id', false)),
    JSON.stringify([{ column: 'id', ascending: false }]),
  );
});
