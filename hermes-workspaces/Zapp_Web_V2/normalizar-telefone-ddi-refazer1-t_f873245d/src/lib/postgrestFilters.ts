/**
 * Escapa um valor de usuário para uso dentro de uma cláusula `.or()`/`.ilike()`
 * do PostgREST (supabase-js). A sintaxe `.or()` usa vírgula como separador de
 * condições e parênteses para agrupamento, sem nenhum escape automático —
 * `.or()` manda a string exatamente como foi montada, crua, pro servidor
 * (`postgrest-js` só faz `searchParams.append('or', '(' + filters + ')')`).
 * Um termo de busca com vírgula, parênteses ou aspas quebra a gramática do
 * filtro e pode injetar uma condição arbitrária no `OR` (ex: `,is_admin.eq.true`).
 *
 * Valor entre aspas duplas é tratado como literal pelo PostgREST; dentro das
 * aspas, `\` e `"` precisam ser escapados com `\`. A ordem importa: escapar
 * `\` primeiro evita re-escapar as barras que a escapada de `"` insere.
 *
 * Achado da auditoria de 5 agentes (2026-09-26): o mesmo padrão de
 * interpolação crua existia em ~8 lugares (buscas de contato em vários
 * fluxos + a edge function voice-copilot-action); esta função substitui as
 * reimplementações ad-hoc por uma única fonte de verdade testada.
 */
export function escapeOrFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
