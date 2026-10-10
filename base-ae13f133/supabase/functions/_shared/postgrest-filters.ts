/**
 * Escapa um valor de usuário para uso dentro de uma cláusula `.or()`/`.ilike()`
 * do PostgREST (supabase-js). Espelha src/lib/postgrestFilters.ts (frontend) —
 * mesmo runtime issue, dois module resolvers (Deno vs. Vite), por isso duas
 * cópias em vez de uma importação cruzada.
 *
 * `.or()` usa vírgula como separador de condições e parênteses para
 * agrupamento, sem nenhum escape automático — a string é mandada crua pro
 * servidor. Um termo com vírgula, parênteses ou aspas quebra a gramática do
 * filtro. Valor entre aspas duplas é literal; `\` e `"` dentro dele precisam
 * ser escapados com `\` (escapar `\` primeiro evita re-escapar as barras que
 * a escapada de `"` insere).
 */
export function escapeOrFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
