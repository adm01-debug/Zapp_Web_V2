import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type React from 'react';
import { SUPABASE_URL } from '@/config/supabase';

const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  storageRemove: vi.fn(),
  tableFrom: vi.fn(),
  rowUpdateEq: vi.fn(),
  rowDeleteEq: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  selectResponse: { data: [] as unknown[] | null, error: null as unknown },
  updateResponse: { data: [] as unknown[] | null, error: null as unknown },
  deleteResponse: { data: [] as unknown[] | null, error: null as unknown },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: mocks.storageFrom },
    from: mocks.tableFrom,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: mocks.toastInfo,
  },
}));

import { useStickerPicker } from '../useStickerPicker';
import type { StickerItem } from '@/components/inbox/stickers/StickerTypes';

const STORAGE_ORIGIN = new URL(SUPABASE_URL).origin;
const STICKER_ID = 'sticker-1';

function publicLocator(bucket: string, path: string): string {
  return `${STORAGE_ORIGIN}/storage/v1/object/public/${bucket}/${path}`;
}

function makeSticker(overrides: Partial<StickerItem> = {}): StickerItem {
  return {
    id: STICKER_ID,
    name: 'Figurinha',
    image_url: publicLocator('stickers', 'sticker_123.webp'),
    category: 'enviadas',
    is_favorite: false,
    use_count: 0,
    ...overrides,
  };
}

const mouseEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;

/**
 * `from('stickers')` serve a lista (select) e as mutações (update/delete). As mutações seguem o
 * contrato novo: `...eq(...).select('id')` devolve as linhas afetadas, então cada resposta é
 * controlável pelo teste (error, 0 linhas ou 1 linha).
 */
function tableChain(table: string) {
  return {
    select: () => {
      const listQuery = {
        order: vi.fn(),
        range: vi.fn(() => Promise.resolve(mocks.selectResponse)),
      };
      listQuery.order.mockReturnValue(listQuery);
      return listQuery;
    },
    update: () => ({
      eq: (column: string, value: string) => {
        mocks.rowUpdateEq(table, column, value);
        return { select: () => Promise.resolve(mocks.updateResponse) };
      },
    }),
    delete: () => ({
      eq: (column: string, value: string) => {
        mocks.rowDeleteEq(table, column, value);
        return { select: () => Promise.resolve(mocks.deleteResponse) };
      },
    }),
    insert: () => Promise.resolve({ error: null }),
  };
}

/** Renderiza o hook REAL e abre o picker para a lista carregar a figurinha semeada. */
async function renderWithSticker(sticker: StickerItem) {
  mocks.selectResponse = { data: [sticker], error: null };
  const utils = renderHook(() => useStickerPicker(vi.fn()));
  await act(async () => { utils.result.current.setOpen(true); });
  await waitFor(() => expect(utils.result.current.stickers).toHaveLength(1));
  return utils;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tableFrom.mockImplementation(tableChain);
  mocks.storageFrom.mockImplementation((bucket: string) => ({
    remove: (paths: string[]) => mocks.storageRemove(bucket, paths),
  }));
  mocks.storageRemove.mockResolvedValue({ data: null, error: null });
  mocks.selectResponse = { data: [], error: null };
  mocks.updateResponse = { data: [{ id: STICKER_ID }], error: null };
  mocks.deleteResponse = { data: [{ id: STICKER_ID }], error: null };
});

