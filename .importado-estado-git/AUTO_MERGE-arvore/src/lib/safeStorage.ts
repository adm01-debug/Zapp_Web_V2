/**
 * Safe localStorage wrapper that handles exceptions (quota exceeded, private mode, etc.)
 */
import { getLogger } from '@/lib/logger';

// Lazy: o logger só é resolvido quando há algo para registrar. Assim importar
// este módulo (o `client.ts` importa, no boot) não depende de `@/lib/logger`
// estar completo — mocks parciais de logger em testes não quebram o boot.
let logSafeStorage: ReturnType<typeof getLogger> | null = null;
function logger() {
  logSafeStorage ??= getLogger('SafeStorage');
  return logSafeStorage;
}

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    logger().warn(`Failed to write key "${key}"`);
    return false;
  }
}

export function safeRemoveItem(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Parse JSON from localStorage safely */
export function safeGetJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Stringify and store JSON safely */
export function safeSetJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    logger().warn(`Failed to write key "${key}"`);
    return false;
  }
}

/**
 * Adapter de storage para o cliente Supabase.
 *
 * O `client.ts` passava `window.localStorage` direto: em modo privado / com
 * cookies bloqueados o PRÓPRIO acesso à propriedade pode lançar SecurityError
 * e derrubar a página já no import do módulo. Aqui a leitura é protegida e,
 * quando o storage persistente não está utilizável, o adapter mantém a sessão
 * em um Map na aba (some ao fechar, mas o app continua utilizável).
 */
export interface StorageSeguro {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export function createSafeStorage(): StorageSeguro {
  const memoria = new Map<string, string>();

  const localUtilizavel = (() => {
    try {
      return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
    } catch {
      return false;
    }
  })();

  if (!localUtilizavel) {
    logger().warn('localStorage indisponível; sessão mantida em memória nesta aba');
    return {
      getItem: (key) => memoria.get(key) ?? null,
      setItem: (key, value) => { memoria.set(key, value); },
      removeItem: (key) => { memoria.delete(key); },
    };
  }

  return {
    getItem: (key) => {
      const persistido = safeGetItem(key);
      return persistido !== null ? persistido : (memoria.get(key) ?? null);
    },
    setItem: (key, value) => {
      // Storage cheio/bloqueado: mantém o token vivo em memória em vez de
      // perder a sessão.
      if (!safeSetItem(key, value)) memoria.set(key, value);
    },
    removeItem: (key) => {
      safeRemoveItem(key);
      memoria.delete(key);
    },
  };
}
