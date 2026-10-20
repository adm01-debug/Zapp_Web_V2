import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

/**
 * M01 — hook da miniatura de PDF.
 *
 * O que é mockado: o cliente Supabase (a assinatura da URL) e `renderPdfThumbnail` (a
 * biblioteca tem teste próprio, em `src/lib/__tests__/pdfThumbnail.test.ts`). O hook REAL roda
 * com o `useResolvedStorageUrl` de verdade, então a URL que chega na biblioteca é a ASSINADA.
 */

const { mockStorageFrom, createSignedUrl } = vi.hoisted(() => ({
  mockStorageFrom: vi.fn(),
  createSignedUrl: vi.fn(),
}));

const { renderPdfThumbnail } = vi.hoisted(() => ({ renderPdfThumbnail: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: (...args: unknown[]) => mockStorageFrom(...args) },
  },
}));

vi.mock('@/config/supabase', () => ({ SUPABASE_URL: 'https://test.supabase.co' }));

vi.mock('@/lib/pdfThumbnail', () => ({
  renderPdfThumbnail: (...args: unknown[]) => renderPdfThumbnail(...args),
}));

vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { PDF_THUMBNAIL_LARGURA, usePdfThumbnail } from '@/hooks/chat/usePdfThumbnail';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

const STORAGE = 'https://test.supabase.co';
const CAMINHO = 'documento/contrato.pdf';

function itemPdf(ajustes: Partial<ContactMediaItem> = {}): ContactMediaItem {
  return {
    id: 'midia-1',
    url: `${STORAGE}/storage/v1/object/public/whatsapp-media/${CAMINHO}`,
    type: 'document',
    filename: 'contrato.pdf',
    displayName: 'contrato.pdf',
    extension: 'pdf',
    senderLabel: null,
    created_at: '2026-10-07T12:00:00.000Z',
    caption: null,
    mimetype: 'application/pdf',
    size: 4096,
    meta: null,
    sender: null,
    ...ajustes,
  };
}

function urlAssinada(bucket = 'whatsapp-media', caminho = CAMINHO): string {
  return `${STORAGE}/storage/v1/object/sign/${bucket}/${caminho}?token=assinatura-fresca`;
}

let criados = 0;
const createObjectURL = vi.fn(() => `blob:miniatura-${(criados += 1)}`);
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  criados = 0;

  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });

  mockStorageFrom.mockImplementation((bucket: string) => ({
    createSignedUrl: (caminho: string, ttl: number) => createSignedUrl(bucket, caminho, ttl),
  }));
  createSignedUrl.mockImplementation((bucket: string, caminho: string) =>
    Promise.resolve({ data: { signedUrl: urlAssinada(bucket, caminho) }, error: null }),
  );
  renderPdfThumbnail.mockResolvedValue(new Blob(['miniatura'], { type: 'image/jpeg' }));
});

describe('usePdfThumbnail — portões e estados', () => {
  it('item que não é PDF não assina nem renderiza: sem-previa', () => {
    const { result } = renderHook(() => usePdfThumbnail(itemPdf({ extension: 'docx', mimetype: null }), true));

    expect(result.current).toEqual({ url: null, estado: 'sem-previa' });
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(renderPdfThumbnail).not.toHaveBeenCalled();
  });

  it('com a prévia desligada não assina nada; ligar depois assina e renderiza', async () => {
    const { result, rerender } = renderHook(
      ({ habilitado }: { habilitado: boolean }) => usePdfThumbnail(itemPdf(), habilitado),
      { initialProps: { habilitado: false } },
    );

    expect(result.current).toEqual({ url: null, estado: 'sem-previa' });
    expect(createSignedUrl).not.toHaveBeenCalled();

    rerender({ habilitado: true });
    await waitFor(() => expect(result.current.estado).toBe('ready'));

    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    expect(renderPdfThumbnail).toHaveBeenCalledTimes(1);
  });

  it('item sem URL não fica preso em loading: sem-previa', () => {
    const { result } = renderHook(() => usePdfThumbnail(itemPdf({ url: '' }), true));

    expect(result.current).toEqual({ url: null, estado: 'sem-previa' });
    expect(renderPdfThumbnail).not.toHaveBeenCalled();
  });

  it('fica em loading enquanto a assinatura não resolve', async () => {
    let resolver: (valor: unknown) => void = () => undefined;
    createSignedUrl.mockImplementation(() => new Promise((resolve) => { resolver = resolve; }));

    const { result } = renderHook(() => usePdfThumbnail(itemPdf(), true));

    expect(result.current).toEqual({ url: null, estado: 'loading' });
    expect(renderPdfThumbnail).not.toHaveBeenCalled();

    await act(async () => {
      resolver({ data: { signedUrl: urlAssinada() }, error: null });
    });

    await waitFor(() => expect(result.current.estado).toBe('ready'));
  });
});

