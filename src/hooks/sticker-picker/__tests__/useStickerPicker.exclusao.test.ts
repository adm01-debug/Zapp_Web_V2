import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { MouseEvent } from 'react';
import { useStickerPicker } from '@/hooks/sticker-picker/useStickerPicker';
import { SUPABASE_URL } from '@/config/supabase';
import type { StickerItem } from '@/components/inbox/stickers/StickerTypes';

const ORIGIN = new URL(SUPABASE_URL).origin;

const h = vi.hoisted(() => ({
  delete: vi.fn(),
  eq: vi.fn(),
  storageFrom: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ delete: h.delete }),
    storage: { from: h.storageFrom },
  },
  SUPABASE_URL: 'https://tnnnlkbymytvtqngbbqh.supabase.co',
}));

function sticker(id: string, imageUrl: string): StickerItem {
  return { id, name: 'fig', image_url: imageUrl, category: 'enviadas', is_favorite: false, use_count: 0 };
}

function clickEvent() {
  return { stopPropagation: vi.fn() } as unknown as MouseEvent;
}

function renderPicker() {
  return renderHook(() => useStickerPicker(vi.fn()));
}

async function deleteSticker(item: StickerItem) {
  const { result } = renderPicker();
  await act(async () => {
    await result.current.handleDelete(clickEvent(), item);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.storageFrom.mockReturnValue({ remove: h.remove });
  h.remove.mockResolvedValue({ error: null });
  h.delete.mockReturnValue({ eq: h.eq });
  h.eq.mockResolvedValue({ error: null });
});

describe('useStickerPicker.handleDelete — contrato de exclusão (item #92)', () => {
  it('whatsapp-media: apaga a linha do catálogo e NUNCA toca o objeto do balão', async () => {
    const url = `${ORIGIN}/storage/v1/object/public/whatsapp-media/sticker_171234.webp`;

    await deleteSticker(sticker('s-wa', url));

    expect(h.delete).toHaveBeenCalled();
    expect(h.eq).toHaveBeenCalledWith('id', 's-wa');
    expect(h.storageFrom).not.toHaveBeenCalledWith('whatsapp-media');
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('objeto de whatsapp-media disfarçado com /stickers/ no caminho continua preservado', async () => {
    const url = `${ORIGIN}/storage/v1/object/public/whatsapp-media/stickers/sticker_171234.webp`;

    await deleteSticker(sticker('s-wa-sub', url));

    expect(h.eq).toHaveBeenCalledWith('id', 's-wa-sub');
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('bucket próprio stickers: remove o objeto físico junto da entrada', async () => {
    const url = `${ORIGIN}/storage/v1/object/public/stickers/sticker_99.webp`;

    await deleteSticker(sticker('s-own', url));

    expect(h.storageFrom).toHaveBeenCalledWith('stickers');
    expect(h.remove).toHaveBeenCalledWith(['sticker_99.webp']);
    expect(h.eq).toHaveBeenCalledWith('id', 's-own');
  });

  it('URL externa com forma de storage: fail-safe, nada físico é removido', async () => {
    const url = 'https://attacker.example/storage/v1/object/public/stickers/sticker_99.webp';

    await deleteSticker(sticker('s-ext', url));

    expect(h.eq).toHaveBeenCalledWith('id', 's-ext');
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('URL malformada ou vazia: fail-safe sem lançar, linha do catálogo sai', async () => {
    await deleteSticker(sticker('s-bad', 'https://cdn.example.com/whatsapp-media/foo.webp'));
    await deleteSticker(sticker('s-blank', 'nao-e-url'));

    expect(h.eq).toHaveBeenCalledWith('id', 's-bad');
    expect(h.eq).toHaveBeenCalledWith('id', 's-blank');
    expect(h.remove).not.toHaveBeenCalled();
  });
});
