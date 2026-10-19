import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * R2-INB-063 — no SELETOR de figurinhas o filtro "Recentes" ordenava por `use_count`
 * (mais usadas) e o rodapé ainda rotulava o conjunto como "Mais usadas". Ou seja: o
 * botão dizia "Recentes" mas mostrava as mais usadas, e não havia filtro próprio para
 * as mais usadas.
 *
 * Este arquivo fixa o contrato: "Recentes" ordena pela recência real (`created_at`,
 * mais novas primeiro) e "Mais usadas" vira um filtro próprio, ordenado por uso.
 */

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

let STICKER_ROWS: Row[] = [];

function makeChain() {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn(async (from: number, to: number) => ({
    data: STICKER_ROWS.slice(from, to + 1),
    error: null,
  }));
  chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: [...STICKER_ROWS], error: null });
  chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => mocks.from(table) as unknown,
    storage: { from: () => ({ remove: vi.fn(async () => ({ error: null })) }) },
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),

  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));

import { useStickerPicker } from '@/hooks/sticker-picker/useStickerPicker';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation(() => makeChain());
  // A MAIS USADA é a MAIS ANTIGA: assim a ordem por uso difere da ordem por recência.
  STICKER_ROWS = [
    {
      id: 's-antiga',
      name: 'antiga top',
      image_url: 'https://exemplo/stickers/antiga.webp',
      category: 'riso',
      is_favorite: false,
      use_count: 50,
      created_at: '2026-09-01T10:00:00Z',
    },
    {
      id: 's-nova',
      name: 'nova recente',
      image_url: 'https://exemplo/stickers/nova.webp',
      category: 'riso',
      is_favorite: false,
      use_count: 1,
      created_at: '2026-10-05T10:00:00Z',
    },
  ];
});

async function openPicker() {
  const { result } = renderHook(() => useStickerPicker(vi.fn()));
  await act(async () => {
    result.current.setOpen(true);
  });
  await waitFor(() => expect(result.current.stickers).toHaveLength(2));
  return result;
}

describe('useStickerPicker — Recentes e Mais usadas (R2-INB-063)', () => {
  it('"Recentes" ordena pela recência real (mais novas primeiro)', async () => {
    const result = await openPicker();

    await act(async () => {
      result.current.setShowRecent(true);
    });

    expect(result.current.filtered.map((s) => s.id)).toEqual(['s-nova', 's-antiga']);
  });

  it('"Mais usadas" é filtro próprio e ordena por uso', async () => {
    const result = await openPicker();

    expect(result.current).toHaveProperty('showMostUsed');
    await act(async () => {
      result.current.setShowRecent(false);
      result.current.setShowMostUsed(true);
    });

    expect(result.current.showMostUsed).toBe(true);
    expect(result.current.filtered.map((s) => s.id)).toEqual(['s-antiga', 's-nova']);
  });
});
