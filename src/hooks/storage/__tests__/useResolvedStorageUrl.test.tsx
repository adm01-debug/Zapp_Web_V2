import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const { mockStorageFrom, createSignedUrl } = vi.hoisted(() => ({
  mockStorageFrom: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: (...args: unknown[]) => mockStorageFrom(...args) },
  },
}));

vi.mock('@/config/supabase', () => ({ SUPABASE_URL: 'https://test.supabase.co' }));

import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';

const STORAGE = 'https://test.supabase.co';

/** Locator HTTPS durável — a rota `/public/` aqui é só identificador de objeto. */
function locator(bucket: string, path: string): string {
  return `${STORAGE}/storage/v1/object/public/${bucket}/${path}`;
}

function signed(bucket: string, path: string): string {
  return `${STORAGE}/storage/v1/object/sign/${bucket}/${path}?token=fresco`;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStorageFrom.mockImplementation((bucket: string) => ({
    createSignedUrl: (path: string, ttl: number) => createSignedUrl(bucket, path, ttl),
  }));
  createSignedUrl.mockImplementation((bucket: string, path: string) =>
    Promise.resolve({ data: { signedUrl: signed(bucket, path) }, error: null }),
  );
});

/**
 * R2-DB-022 B2 (pós ACL): depois que a leitura dos buckets privados passou a ser autorizada
 * só pelo locator canônico + assinatura, todo consumidor de mídia privada (galeria, cartão de
 * mensagem, prévia de documento/vídeo) lê por este hook. Os testes abaixo fixam o contrato:
 * bucket privado reconhecido é SEMPRE trocado por URL assinada; o locator privado nunca é
 * devolvido como fonte de mídia; falha de assinatura é fail-closed (sem fallback para a URL
 * pública). Se a assinatura deixar de ser chamada, estes testes ficam vermelhos.
 */
