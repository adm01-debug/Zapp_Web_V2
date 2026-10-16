/**
 * Detecção de aborto intencional (AbortController.abort(), page unload /
 * navegação). Módulo PURO: sem I/O, sem logger e sem dependências — pode ser
 * importado por qualquer queryFn/catch sem puxar `@/lib/logger` junto.
 *
 * `isIntentionalAbort` casa por `err.name` — NUNCA por
 * `message.includes(...)`: a mensagem real por trás de um AbortError durante o
 * unload da página é "Page unload", e casar por texto é frágil entre ambientes.
 */
export function isIntentionalAbort(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') return true;
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * Amplitude ampliada do check de abort: cobre DOMException crua, Error com
 * name='AbortError', o padrão do postgrest-js que embrulha o abort em `message`
 * (ex: `{message: 'AbortError: ...'}`) e strings específicas do semáforo interno
 * ('signal is aborted', 'slot acquire aborted', 'page unload').
 * Usar este em todo código que consome APIs Supabase/PostgREST.
 */
export function isAbortLikeError(err: unknown): boolean {
  if (isIntentionalAbort(err)) return true;
  if (err && typeof err === 'object') {
    const name = (err as { name?: string }).name;
    if (name === 'AbortError') return true;
    const msg = (err as { message?: string }).message ?? '';
    if (/^AbortError/i.test(msg) || /\bAbortError\b/i.test(msg)) return true;
    // Strings específicas do semáforo e do unload de página
    const msgLower = msg.toLowerCase();
    if (
      msgLower.includes('signal is aborted') ||
      msgLower.includes('slot acquire aborted') ||
      msgLower.includes('page unload')
    ) return true;
  }
  return false;
}