describe('useStickerPicker — favorito, categoria e exclusão confirmam a escrita antes de anunciar sucesso', () => {
  it('1. favorito: update com error não anuncia sucesso, avisa e reverte is_favorite', async () => {
    const alvo = makeSticker();
    const { result } = await renderWithSticker(alvo);
    mocks.updateResponse = { data: null, error: { message: 'negado pelo RLS' } };

    await act(async () => { await result.current.toggleFavorite(mouseEvent, alvo); });

    expect(mocks.rowUpdateEq).toHaveBeenCalledWith('stickers', 'id', STICKER_ID);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(result.current.stickers.find(s => s.id === STICKER_ID)?.is_favorite).toBe(false);
  });

  it('2. categoria: update com error não anuncia sucesso, avisa e reverte a categoria anterior', async () => {
    const alvo = makeSticker({ category: 'enviadas' });
    const { result } = await renderWithSticker(alvo);
    mocks.updateResponse = { data: null, error: { message: 'negado pelo RLS' } };

    await act(async () => { await result.current.handleCategoryChange(alvo, 'amor'); });

    expect(mocks.rowUpdateEq).toHaveBeenCalledWith('stickers', 'id', STICKER_ID);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(result.current.stickers.find(s => s.id === STICKER_ID)?.category).toBe('enviadas');
  });

  it('3. categoria: update sem error e com 0 linhas é falha (o RLS filtra sem devolver erro)', async () => {
    const alvo = makeSticker({ category: 'enviadas' });
    const { result } = await renderWithSticker(alvo);
    mocks.updateResponse = { data: [], error: null };

    await act(async () => { await result.current.handleCategoryChange(alvo, 'amor'); });

    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(result.current.stickers.find(s => s.id === STICKER_ID)?.category).toBe('enviadas');
  });

  it('4. exclusão: delete da linha com error mantém a figurinha, não toca no objeto e não anuncia sucesso', async () => {
    const alvo = makeSticker();
    const { result } = await renderWithSticker(alvo);
    mocks.deleteResponse = { data: null, error: { message: 'negado pelo RLS' } };

    await act(async () => { await result.current.handleDelete(mouseEvent, alvo); });

    expect(mocks.rowDeleteEq).toHaveBeenCalledWith('stickers', 'id', STICKER_ID);
    expect(mocks.storageRemove).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(result.current.stickers.some(s => s.id === STICKER_ID)).toBe(true);
  });

  it('5. exclusão: linha removida e objeto com erro não é sucesso pleno (avisa o objeto órfão)', async () => {
    const alvo = makeSticker();
    const { result } = await renderWithSticker(alvo);
    mocks.deleteResponse = { data: [{ id: STICKER_ID }], error: null };
    mocks.storageRemove.mockResolvedValue({ data: null, error: { message: 'falha no storage' } });

    await act(async () => { await result.current.handleDelete(mouseEvent, alvo); });

    expect(mocks.storageRemove).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it('6. exclusão: caminho bom retira o item, anuncia sucesso UMA vez e só remove o objeto depois da linha', async () => {
    const alvo = makeSticker();
    const { result } = await renderWithSticker(alvo);
    mocks.deleteResponse = { data: [{ id: STICKER_ID }], error: null };

    await act(async () => { await result.current.handleDelete(mouseEvent, alvo); });

    expect(result.current.stickers.some(s => s.id === STICKER_ID)).toBe(false);
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.storageRemove).toHaveBeenCalledTimes(1);
    expect(mocks.rowDeleteEq.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.storageRemove.mock.invocationCallOrder[0]);
  });

  it('7. proteção: URL de whatsapp-media nunca remove objeto e a entrada só sai com a linha confirmada', async () => {
    const alvo = makeSticker({ image_url: publicLocator('whatsapp-media', 'contatos/abc/figurinha.webp') });
    const { result } = await renderWithSticker(alvo);

    // Linha NÃO confirmada (0 linhas) => a entrada volta e o objeto da conversa não é tocado.
    mocks.deleteResponse = { data: [], error: null };
    await act(async () => { await result.current.handleDelete(mouseEvent, alvo); });
    expect(mocks.storageFrom).not.toHaveBeenCalled();
    expect(mocks.storageRemove).not.toHaveBeenCalled();
    expect(result.current.stickers.some(s => s.id === STICKER_ID)).toBe(true);

    // Linha confirmada => a entrada sai e o objeto de whatsapp-media continua intacto.
    mocks.deleteResponse = { data: [{ id: STICKER_ID }], error: null };
    await act(async () => { await result.current.handleDelete(mouseEvent, alvo); });
    expect(mocks.storageRemove).not.toHaveBeenCalled();
    expect(result.current.stickers.some(s => s.id === STICKER_ID)).toBe(false);
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
  });
});
