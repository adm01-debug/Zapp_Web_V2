/**
 * Busca global: os termos vão ao `ilike` como TEXTO literal. Sem escapar `%` e `_`,
 * digitar um único `_` casaria qualquer mensagem/contato. Este teste captura as
 * chamadas reais de `ilike`/`or` no cliente Supabase e prova o escape e o uso de
 * `escapeOrFilterValue` (valor entre aspas) na busca de contato.
 *
 * Vermelho antes: `ilike('content', '%a_b%')` (sem escape) e o `.or()` com o termo
 * cru. Verde depois: `%a\_b%` e `name.ilike."%a\_b%"`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const h = vi.hoisted(() => {
  const calls = { ilike: [] as [string, string][], or: [] as string[] };

  /** Cadeia PostgREST thenable que registra `ilike`/`or` e resolve `{ data: [], error: null }`. */
  function makeChain(): unknown {
    const proxy: unknown = new Proxy({} as Record<string, unknown>, {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null });
        }
        return (...args: unknown[]) => {
          if (prop === 'ilike') calls.ilike.push([args[0] as string, args[1] as string]);
          if (prop === 'or') calls.or.push(args[0] as string);
          return proxy;
        };
      },
    });
    return proxy;
  }

  return { calls, makeChain };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => h.makeChain() } }));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isSupervisor: false, roles: [] }) }));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
vi.mock('@/hooks/system/useSearchHistory', () => ({
  useSearchHistory: () => ({
    history: [],
    addToHistory: vi.fn(),
    removeFromHistory: vi.fn(),
    clearHistory: vi.fn(),
  }),
}));
vi.mock('@/lib/logger', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn() };
  return { log: logger, getLogger: () => logger, createLogger: vi.fn(() => logger) };
});

import { useGlobalSearchData, type ResultType } from '../useGlobalSearchData';

const TYPES = new Set<ResultType>(['message', 'transcription', 'contact']);

async function search(term: string) {
  h.calls.ilike.length = 0;
  h.calls.or.length = 0;
  const { result } = renderHook(() => useGlobalSearchData(true));
  await act(async () => {
    await result.current.performSearch(term, TYPES, 'all', []);
  });
}

describe('useGlobalSearchData — curingas do LIKE escapados', () => {
  beforeEach(() => {
    h.calls.ilike.length = 0;
    h.calls.or.length = 0;
  });

  it('digitar `_` busca o sublinhado literal em mensagem e transcrição', async () => {
    await search('a_b');

    const content = h.calls.ilike.find(([col]) => col === 'content');
    expect(content?.[1]).toBe('%a\\_b%');
    // O sublinhado cru casaria qualquer caractere — não pode aparecer assim.
    expect(content?.[1]).not.toBe('%a_b%');

    const transcription = h.calls.ilike.find(([col]) => col === 'transcription');
    expect(transcription?.[1]).toBe('%a\\_b%');
  });

  it('digitar `%` não vira curinga: o termo é literal', async () => {
    await search('50%');

    const content = h.calls.ilike.find(([col]) => col === 'content');
    expect(content?.[1]).toBe('%50\\%%');
    expect(content?.[1]).not.toBe('%50%%');
  });

  it('a busca de contato sai com o valor entre aspas e o curinga escapado', async () => {
    await search('a_b');

    const or = h.calls.or.find((clause) => clause.includes('name.ilike'));
    expect(or).toContain('name.ilike."%a\\\\_b%"');
    expect(or).toContain('phone.ilike."%a\\\\_b%"');
    expect(or).not.toContain('name.ilike.%a_b%');
  });

  it('digitar `100%` não casa tudo: o `%` sai literal em mensagem, transcrição e contato', async () => {
    await search('100%');

    const content = h.calls.ilike.find(([col]) => col === 'content');
    expect(content?.[1]).toBe('%100\\%%');
    // `%100%%` casaria qualquer coisa terminando em `100` — o curinga tem de sumir.
    expect(content?.[1]).not.toBe('%100%%');

    const transcription = h.calls.ilike.find(([col]) => col === 'transcription');
    expect(transcription?.[1]).toBe('%100\\%%');

    const or = h.calls.or.find((clause) => clause.includes('name.ilike'));
    expect(or).toContain('name.ilike."%100\\\\%%"');
    expect(or).not.toContain('name.ilike.%100%%');
  });

  it('a contrabarra digitada é escapada primeiro (não re-escapa o que vem depois)', async () => {
    await search('a\\b');

    const content = h.calls.ilike.find(([col]) => col === 'content');
    // Entrada `a\b` vira `a\\b` no padrão do LIKE, dentro de `%...%`.
    expect(content?.[1]).toBe('%a\\\\b%');
    expect(content?.[1]).not.toBe('%a\\b%');
  });
});