describe('usePdfThumbnail — URL assinada, object URL e Blob', () => {
  it('entrega a URL ASSINADA (não o locator) à biblioteca e mostra o object URL do Blob', async () => {
    const item = itemPdf();
    const { result } = renderHook(() => usePdfThumbnail(item, true));

    await waitFor(() => expect(result.current.estado).toBe('ready'));

    expect(createSignedUrl).toHaveBeenCalledWith('whatsapp-media', CAMINHO, 3600);

    const [urlRecebida, opcoes] = renderPdfThumbnail.mock.calls[0] as [string, {
      largura: number; sinal: AbortSignal; chave: string;
    }];
    expect(urlRecebida).toBe(urlAssinada());
    expect(urlRecebida).not.toBe(item.url);
    expect(opcoes.largura).toBe(PDF_THUMBNAIL_LARGURA);
    expect(opcoes.chave).toBe('midia-1');
    expect(opcoes.sinal).toBeInstanceOf(AbortSignal);
    expect(opcoes.sinal.aborted).toBe(false);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(result.current.url).toBe('blob:miniatura-1');
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('sem prévia (Blob null) cai em sem-previa, sem criar object URL', async () => {
    renderPdfThumbnail.mockResolvedValue(null);

    const { result } = renderHook(() => usePdfThumbnail(itemPdf(), true));

    await waitFor(() => expect(result.current.estado).toBe('sem-previa'));
    expect(result.current.url).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('falha ao assinar vira erro e a biblioteca nem é chamada', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: new Error('sem permissão') });

    const { result } = renderHook(() => usePdfThumbnail(itemPdf(), true));

    await waitFor(() => expect(result.current.estado).toBe('erro'));
    expect(result.current.url).toBeNull();
    expect(renderPdfThumbnail).not.toHaveBeenCalled();
  });

  it('rejeição inesperada da biblioteca cai em sem-previa (nunca fica preso em loading)', async () => {
    renderPdfThumbnail.mockRejectedValue(new Error('contrato quebrado'));

    const { result } = renderHook(() => usePdfThumbnail(itemPdf(), true));

    await waitFor(() => expect(result.current.estado).toBe('sem-previa'));
    expect(result.current.url).toBeNull();
  });
});

describe('usePdfThumbnail — ciclo de vida do object URL', () => {
  it('desmontar revoga o object URL e aborta a renderização', async () => {
    const { result, unmount } = renderHook(() => usePdfThumbnail(itemPdf(), true));

    await waitFor(() => expect(result.current.estado).toBe('ready'));
    const sinal = (renderPdfThumbnail.mock.calls[0] as [string, { sinal: AbortSignal }])[1].sinal;

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:miniatura-1');
    expect(sinal.aborted).toBe(true);
  });

  it('resposta que chega depois do desmonte não cria object URL nem mexe no estado', async () => {
    let resolver: (blob: Blob | null) => void = () => undefined;
    renderPdfThumbnail.mockImplementation(() => new Promise<Blob | null>((resolve) => { resolver = resolve; }));

    const { unmount } = renderHook(() => usePdfThumbnail(itemPdf(), true));
    await waitFor(() => expect(renderPdfThumbnail).toHaveBeenCalled());

    unmount();
    await act(async () => {
      resolver(new Blob(['tarde demais']));
    });

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('trocar de item revoga o object URL anterior e mostra o novo', async () => {
    const { result, rerender } = renderHook(
      ({ item }: { item: ContactMediaItem }) => usePdfThumbnail(item, true),
      { initialProps: { item: itemPdf() } },
    );

    await waitFor(() => expect(result.current.estado).toBe('ready'));
    const primeiro = result.current.url;

    rerender({ item: itemPdf({ id: 'midia-2', filename: 'outro.pdf', displayName: 'outro.pdf', url: `${STORAGE}/storage/v1/object/public/whatsapp-media/documento/outro.pdf` }) });

    await waitFor(() => expect(result.current.estado).toBe('ready'));
    expect(result.current.url).toBe('blob:miniatura-2');
    expect(result.current.url).not.toBe(primeiro);
    expect(revokeObjectURL).toHaveBeenCalledWith(primeiro);
    expect(renderPdfThumbnail).toHaveBeenCalledTimes(2);
  });
});
