import { buildTagOrExpr, promogiftsCatalogHandler, type CatalogHandlerDeps } from './index.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg ?? 'assertEquals failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// buildTagOrExpr monta um OR-expr do PostgREST para colunas jsonb (colors/materials)
// que guardam string ou {nome}. Cada valor sanitizado vira 2 cláusulas (string pura
// e {nome}), unidas por vírgula. Cobre o caso que ficou sem teste (E36-2): 3+ valores
// e o uso combinado de colors + materials no mesmo request (list_products).

Deno.test('buildTagOrExpr: 3 cores gera 6 cláusulas (2 por valor), na ordem dos valores', () => {
  const expr = buildTagOrExpr('colors', ['azul', 'verde', 'vermelho']);
  const expected = [
    'colors.cs.["azul"]',
    'colors.cs.[{"nome":"azul"}]',
    'colors.cs.["verde"]',
    'colors.cs.[{"nome":"verde"}]',
    'colors.cs.["vermelho"]',
    'colors.cs.[{"nome":"vermelho"}]',
  ].join(',');
  assertEquals(expr, expected);
});

Deno.test('buildTagOrExpr: 4+ cores continua OR-ando todos os valores, sem limite artificial', () => {
  const values = ['azul', 'verde', 'vermelho', 'preto', 'branco'];
  const expr = buildTagOrExpr('colors', values);
  for (const v of values) {
    assertEquals(expr?.includes(`colors.cs.["${v}"]`), true, `esperava cláusula string para "${v}"`);
    assertEquals(expr?.includes(`colors.cs.[{"nome":"${v}"}]`), true, `esperava cláusula {nome} para "${v}"`);
  }
  assertEquals(expr?.split(',').length, values.length * 2);
});

Deno.test('buildTagOrExpr: color + material são independentes — cada chamada usa sua própria coluna', () => {
  const colorExpr = buildTagOrExpr('colors', ['azul', 'verde', 'preto']);
  const materialExpr = buildTagOrExpr('materials', ['metal', 'plastico']);

  // 3 cores => 6 cláusulas, todas na coluna colors
  assertEquals(colorExpr?.split(',').length, 6);
  assertEquals(colorExpr?.includes('materials.cs'), false);

  // 2 materiais => 4 cláusulas, todas na coluna materials
  assertEquals(materialExpr?.split(',').length, 4);
  assertEquals(materialExpr?.includes('colors.cs'), false);

  // reproduz o uso real em list_products: os dois filtros coexistem sem colidir
  const combined = [colorExpr, materialExpr].filter(Boolean).join(',');
  assertEquals(combined.split(',').length, 10);
});

Deno.test('buildTagOrExpr: sanitiza cada valor (remove % _ . \\ ( ) , ") antes de montar a cláusula', () => {
  const expr = buildTagOrExpr('colors', ['az%ul_teste.x\\y(z),w"']);
  assertEquals(expr, 'colors.cs.["azultestexyzw"],colors.cs.[{"nome":"azultestexyzw"}]');
});

Deno.test('buildTagOrExpr: aspa dupla literal no valor não quebra o JSON embutido na cláusula', () => {
  // Aspa não sanitizada + JSON.stringify (que escapa aspas) ainda produziria
  // JSON válido por acidente de ordem — este teste trava esse comportamento
  // mesmo com a aspa agora removida na sanitização.
  const expr = buildTagOrExpr('colors', ['az"ul']);
  assertEquals(expr, 'colors.cs.["azul"],colors.cs.[{"nome":"azul"}]');
});

Deno.test('buildTagOrExpr: vírgula literal no valor não quebra o OR-expr do PostgREST', () => {
  // Vírgula é o separador de cláusulas do .or() — sem sanitizar, "azul,vermelho"
  // geraria uma cláusula colors.cs.["azul,vermelho"] que quebra o parsing.
  const expr = buildTagOrExpr('colors', ['azul,vermelho']);
  assertEquals(expr, 'colors.cs.["azulvermelho"],colors.cs.[{"nome":"azulvermelho"}]');
  assertEquals(expr?.split(',').length, 2);
});

Deno.test('buildTagOrExpr: valores vazios/só-sujeira após sanitize são descartados', () => {
  // '%_.()' sanitiza para string vazia e é removido; sobra só 'azul'.
  const expr = buildTagOrExpr('colors', ['%_.()', 'azul']);
  assertEquals(expr, 'colors.cs.["azul"],colors.cs.[{"nome":"azul"}]');
});

Deno.test('buildTagOrExpr: array vazio retorna null (sem cláusulas)', () => {
  assertEquals(buildTagOrExpr('colors', []), null);
});

Deno.test('buildTagOrExpr: só valores que sanitizam para vazio retorna null', () => {
  assertEquals(buildTagOrExpr('materials', ['%%%', '...', '()']), null);
});

// ─── Janela de 30 dias do filtro "novos" (list_products + is_new) ─────────
//
// O contrato público continua `is_new: true` (o front manda só isso), mas na
// edge o predicado passa a exigir created_at >= agora-30d, com fronteira
// INCLUSIVA e o corte calculado uma vez por requisição em UTC/ISO. Sem essa
// segunda condição, produto marcado como novo há mais de 30 dias continuava
// na listagem e na exportação do filtro new_30d.
//
// Os testes chamam o handler real (promogiftsCatalogHandler) com os clients
// injetados pelo seam CT-77 e o relógio fixo via deps.now — nada de banco.

