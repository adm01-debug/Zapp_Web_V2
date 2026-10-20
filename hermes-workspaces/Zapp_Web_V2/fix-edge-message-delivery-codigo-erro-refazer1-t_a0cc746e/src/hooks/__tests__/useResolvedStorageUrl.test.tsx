import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  from: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: storageMocks.from } },
}));

vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn() },
}));

import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';

const ORIGIN = 'https://tnnnlkbymytvtqngbbqh.supabase.co';

describe('useResolvedStorageUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.from.mockReturnValue({ createSignedUrl: storageMocks.createSignedUrl });
    storageMocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: `${ORIGIN}/storage/v1/object/sign/audio-messages/fresh.webm?token=fresh` },
      error: null,
    });
  });

  it('exchanges a durable private locator for a fresh signed URL', async () => {
    const source = `${ORIGIN}/storage/v1/object/public/audio-messages/contact/audio.webm`;
    const { result } = renderHook(() => useResolvedStorageUrl(source));

    expect(result.current.url).toBe('');
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(storageMocks.from).toHaveBeenCalledWith('audio-messages');
    expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('contact/audio.webm', 3600);
    expect(result.current.url).toContain('token=fresh');
  });

  it('also renews a legacy expired signed URL without loading it first', async () => {
    const source = `${ORIGIN}/storage/v1/object/sign/whatsapp-media/uploads/audio.webm?token=expired`;
    const { result } = renderHook(() => useResolvedStorageUrl(source));

    expect(result.current.url).toBe('');
    await waitFor(() => expect(result.current.url).toContain('token=fresh'));
    expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('uploads/audio.webm', 3600);
  });

  it('leaves non-canonical media URLs unchanged', () => {
    const source = 'https://cdn.example.com/audio.webm';
    const { result } = renderHook(() => useResolvedStorageUrl(source));
    expect(result.current).toMatchObject({ url: source, isLoading: false, error: null });
    expect(storageMocks.from).not.toHaveBeenCalled();
  });

  it('reports signing failures and makes a manual retry safe', async () => {
    storageMocks.createSignedUrl
      .mockResolvedValueOnce({ data: null, error: new Error('object missing') })
      .mockResolvedValueOnce({
        data: { signedUrl: `${ORIGIN}/storage/v1/object/sign/audio-messages/fresh.webm?token=fresh` },
        error: null,
      });
    const source = `${ORIGIN}/storage/v1/object/public/audio-messages/contact/audio.webm`;
    const { result } = renderHook(() => useResolvedStorageUrl(source));

    await waitFor(() => expect(result.current.error?.message).toBe('object missing'));
    let retried: string | null = null;
    await act(async () => {
      retried = await result.current.refresh();
    });

    expect(retried).toContain('token=fresh');
    expect(result.current).toMatchObject({ isLoading: false, error: null });
  });

  it('coalesces concurrent manual refreshes', async () => {
    const source = `${ORIGIN}/storage/v1/object/public/audio-messages/contact/audio.webm`;
    const { result } = renderHook(() => useResolvedStorageUrl(source));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    storageMocks.createSignedUrl.mockClear();

    await act(async () => {
      await Promise.all([result.current.refresh(), result.current.refresh()]);
    });

    expect(storageMocks.createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('descarta o refresh antigo: a próxima mídia não fica sem URL nem presa em carregamento', async () => {
    const pendentes: Array<{ resolver: (valor: unknown) => void }> = [];
    storageMocks.createSignedUrl.mockImplementation(
      () => new Promise((resolver) => { pendentes.push({ resolver }); })
    );

    const primeira = `${ORIGIN}/storage/v1/object/public/audio-messages/primeira.webm`;
    const segunda = `${ORIGIN}/storage/v1/object/public/audio-messages/segunda.webm`;

    const { result, rerender } = renderHook(
      ({ src }: { src: string }) => useResolvedStorageUrl(src),
      { initialProps: { src: primeira } }
    );

    await act(async () => {
      pendentes[0].resolver({
        data: { signedUrl: `${ORIGIN}/storage/v1/object/sign/audio-messages/primeira.webm?token=primeira` },
        error: null,
      });
    });
    await waitFor(() => expect(result.current.url).toContain('token=primeira'));

    let refreshAntigo!: Promise<string | null>;
    await act(async () => {
      refreshAntigo = result.current.refresh();
    });
    expect(pendentes).toHaveLength(2);

    rerender({ src: segunda });
    await waitFor(() => expect(pendentes).toHaveLength(3));

    await act(async () => {
      pendentes[2].resolver({
        data: { signedUrl: `${ORIGIN}/storage/v1/object/sign/audio-messages/segunda.webm?token=segunda` },
        error: null,
      });
    });
    await waitFor(() => expect(result.current.url).toContain('token=segunda'));
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      pendentes[1].resolver({
        data: { signedUrl: `${ORIGIN}/storage/v1/object/sign/audio-messages/primeira.webm?token=primeira-refresh` },
        error: null,
      });
      await refreshAntigo;
    });

    expect(result.current.url).toContain('token=segunda');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  /**
   * R2-INB-059: a assinatura em lote (etapa 10) entra como URL de leitura sem pedir outra ao
   * Storage, mas o locator continua com o hook — `refresh` assina de novo a partir dele, coisa
   * que o consumidor nao conseguia mais fazer quando entregava uma source vazia.
   */
  describe('assinatura em lote (R2-INB-059)', () => {
    const LOCATOR = `${ORIGIN}/storage/v1/object/public/whatsapp-media/c/a.jpg`;
    const BATCH = `${ORIGIN}/storage/v1/object/sign/whatsapp-media/c/a.jpg?token=batch`;

    it('exibe a assinatura em lote sem pedir outra ao Storage', () => {
      const { result } = renderHook(() =>
        useResolvedStorageUrl(LOCATOR, undefined, {
          signedUrl: BATCH,
          signedUrlExpiresAt: Date.now() + 3_600_000,
        }),
      );

      expect(result.current.url).toBe(BATCH);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(storageMocks.createSignedUrl).not.toHaveBeenCalled();
    });

    it('renova pelo locator quando a assinatura em lote falha', async () => {
      const { result } = renderHook(() =>
        useResolvedStorageUrl(LOCATOR, undefined, {
          signedUrl: BATCH,
          signedUrlExpiresAt: Date.now() + 3_600_000,
        }),
      );
      expect(storageMocks.createSignedUrl).not.toHaveBeenCalled();

      let renewed: string | null = null;
      await act(async () => {
        renewed = await result.current.refresh();
      });

      expect(storageMocks.createSignedUrl).toHaveBeenCalledTimes(1);
      expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('c/a.jpg', 3600);
      expect(renewed).toContain('token=fresh');
      expect(result.current.url).toContain('token=fresh');
      expect(result.current.error).toBeNull();
    });

    it('assina na hora quando a assinatura em lote ja chegou expirada', async () => {
      const { result } = renderHook(() =>
        useResolvedStorageUrl(LOCATOR, undefined, {
          signedUrl: BATCH,
          signedUrlExpiresAt: Date.now() - 1,
        }),
      );

      expect(result.current.isLoading).toBe(true);
      await waitFor(() => expect(result.current.url).toContain('token=fresh'));
      expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('c/a.jpg', 3600);
    });

    it('adota a assinatura em lote reemitida pela consulta no lugar da antiga', () => {
      const { result, rerender } = renderHook(
        ({ signedUrl }: { signedUrl: string }) =>
          useResolvedStorageUrl(LOCATOR, undefined, { signedUrl }),
        { initialProps: { signedUrl: BATCH } },
      );
      expect(result.current.url).toBe(BATCH);

      rerender({ signedUrl: `${ORIGIN}/storage/v1/object/sign/whatsapp-media/c/a.jpg?token=batch2` });

      expect(result.current.url).toContain('token=batch2');
      expect(storageMocks.createSignedUrl).not.toHaveBeenCalled();
    });
  });
});
