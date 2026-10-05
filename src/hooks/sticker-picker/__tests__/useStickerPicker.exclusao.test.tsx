import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type React from 'react';
import { SUPABASE_URL } from '@/config/supabase';

const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  storageRemove: vi.fn(),
  tableFrom: vi.fn(),
  rowDeleteEq: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
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

function publicLocator(bucket: string, path: string): string {
  return `${STORAGE_ORIGIN}/storage/v1/object/public/${bucket}/${path}`;
}

function sticker(image_url: string): StickerItem {
  return { id: 'sticker-1', name: 'Figurinha', image_url, category: 'enviadas', is_favorite: false, use_count: 0 };
}

const mouseEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;

/**
 * `from('stickers')` é usado tanto pela lista (select) quanto pela exclusão (delete).
 * A cadeia de delete registra a tabela/coluna/valor para o teste provar que a LINHA some
 * independentemente do destino do objeto físico.
 */
function tableChain(table: string) {
  return {
    select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
    delete: () => ({
      eq: (column: string, value: string) => {
        mocks.rowDeleteEq(table, column, value);
        return Promise.resolve({ error: null });
      },
    }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    insert: () => Promise.resolve({ error: null }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storageFrom.mockImplementation((bucket: string) => ({
    remove: (paths: string[]) => mocks.storageRemove(bucket, paths),
  }));
  mocks.storageRemove.mockResolvedValue({ data: null, error: null });
  mocks.tableFrom.mockImplementation(tableChain);
});

describe('useStickerPicker.handleDelete — contrato de exclusão da biblioteca', () => {
  it('URL do bucket whatsapp-media: apaga só a linha do catálogo e nunca o objeto da conversa', async () => {
    const { result } = renderHook(() => useStickerPicker(vi.fn()));
    const alvo = sticker(publicLocator('whatsapp-media', 'contatos/abc/figurinha.webp'));

    await act(async () => { await result.current.handleDelete(mouseEvent, alvo); });

    expect(mocks.rowDeleteEq).toHaveBeenCalledWith('stickers', 'id', 'sticker-1');
    expect(mocks.storageFrom).not.toHaveBeenCalled();
    expect(mocks.storageRemove).not.toHaveBeenCalled();
  });

  it('URL do bucket próprio stickers: remove o objeto próprio junto da entrada', async () => {
    const { result } = renderHook(() => useStickerPicker(vi.fn()));
    const alvo = sticker(publicLocator('stickers', 'sticker_123.webp'));

    await act(async () => { await result.current.handleDelete(mouseEvent, alvo); });

    expect(mocks.storageRemove).toHaveBeenCalledTimes(1);
    expect(mocks.storageRemove).toHaveBeenCalledWith('stickers', ['sticker_123.webp']);
    expect(mocks.rowDeleteEq).toHaveBeenCalledWith('stickers', 'id', 'sticker-1');
  });

  it('URL externa/malformada: fail-safe, preserva qualquer objeto e apaga só a linha', async () => {
    const { result } = renderHook(() => useStickerPicker(vi.fn()));
    const casos = [
      'https://cdn.example.com/stickers/figurinha.webp',
      `${STORAGE_ORIGIN}/storage/v1/object/public/audio-messages/voz.ogg`,
      `${STORAGE_ORIGIN}/storage/v1/object/public/stickers/../whatsapp-media/contatos/x.webp`,
      'nao-e-uma-url',
      '',
    ];

    for (const url of casos) {
      mocks.storageFrom.mockClear();
      mocks.storageRemove.mockClear();
      mocks.rowDeleteEq.mockClear();
      await act(async () => { await result.current.handleDelete(mouseEvent, sticker(url)); });
      expect(mocks.storageRemove).not.toHaveBeenCalled();
      expect(mocks.rowDeleteEq).toHaveBeenCalledWith('stickers', 'id', 'sticker-1');
    }
  });
});
