/**
 * Safe localStorage wrapper that handles exceptions (quota exceeded, private mode, etc.)
 */
import { getLogger } from '@/lib/logger';

const log = getLogger('SafeStorage');

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
    log.warn(`Failed to write key "${key}"`);
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
    log.warn(`Failed to write key "${key}"`);
    return false;
  }
}
