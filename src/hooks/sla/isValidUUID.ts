/**
 * Guarda de UUID para ids vindos de dados legados/URL antes de irem ao
 * PostgREST: um `contact_id`/`queue_id`/`agent_id` malformado em `.in()` faz a
 * API responder 400 (22P02) e a lista/nome do escopo fica em branco sem aviso.
 *
 * Mesmo padrão de `isValidUUID` em `@/hooks/communication/useCalls` e `ehUuid`
 * em `@/hooks/chat/useWhisperMessagesMutation`; o projeto não tem (ainda) um
 * utilitário de uuid compartilhado, então a guarda fica com o domínio de SLA.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Só ids válidos, sem repetição e em ordem estável — chave de cache não fragmenta a cada render. */
export function normalizeScopeIds(ids: readonly string[] | null | undefined): string[] {
  const valid = (ids ?? []).filter((id): id is string => isValidUUID(id));
  return Array.from(new Set(valid)).sort();
}