type QueryCall = { m: string; args: unknown[] };
type QueryTerminal = { data?: unknown; error?: unknown; count?: number | null };

/** Builder PostgREST falso: registra cada método de filtro e resolve no terminal. */
function fakeQuery(terminal: QueryTerminal, calls: QueryCall[]) {
  const b: Record<string, unknown> = {};
  const passthrough = [
    'select', 'eq', 'neq', 'in', 'is', 'gt', 'gte', 'lt', 'lte', 'not',
    'or', 'like', 'ilike', 'textSearch', 'order', 'range', 'limit',
  ];
  for (const m of passthrough) {
    b[m] = (...args: unknown[]) => {
      calls.push({ m, args });
      return b;
    };
  }
  b.maybeSingle = () => Promise.resolve({ data: null, error: null });
  b.then = (
    resolve: (v: QueryTerminal) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(terminal).then(resolve, reject);
  return b;
}

/** Client externo falso: cada `from()` consome o próximo terminal da fila. */
function fakeExtClient(terminals: QueryTerminal[], calls: QueryCall[]) {
  let i = 0;
  return {
    from(_table: string) {
      const terminal = terminals[Math.min(i, terminals.length - 1)];
      i += 1;
      return fakeQuery(terminal, calls);
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
}

/** Client local falso: JWT válido e cota de rate limit sempre disponível. */
const fakeLocalClient = {
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: 'user-teste' } }, error: null }),
  },
  rpc: () => Promise.resolve({ data: true, error: null }),
};

function postCatalog(body: unknown): Request {
  return new Request('https://example.supabase.co/functions/v1/promogifts-catalog', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer tok' },
    body: JSON.stringify(body),
  });
}

// Relógio fixo: o corte de 30 dias a partir de 2026-10-06T15:04:05Z é
// exatamente 2026-09-06T15:04:05.000Z (literal — não recomputado aqui, para
// o teste provar o VALOR e não a fórmula).
const FIXED_NOW = new Date('2026-10-06T15:04:05.000Z');
const EXPECTED_CUTOFF = '2026-09-06T15:04:05.000Z';

function catalogDeps(terminals: QueryTerminal[], calls: QueryCall[]): CatalogHandlerDeps {
  return {
    localClient: fakeLocalClient,
    extClient: fakeExtClient(terminals, calls),
    now: () => FIXED_NOW,
  } as unknown as CatalogHandlerDeps;
}

Deno.test('list_products com is_new=true exige is_new=true E created_at >= agora-30d (inclusivo)', async () => {
  const calls: QueryCall[] = [];
  const res = await promogiftsCatalogHandler(
    postCatalog({ action: 'list_products', params: { is_new: true } }),
    catalogDeps([{ data: [], error: null, count: 0 }], calls),
  );

  assertEquals(res.status, 200);
  assertEquals(
    calls.some((c) => c.m === 'eq' && c.args[0] === 'is_new' && c.args[1] === true),
    true,
    'esperava o predicado eq("is_new", true)',
  );
  assertEquals(
    calls.some((c) => c.m === 'gte' && c.args[0] === 'created_at' && c.args[1] === EXPECTED_CUTOFF),
    true,
    `esperava o predicado gte("created_at", "${EXPECTED_CUTOFF}")`,
  );
});

Deno.test('list_products: a contagem de fallback (PGRST103) usa o MESMO corte, calculado uma vez por requisição', async () => {
  const calls: QueryCall[] = [];
  const res = await promogiftsCatalogHandler(
    postCatalog({ action: 'list_products', params: { is_new: true, offset: 500 } }),
    catalogDeps([
      { data: null, error: { code: 'PGRST103', message: 'range not satisfiable' }, count: null },
      { data: null, error: null, count: 7 },
    ], calls),
  );

  assertEquals(res.status, 200);
  // A consulta paginada e a contagem de fallback têm de usar o mesmo instante
  // de corte — se o corte fosse recalculado por consulta, os valores podiam
  // divergir e a fronteira deixava de ser determinística.
  const cortes = calls
    .filter((c) => c.m === 'gte' && c.args[0] === 'created_at')
    .map((c) => c.args[1]);
  assertEquals(JSON.stringify(cortes), JSON.stringify([EXPECTED_CUTOFF, EXPECTED_CUTOFF]));
});

Deno.test('list_products sem is_new não aplica corte de created_at nem filtra is_new', async () => {
  const calls: QueryCall[] = [];
  const res = await promogiftsCatalogHandler(
    postCatalog({ action: 'list_products', params: {} }),
    catalogDeps([{ data: [], error: null, count: 0 }], calls),
  );

  assertEquals(res.status, 200);
  assertEquals(calls.some((c) => c.m === 'gte' && c.args[0] === 'created_at'), false);
  assertEquals(calls.some((c) => c.m === 'eq' && c.args[0] === 'is_new'), false);
});
