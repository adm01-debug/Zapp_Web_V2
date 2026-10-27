/**
 * Id do usuário autenticado lido da sessão que o `supabase-js` persiste no
 * `localStorage` (`sb-<ref>-auth-token`). Leitura síncrona e sem rede: serve a
 * quem precisa saber "de quem é esta máquina agora" fora do React (fila de envio
 * offline, volume de mídia por usuário).
 */

/** Sessão do `supabase-js` no `localStorage`: `sb-<ref>-auth-token`. */
const SUPABASE_SESSION_KEY_PREFIX = 'sb-';
const SUPABASE_SESSION_KEY_SUFFIX = '-auth-token';

export function isSupabaseSessionKey(key: string | null): boolean {
  return Boolean(key && key.startsWith(SUPABASE_SESSION_KEY_PREFIX) && key.endsWith(SUPABASE_SESSION_KEY_SUFFIX));
}

/**
 * A varredura não presume o ref do projeto (o mesmo padrão já usado nos fixtures do
 * e2e). Tolerante (E02): storage bloqueado, JSON estranho ou sessão sem `user.id`
 * → `null` = "sem usuário".
 */
export function readAuthenticatedUserId(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const storage = window.localStorage;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!isSupabaseSessionKey(key)) continue;
      const raw = storage.getItem(key as string);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { access_token?: unknown; user?: { id?: unknown } } | null;
      const userId = parsed?.user?.id;
      if (typeof parsed?.access_token === 'string' && typeof userId === 'string' && userId) return userId;
    }
    return null;
  } catch {
    return null;
  }
}
