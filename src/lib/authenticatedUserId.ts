/**
 * Id do usuário autenticado lido da sessão que o `supabase-js` persiste no
 * `localStorage` (`sb-<ref>-auth-token`). Leitura síncrona e sem rede: serve a
 * quem precisa saber "de quem é esta máquina agora" fora do React (fila de envio
 * offline, volume de mídia por usuário).
 */

/** Sessão do `supabase-js` no `localStorage`: `sb-<ref>-auth-token`. */
const SUPABASE_SESSION_KEY_PREFIX = 'sb-';
const SUPABASE_SESSION_KEY_SUFFIX = '-auth-token';

import { SUPABASE_URL } from '@/config/supabase';

export function isSupabaseSessionKey(key: string | null): boolean {
  return Boolean(key && key.startsWith(SUPABASE_SESSION_KEY_PREFIX) && key.endsWith(SUPABASE_SESSION_KEY_SUFFIX));
}

/**
 * Só vale a chave do projeto configurado (ref da URL do Supabase); sessão de outro
 * projeto no mesmo origin não identifica o usuário. Tolerante (E02): storage bloqueado, JSON estranho ou sessão sem `user.id`
 * → `null` = "sem usuário".
 */
/** Chave de sessão do projeto configurado (`sb-<ref>-auth-token`), ou null sem URL válida. */
function configuredSessionKey(): string | null {
  try {
    const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
    return ref ? `${SUPABASE_SESSION_KEY_PREFIX}${ref}${SUPABASE_SESSION_KEY_SUFFIX}` : null;
  } catch {
    return null;
  }
}

export function readAuthenticatedUserId(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const storage = window.localStorage;
    const preferred = configuredSessionKey();
    const keys: Array<string | null> = [];
    if (preferred) keys.push(preferred);
    else for (let index = 0; index < storage.length; index += 1) keys.push(storage.key(index));
    for (const key of keys) {
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
