import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * #345 (R2-INB-052) — a grade de figurinhas e a confirmacao de exclusao escreviam
 * `sticker.image_url` cru no `<img>`. A tabela `stickers` tambem guarda locators de bucket
 * privado (`whatsapp-media`, `public=false` desde 20260905030000_private_media_buckets.sql) e
 * assinaturas ja expiradas — gravados pelo balao da mensagem e pelo envio de midia. O balao
 * exibe a MESMA figurinha porque usa o resolvedor; a grade quebrava.
 *
 * O teste chama o resolvedor REAL (so o cliente do Storage e o logger sao mockados).
 */
const storageMocks = vi.hoisted(() => ({
  from: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: storageMocks.from } },
}));

vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { StickerGrid } from '../StickerGrid';
import type { StickerItem } from '../StickerTypes';
import { PRODUCTION_SUPABASE_URL } from '@/config/supabase';

const ORIGIN = new URL(PRODUCTION_SUPABASE_URL).origin;
const LOCATOR = `${ORIGIN}/storage/v1/object/public/whatsapp-media/recebida.webp`;
const EXPIRED = `${ORIGIN}/storage/v1/object/sign/whatsapp-media/x.webp?token=expired`;
const FRESH = `${ORIGIN}/storage/v1/object/sign/whatsapp-media/recebida.webp?token=fresh`;
const FRESH_2 = `${ORIGIN}/storage/v1/object/sign/whatsapp-media/recebida.webp?token=fresh2`;
const FRESH_X = `${ORIGIN}/storage/v1/object/sign/whatsapp-media/x.webp?token=fresh`;

function signedUrlFor(path: string) {
  return `${ORIGIN}/storage/v1/object/sign/whatsapp-media/${path}?token=fresh`;
}

function sticker(overrides: Partial<StickerItem> = {}): StickerItem {
  return {
    id: 's1',
    name: 'comemorando',
    image_url: LOCATOR,
    category: 'riso',
    is_favorite: false,
    use_count: 3,
    ...overrides,
  };
}

function renderGrid(items: StickerItem[]) {
  return render(
    <TooltipProvider>
      <StickerGrid
        stickers={items}
        loading={false}
        search=""
        gridSize="md"
        onSend={vi.fn()}
        onToggleFavorite={vi.fn()}
        onDelete={vi.fn()}
        onCategoryChange={vi.fn()}
        onAddClick={vi.fn()}
      />
    </TooltipProvider>,
  );
}

function gridImg(container: HTMLElement) {
  return container.querySelector('img') as HTMLImageElement | null;
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.from.mockReturnValue({ createSignedUrl: storageMocks.createSignedUrl });
  storageMocks.createSignedUrl.mockImplementation(async (path: string) => ({
    data: { signedUrl: signedUrlFor(path) },
    error: null,
  }));
});

describe('StickerGrid — resolucao da URL de bucket privado (#345-A)', () => {
  it('Caso 1: locator de bucket privado e trocado por assinatura nova na grade', async () => {
    const { container } = renderGrid([sticker()]);

    await waitFor(() => expect(gridImg(container)).toHaveAttribute('src', FRESH));
    expect(storageMocks.from).toHaveBeenCalledWith('whatsapp-media');
    expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('recebida.webp', 3600);
    expect(gridImg(container)?.getAttribute('src')).not.toBe(LOCATOR);
  });

  it('Caso 2: assinatura expirada e renovada antes de aparecer na grade', async () => {
    const { container } = renderGrid([sticker({ image_url: EXPIRED })]);

    await waitFor(() => expect(gridImg(container)).toHaveAttribute('src', FRESH_X));
    expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('x.webp', 3600);
    expect(gridImg(container)?.getAttribute('src')).not.toBe(EXPIRED);
  });

  it('Caso 3: falha ao assinar mostra o placeholder e nao descarta a figurinha', async () => {
    storageMocks.createSignedUrl.mockResolvedValue({
      data: null,
      error: new Error('object missing'),
    });
    const { container } = renderGrid([sticker()]);

    await screen.findByTestId('sticker-thumb-error');
    expect(gridImg(container)).toBeNull();
    expect(screen.getAllByRole('gridcell')).toHaveLength(1);
    expect(screen.getByTitle('Figurinha indisponível')).toBeInTheDocument();
  });

  it('Caso 4: erro de imagem dispara uma unica renovacao e depois o placeholder', async () => {
    storageMocks.createSignedUrl
      .mockImplementationOnce(async () => ({ data: { signedUrl: FRESH }, error: null }))
      .mockImplementationOnce(async () => ({ data: { signedUrl: FRESH_2 }, error: null }));
    const { container } = renderGrid([sticker()]);

    await waitFor(() => expect(gridImg(container)).toHaveAttribute('src', FRESH));

    fireEvent.error(gridImg(container) as HTMLImageElement);
    await waitFor(() => expect(gridImg(container)).toHaveAttribute('src', FRESH_2));
    expect(storageMocks.createSignedUrl).toHaveBeenCalledTimes(2);

    fireEvent.error(gridImg(container) as HTMLImageElement);
    await screen.findByTestId('sticker-thumb-error');
    expect(gridImg(container)).toBeNull();
    expect(storageMocks.createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('Caso 4b: renovacao que falha cai no placeholder sem segundo pedido de assinatura', async () => {
    storageMocks.createSignedUrl
      .mockImplementationOnce(async () => ({ data: { signedUrl: FRESH }, error: null }))
      .mockImplementationOnce(async () => ({
        data: null,
        error: new Error('object missing'),
      }));
    const { container } = renderGrid([sticker()]);

    await waitFor(() => expect(gridImg(container)).toHaveAttribute('src', FRESH));

    fireEvent.error(gridImg(container) as HTMLImageElement);
    await screen.findByTestId('sticker-thumb-error');
    expect(gridImg(container)).toBeNull();
    expect(storageMocks.createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('Caso 5: URL nao canonica continua sendo usada sem assinatura', () => {
    const cdn = 'https://cdn.example.com/f.webp';
    const { container } = renderGrid([sticker({ image_url: cdn })]);

    expect(gridImg(container)).toHaveAttribute('src', cdn);
    expect(storageMocks.from).not.toHaveBeenCalled();
    expect(storageMocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('Caso 6: a miniatura da confirmacao de exclusao usa a URL assinada', async () => {
    const { container } = renderGrid([sticker()]);
    await waitFor(() => expect(gridImg(container)).toHaveAttribute('src', FRESH));

    fireEvent.click(screen.getByLabelText('Excluir figurinha'));

    const dialogImg = await waitFor(() => {
      const el = document.querySelector('img[alt=""]');
      if (!el) throw new Error('confirmacao de exclusao sem miniatura');
      return el as HTMLImageElement;
    });
    expect(dialogImg.getAttribute('src')).toBe(FRESH);
    expect(dialogImg.getAttribute('src')).not.toBe(LOCATOR);
    expect(dialogImg).toHaveAttribute('loading', 'lazy');
    expect(dialogImg).toHaveAttribute('decoding', 'async');
  });
});
