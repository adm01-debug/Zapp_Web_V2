/**
 * queryRetry.ts — retry semantico para o React Query do Zapp Web V2.
 *
 * `retry: 2` (numerico) repetia QUALQUER erro duas vezes. Erro permanente
 * — permissao negada, tabela/coluna inexistente, JWT vencido, validacao —
 * e identico na proxima tentativa: o usuario espera ~6s e o banco recebe
 * requisicoes que nunca vao passar. Esta funcao na hora para esses casos e
 * mantem as 2 tentativas apenas para os transitorios (rede/5xx/timeout).
 *
 * Funcao PURA (sem side effects), exportada para uso em:
 *  - src/lib/queryClient.ts (defaultOptions.queries.retry)
 *  - qualquer useQuery que precise do mesmo criterio
 *
 * O que NAO repete:
 *  - status HTTP 401 / 403 / 404
 *  - codigos Postgres 42501 (permission denied), 42P01 (relacao ausente),
 *    42703 (coluna ausente — schema drift)
 *  - PGRST116 (0 linhas em .single()), PGRST301 (JWT expirado/invalido)
 *  - erros de validacao (ZodError / ValidationError)
 *  - fallback textual: permission denied, must be owner, insufficient
 *    privilege, does not exist, jwt expired, jwt invalid
 */

/** Erros que nunca terao sucesso na proxima tentativa. */
export function isPermanentQueryError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;

  // ── Nivel HTTP ──────────────────────────────────────────────────────────
  if (e['status'] === 401 || e['status'] === 403 || e['status'] === 404) return true;

  // ── Nivel Supabase / GoTrue ─────────────────────────────────────────────
  if (e['code'] === 'PGRST116') return true; // 0 linhas em .single()
  if (e['code'] === 'PGRST301') return true; // JWT expirado / invalido

  // ── Nivel PostgreSQL ────────────────────────────────────────────────────
  if (e['code'] === '42501') return true; // permission denied
  if (e['code'] === '42P01') return true; // relacao nao existe
  if (e['code'] === '42703') return true; // coluna nao existe

  // ── Validacao ───────────────────────────────────────────────────────────
  const name = (e['name'] as string | undefined) ?? '';
  if (name === 'ZodError' || name === 'ValidationError') return true;

  // ── Fallback textual ────────────────────────────────────────────────────
  const msg = ((e['message'] as string) ?? '').toLowerCase();
  if (msg.includes('permission denied')) return true;
  if (msg.includes('must be owner')) return true;
  if (msg.includes('insufficient privilege')) return true;
  if (msg.includes('does not exist')) return true; // relacao ou funcao ausente
  if (msg.includes('jwt expired')) return true;
  if (msg.includes('jwt invalid')) return true;

  return false;
}

/**
 * Criterio de retry para o TanStack Query.
 * Substitui `retry: 2`: nunca repete erro permanente; para os demais
 * (rede/5xx/timeout e nao classificados, como antes) tenta ate 2 vezes.
 *
 * Uso:
 *   useQuery({ ..., retry: shouldRetryQuery })
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isPermanentQueryError(error)) return false;
  return failureCount < 2;
}
