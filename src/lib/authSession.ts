/**
 * Leitura da sessão que o `supabase-js` já persiste no `localStorage`
 * (`sb-<ref>-auth-token`), para quem precisa da identidade do usuário sem
 * depender do `AuthProvider` (módulos puros, sem React/rede, ou que montam
 * fora do provider).
 *
 * Extraído de `@/lib/mediaVolumeStore.ts` (primeiro consumidor) para ser
 * reaproveitado por `@/services/outbound-message.service.ts` (fila offline
 * por usuário — a mesma sessão, a mesma varredura) em vez de duplicar o
 * parsing. Mesma varredura usada em `e2e/fixtures/e2e-contact.ts`: não
 * presume o ref do projeto.
 */

const SUPABASE_SESSION_KEY_PREFIX = 'sb-';
const SUPABASE_SESSION_KEY_SUFFIX = '-auth-token';

export function isSupabaseSessionKey(key: string | null): boolean {
  return Boolean(
    key && key.startsWith(SUPABASE_SESSION_KEY_PREFIX) && key.endsWith(SUPABASE_SESSION_KEY_SUFFIX)
  );
}

/**
 * Id do usuário autenticado da sessão persistida pelo `supabase-js`. Tolerante
 * (E02): storage bloqueado, JSON estranho ou sessão sem `user.id` → `null` =
 * "sem usuário".
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
      if (typeof parsed?.access_token === 'string' && typeof userId === 'string' && userId)
        return userId;
    }
    return null;
  } catch {
    return null;
  }
}
