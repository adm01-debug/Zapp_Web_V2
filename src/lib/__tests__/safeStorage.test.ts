import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  safeGetJSON,
  safeSetJSON,
} from '@/lib/safeStorage';

/**
 * `safeStorage` envolve o localStorage global em try/catch. Os caminhos de
 * EXCEÇÃO (modo privado, cota estourada) não se provam com `vi.spyOn` no
 * `localStorage` do jsdom: o Storage dele é um Proxy e a troca do método não
 * chega ao módulo. Por isso os testes de falha SUBSTITUEM o global
 * `localStorage` inteiro (`vi.stubGlobal`) por um que lança — é a mesma
 * referência que o módulo de produção resolve em tempo de chamada.
 */

function throwingStorage(method: 'getItem' | 'setItem' | 'removeItem' | 'clear') {
  const boom = () => {
    throw new Error(`storage ${method} indisponível`);
  };
  return {
    getItem: method === 'getItem' ? boom : () => null,
    setItem: method === 'setItem' ? boom : () => {},
    removeItem: method === 'removeItem' ? boom : () => {},
    clear: method === 'clear' ? boom : () => {},
    key: () => null,
    length: 0,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── safeGetItem ───────────────────────────────────────────────────────────────

describe('safeGetItem', () => {
  it('returns null when key does not exist', () => {
    expect(safeGetItem('missing')).toBeNull();
  });

  it('returns the stored string value', () => {
    localStorage.setItem('k', 'hello');
    expect(safeGetItem('k')).toBe('hello');
  });

  it('returns null when localStorage.getItem throws', () => {
    vi.stubGlobal('localStorage', throwingStorage('getItem'));
    expect(safeGetItem('k')).toBeNull();
  });

  it('does not throw when localStorage.getItem throws', () => {
    vi.stubGlobal('localStorage', throwingStorage('getItem'));
    expect(() => safeGetItem('k')).not.toThrow();
  });
});

// ── safeSetItem ───────────────────────────────────────────────────────────────

describe('safeSetItem', () => {
  it('stores a value and returns true', () => {
    const result = safeSetItem('k', 'v');
    expect(result).toBe(true);
    expect(localStorage.getItem('k')).toBe('v');
  });

  it('overwrites an existing value', () => {
    localStorage.setItem('k', 'old');
    safeSetItem('k', 'new');
    expect(localStorage.getItem('k')).toBe('new');
  });

  it('returns false when localStorage.setItem throws', () => {
    vi.stubGlobal('localStorage', throwingStorage('setItem'));
    expect(safeSetItem('k', 'v')).toBe(false);
  });

  it('does not throw when localStorage.setItem throws', () => {
    vi.stubGlobal('localStorage', throwingStorage('setItem'));
    expect(() => safeSetItem('k', 'v')).not.toThrow();
  });
});

// ── safeRemoveItem ────────────────────────────────────────────────────────────

describe('safeRemoveItem', () => {
  it('removes an existing key and returns true', () => {
    localStorage.setItem('k', 'v');
    expect(safeRemoveItem('k')).toBe(true);
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('returns true even when key does not exist', () => {
    expect(safeRemoveItem('nonexistent')).toBe(true);
  });

  it('returns false when localStorage.removeItem throws', () => {
    vi.stubGlobal('localStorage', throwingStorage('removeItem'));
    expect(safeRemoveItem('k')).toBe(false);
  });

  it('does not throw when localStorage.removeItem throws', () => {
    vi.stubGlobal('localStorage', throwingStorage('removeItem'));
    expect(() => safeRemoveItem('k')).not.toThrow();
  });
});

// ── safeGetJSON ───────────────────────────────────────────────────────────────

describe('safeGetJSON', () => {
  it('returns fallback when key does not exist', () => {
    expect(safeGetJSON('missing', 42)).toBe(42);
  });

  it('parses a stored JSON object', () => {
    localStorage.setItem('obj', JSON.stringify({ a: 1 }));
    expect(safeGetJSON('obj', null)).toEqual({ a: 1 });
  });

  it('parses a stored JSON array', () => {
    localStorage.setItem('arr', JSON.stringify([1, 2, 3]));
    expect(safeGetJSON('arr', [])).toEqual([1, 2, 3]);
  });

  it('returns fallback when value is not valid JSON', () => {
    localStorage.setItem('bad', '{invalid json}');
    expect(safeGetJSON('bad', 'default')).toBe('default');
  });

  it('returns fallback when localStorage.getItem throws', () => {
    vi.stubGlobal('localStorage', throwingStorage('getItem'));
    expect(safeGetJSON('k', 'fb')).toBe('fb');
  });

  it('returns fallback for an absent key (null from storage)', () => {
    expect(safeGetJSON('absent-key', { x: 0 })).toEqual({ x: 0 });
  });
});

// ── safeSetJSON ───────────────────────────────────────────────────────────────

describe('safeSetJSON', () => {
  it('stores a JSON-serialised object and returns true', () => {
    const result = safeSetJSON('k', { foo: 'bar' });
    expect(result).toBe(true);
    expect(JSON.parse(localStorage.getItem('k')!)).toEqual({ foo: 'bar' });
  });

  it('stores a JSON array', () => {
    safeSetJSON('arr', [1, 2, 3]);
    expect(JSON.parse(localStorage.getItem('arr')!)).toEqual([1, 2, 3]);
  });

  it('stores a primitive number', () => {
    safeSetJSON('n', 99);
    expect(JSON.parse(localStorage.getItem('n')!)).toBe(99);
  });

  it('stores a boolean', () => {
    safeSetJSON('b', true);
    expect(JSON.parse(localStorage.getItem('b')!)).toBe(true);
  });

  it('returns false when localStorage.setItem throws', () => {
    vi.stubGlobal('localStorage', throwingStorage('setItem'));
    expect(safeSetJSON('k', {})).toBe(false);
  });

  it('does not throw when localStorage.setItem throws', () => {
    vi.stubGlobal('localStorage', throwingStorage('setItem'));
    expect(() => safeSetJSON('k', {})).not.toThrow();
  });
});

// ── round-trip ────────────────────────────────────────────────────────────────

describe('safeSetJSON / safeGetJSON round-trip', () => {
  it('object survives a round-trip', () => {
    const original = { name: 'Alice', age: 30, active: true };
    safeSetJSON('rt', original);
    expect(safeGetJSON('rt', null)).toEqual(original);
  });

  it('nested object survives a round-trip', () => {
    const original = { a: { b: { c: [1, 2, 3] } } };
    safeSetJSON('nested', original);
    expect(safeGetJSON('nested', null)).toEqual(original);
  });
});
