import { buildTagOrExpr } from './index.ts';

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

Deno.test('buildTagOrExpr: sanitiza cada valor (remove % _ . \\ ( )) antes de montar a cláusula', () => {
  const expr = buildTagOrExpr('colors', ['az%ul_teste.x\\y(z)']);
  assertEquals(expr, 'colors.cs.["azultestexyz"],colors.cs.[{"nome":"azultestexyz"}]');
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