describe('useResolvedStorageUrl — mídia privada por URL assinada (whatsapp-media/audio-messages)', () => {
  it('whatsapp-media: troca o locator público por URL assinada do path canônico', async () => {
    const path = 'image/3EB0E6947FC0A0ECAED14D_1790283276022.jpg';
    const source = locator('whatsapp-media', path);
    const { result } = renderHook(() => useResolvedStorageUrl(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    expect(createSignedUrl).toHaveBeenCalledWith('whatsapp-media', path, 3600);
    expect(result.current.url).toBe(signed('whatsapp-media', path));
    expect(result.current.url).not.toBe(source);
    expect(result.current.error).toBeNull();
  });

  it('audio-messages: assina no bucket da origem e devolve a URL assinada', async () => {
    const path = 'c1/audio/ptt-1.ogg';
    const source = locator('audio-messages', path);
    const { result } = renderHook(() => useResolvedStorageUrl(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(createSignedUrl).toHaveBeenCalledWith('audio-messages', path, 3600);
    expect(result.current.url).toBe(signed('audio-messages', path));
    expect(result.current.url).not.toBe(source);
  });

  it('URL assinada antiga (token na query) é reassinada pelo path canônico, sem carregar o token', async () => {
    const path = 'c1/video/clipe.mp4';
    const source = `${STORAGE}/storage/v1/object/sign/whatsapp-media/${path}?token=expirado`;
    const { result } = renderHook(() => useResolvedStorageUrl(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(createSignedUrl).toHaveBeenCalledWith('whatsapp-media', path, 3600);
    expect(result.current.url).toBe(signed('whatsapp-media', path));
    expect(result.current.url).not.toContain('expirado');
  });

  it('falha de assinatura é fail-closed: nunca cai para o locator privado e expõe o erro', async () => {
    // O Storage responde `{ data: null, error }` quando a ACL nega a assinatura (aqui, e no
    // supabase-js 2.117.2, o erro é StorageApiError — subclasse de Error).
    createSignedUrl.mockResolvedValueOnce({ data: null, error: new Error('negado pela ACL de leitura') });
    const source = locator('whatsapp-media', 'contact-A/foto.jpg');
    const { result } = renderHook(() => useResolvedStorageUrl(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.url).toBe('');
    expect(result.current.url).not.toBe(source);
    expect(result.current.error?.message).toBe('negado pela ACL de leitura');
  });

  it('erro em objeto (não-Error) também é fail-closed, com erro exposto', async () => {
    createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'negado', statusCode: '403' } });
    const source = locator('whatsapp-media', 'contact-A/foto.jpg');
    const { result } = renderHook(() => useResolvedStorageUrl(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.url).toBe('');
    expect(result.current.error).not.toBeNull();
  });

  it('resposta sem signedUrl também é fail-closed (nada de ler o locator privado direto)', async () => {
    createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: '' }, error: null });
    const source = locator('whatsapp-media', 'contact-A/foto.jpg');
    const { result } = renderHook(() => useResolvedStorageUrl(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.url).toBe('');
    expect(result.current.error).not.toBeNull();
  });

  it('mídia que não é objeto de bucket privado passa direto, sem pedir assinatura', async () => {
    // URL externa (CDN/legado) e bucket público da mesma origem: não são objeto dos buckets
    // privados, então o hook não inventa assinatura nem bloqueia a leitura.
    const externa = 'https://cdn.exemplo.com/foto.jpg';
    const bucketPublico = locator('stickers', 's1.png');

    const a = renderHook(() => useResolvedStorageUrl(externa));
    const b = renderHook(() => useResolvedStorageUrl(bucketPublico));

    await waitFor(() => expect(a.result.current.isLoading).toBe(false));
    await waitFor(() => expect(b.result.current.isLoading).toBe(false));

    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(a.result.current.url).toBe(externa);
    expect(b.result.current.url).toBe(bucketPublico);
  });

  it('whatsapp-media: refresh pede uma assinatura nova (a antiga expira) e não duplica o pedido', async () => {
    const path = 'c1/foto.jpg';
    const { result } = renderHook(() => useResolvedStorageUrl(locator('whatsapp-media', path)));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(createSignedUrl).toHaveBeenCalledTimes(1);

    createSignedUrl.mockImplementationOnce((bucket: string, p: string) =>
      Promise.resolve({ data: { signedUrl: `${signed(bucket, p)}&refresh=1` }, error: null }),
    );
    let first!: Promise<string | null>;
    let second!: Promise<string | null>;
    act(() => {
      first = result.current.refresh();
      second = result.current.refresh(); // em voo: reaproveita a mesma promessa
    });

    await waitFor(() => expect(result.current.url).toContain('refresh=1'));
    await expect(first).resolves.toContain('refresh=1');
    // O 2º refresh em voo não abre um 3º pedido: reaproveita a assinatura pedida pelo 1º.
    await expect(second).resolves.toContain('refresh=1');
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('troca de item na galeria: resposta atrasada do item antigo é descartada e o carregando libera', async () => {
    const antigo = locator('whatsapp-media', 'c1/antigo.jpg');
    const novo = locator('whatsapp-media', 'c1/novo.jpg');
    let liberarAntigo!: () => void;
    createSignedUrl
      .mockImplementationOnce((bucket: string, path: string) => new Promise((resolve) => {
        liberarAntigo = () => resolve({ data: { signedUrl: signed(bucket, path) }, error: null });
      }))
      .mockImplementationOnce((bucket: string, path: string) =>
        Promise.resolve({ data: { signedUrl: signed(bucket, path) }, error: null }),
      );

    const { result, rerender } = renderHook(({ src }: { src: string }) => useResolvedStorageUrl(src), {
      initialProps: { src: antigo },
    });
    rerender({ src: novo });
    await waitFor(() => expect(result.current.url).toBe(signed('whatsapp-media', 'c1/novo.jpg')));

    // A resposta do item antigo chega DEPOIS da nova: não pode voltar a valer.
    await act(async () => { liberarAntigo(); });

    expect(result.current.url).toBe(signed('whatsapp-media', 'c1/novo.jpg'));
    expect(result.current.url).not.toContain('antigo.jpg');
    expect(result.current.isLoading).toBe(false);
  });
});
