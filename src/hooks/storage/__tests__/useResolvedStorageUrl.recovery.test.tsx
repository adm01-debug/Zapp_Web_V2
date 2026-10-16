import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  createSignedUrl: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: mocks.from },
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn() },
}));

import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';
import { queryClient } from '@/lib/queryClient';
import { SUPABASE_URL } from '@/config/supabase';
import { contactMediaKey } from '@/hooks/chat/useContactMedia';
import { MAX_RECOVERY_ATTEMPTS } from '@/services/mediaRecovery';

/**
 * PH-07: mídia do WhatsApp cuja URL de CDN venceu. O par (url → id da mensagem) vive no cache
 * de mídia; a Edge `recover-message-media` devolve o locator permanente, que volta assinado
 * para a tela e gravado no cache. Teto de tentativas por objeto fecha o laço de falha.
 */
const ORIGIN = new URL(SUPABASE_URL).origin;
const CONTACT_ID = 'contato-1';
const cdnOf = (sufixo: string) => `https://mmg.whatsapp.net/d/${sufixo}/expirada.enc`;
const LOCATOR = `${ORIGIN}/storage/v1/object/public/whatsapp-media/contato/recuperada.jpg`;
const SIGNED = `${ORIGIN}/storage/v1/object/sign/whatsapp-media/contato/recuperada.jpg?token=novo`;

function seedMediaCache(url: string, id: string, extra: Record<string, unknown> = {}) {
  queryClient.setQueryData(contactMediaKey(CONTACT_ID), {
    pageParams: [null],
    pages: [{
      nextCursor: null,
      items: [{
        id,
        url,
        type: 'image',
        filename: 'foto.jpg',
        displayName: 'foto.jpg',
        extension: 'jpg',
        senderLabel: null,
        created_at: '2026-10-01T12:00:00.000Z',
        caption: null,
        mimetype: 'image/jpeg',
        size: 1024,
        meta: null,
        sender: 'contact',
        ...extra,
      }],
    }],
  });
}

function cachedItem() {
  const data = queryClient.getQueryData(contactMediaKey(CONTACT_ID)) as
    { pages: Array<{ items: Array<Record<string, unknown>> }> } | undefined;
  return data?.pages[0].items[0];
}

describe('useResolvedStorageUrl — mídia do WhatsApp vencida (PH-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    mocks.from.mockReturnValue({ createSignedUrl: mocks.createSignedUrl });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: SIGNED }, error: null });
    mocks.invoke.mockResolvedValue({ data: { status: 'ok', media_url: LOCATOR }, error: null });
  });

  it('recupera a mídia vencida e grava o locator permanente no cache', async () => {
    const cdn = cdnOf('recuperavel');
    seedMediaCache(cdn, '11111111-1111-1111-1111-111111111111');
    const { result } = renderHook(() => useResolvedStorageUrl(cdn));
    // URL de CDN passa direto (não é objeto do Storage) até o consumidor ver a falha.
    expect(result.current).toMatchObject({ url: cdn, isLoading: false, error: null });

    let refreshed: string | null = null;
    await act(async () => {
      refreshed = await result.current.refresh();
    });

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    const [nome, opcoes] = mocks.invoke.mock.calls[0] as [string, { body: unknown; signal?: AbortSignal }];
    expect(nome).toBe('recover-message-media');
    expect(opcoes.body).toEqual({ message_id: '11111111-1111-1111-1111-111111111111' });
    expect(opcoes.signal).toBeInstanceOf(AbortSignal);

    expect(refreshed).toBe(SIGNED);
    expect(result.current).toMatchObject({ url: SIGNED, isLoading: false, error: null });
    expect(mocks.createSignedUrl).toHaveBeenCalledWith('contato/recuperada.jpg', 3600);

    const item = cachedItem();
    expect(item?.url).toBe(LOCATOR);
    expect(item?.signedUrl).toBeUndefined();
    expect(item?.expiresAt).toBeUndefined();
  });

  it('ja_permanente (arquivo já estava no Storage) também entrega a URL nova', async () => {
    const cdn = cdnOf('ja-permanente');
    seedMediaCache(cdn, '22222222-2222-2222-2222-222222222222');
    mocks.invoke.mockResolvedValue({ data: { status: 'ja_permanente', media_url: LOCATOR }, error: null });

    const { result } = renderHook(() => useResolvedStorageUrl(cdn));
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.url).toBe(SIGNED);
    expect(cachedItem()?.url).toBe(LOCATOR);
  });

  it('URL externa sem par (url → mensagem) no cache não chama a Edge', async () => {
    const externa = 'https://cdn.example.com/sem-par.webm';
    const { result } = renderHook(() => useResolvedStorageUrl(externa));

    let refreshed: string | null = null;
    await act(async () => {
      refreshed = await result.current.refresh();
    });

    expect(refreshed).toBe(externa);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ url: externa, error: null });
  });

  it('falha da Edge não vira laço: teto de tentativas e estado indisponível', async () => {
    const cdn = cdnOf('sem-recuperacao');
    seedMediaCache(cdn, '33333333-3333-3333-3333-333333333333');
    mocks.invoke.mockResolvedValue({ data: { status: 'indisponivel' }, error: null });

    const { result } = renderHook(() => useResolvedStorageUrl(cdn));
    for (let tentativa = 0; tentativa < MAX_RECOVERY_ATTEMPTS; tentativa += 1) {
      await act(async () => {
        await result.current.refresh();
      });
    }
    expect(mocks.invoke).toHaveBeenCalledTimes(MAX_RECOVERY_ATTEMPTS);

    await act(async () => {
      await result.current.refresh();
    });
    expect(mocks.invoke).toHaveBeenCalledTimes(MAX_RECOVERY_ATTEMPTS);
    expect(result.current.url).toBe('');
    expect(result.current.error?.message).toBe('Mídia indisponível');

    // Depois do teto o estado é final: nenhuma chamada nova, nenhum laço.
    await act(async () => {
      await result.current.refresh();
    });
    expect(mocks.invoke).toHaveBeenCalledTimes(MAX_RECOVERY_ATTEMPTS);
  });

  it('erro de rede conta tentativa e também para no teto', async () => {
    const cdn = cdnOf('rede-fora');
    seedMediaCache(cdn, '44444444-4444-4444-4444-444444444444');
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('FunctionsFetchError') });

    const { result } = renderHook(() => useResolvedStorageUrl(cdn));
    for (let tentativa = 0; tentativa <= MAX_RECOVERY_ATTEMPTS; tentativa += 1) {
      await act(async () => {
        await result.current.refresh();
      });
    }

    expect(mocks.invoke).toHaveBeenCalledTimes(MAX_RECOVERY_ATTEMPTS);
    expect(result.current.url).toBe('');
    expect(result.current.error?.message).toBe('Mídia indisponível');
  });

  it('negado é definitivo: uma chamada só e o estado vira indisponível', async () => {
    const cdn = cdnOf('negado');
    seedMediaCache(cdn, '55555555-5555-5555-5555-555555555555');
    mocks.invoke.mockResolvedValue({ data: { status: 'negado' }, error: null });

    const { result } = renderHook(() => useResolvedStorageUrl(cdn));
    await act(async () => {
      await result.current.refresh();
    });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(result.current.url).toBe('');
    expect(result.current.error?.message).toBe('Mídia indisponível');
  });

  it('desmontar aborta a chamada da Edge', async () => {
    const cdn = cdnOf('desmonta');
    seedMediaCache(cdn, '66666666-6666-6666-6666-666666666666');
    mocks.invoke.mockImplementation((_nome: string, opcoes: { signal?: AbortSignal }) =>
      new Promise((_resolver, rejeitar) => {
        opcoes.signal?.addEventListener('abort', () =>
          rejeitar(new DOMException('aborted', 'AbortError')));
      }));

    const { result, unmount } = renderHook(() => useResolvedStorageUrl(cdn));
    let refreshEmVoo!: Promise<string | null>;
    await act(async () => {
      refreshEmVoo = result.current.refresh();
    });

    const signal = (mocks.invoke.mock.calls[0] as [string, { signal: AbortSignal }])[1].signal;
    expect(signal.aborted).toBe(false);

    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      await expect(refreshEmVoo).resolves.toBeNull();
    });
  });

  it('o cache da galeria que já mostra o locator não pede recuperação', async () => {
    const locator = `${ORIGIN}/storage/v1/object/public/whatsapp-media/contato/viva.jpg`;
    seedMediaCache(locator, '77777777-7777-7777-7777-777777777777');
    const { result } = renderHook(() => useResolvedStorageUrl(locator));

    await waitFor(() => expect(result.current.url).toContain('token=novo'));
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('rerender A → B: o refresh recupera B mesmo com o estado parado em A', async () => {
    const externa = 'https://cdn.example.com/sem-par-a.mp4';
    const cdn = cdnOf('rerender-b');
    seedMediaCache(cdn, '88888888-8888-4888-8888-888888888888');
    const { result, rerender } = renderHook(
      ({ src }: { src: string }) => useResolvedStorageUrl(src),
      { initialProps: { src: externa } },
    );
    expect(result.current.url).toBe(externa);

    rerender({ src: cdn });

    let refreshed: string | null = null;
    await act(async () => {
      refreshed = await result.current.refresh();
    });

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(refreshed).toBe(SIGNED);
    expect(result.current).toMatchObject({ url: SIGNED, isLoading: false, error: null });
    expect(cachedItem()?.url).toBe(LOCATOR);
  });

  it('rerender A → B com teto: B termina em url vazia e erro Mídia indisponível', async () => {
    const externa = 'https://cdn.example.com/sem-par-a2.mp4';
    const cdn = cdnOf('rerender-teto');
    seedMediaCache(cdn, '99999999-9999-4999-9999-999999999999');
    mocks.invoke.mockResolvedValue({ data: { status: 'indisponivel' }, error: null });
    const { result, rerender } = renderHook(
      ({ src }: { src: string }) => useResolvedStorageUrl(src),
      { initialProps: { src: externa } },
    );

    rerender({ src: cdn });

    for (let tentativa = 0; tentativa < MAX_RECOVERY_ATTEMPTS; tentativa += 1) {
      await act(async () => {
        await result.current.refresh();
      });
    }
    expect(mocks.invoke).toHaveBeenCalledTimes(MAX_RECOVERY_ATTEMPTS);

    await act(async () => {
      await result.current.refresh();
    });
    expect(mocks.invoke).toHaveBeenCalledTimes(MAX_RECOVERY_ATTEMPTS);
    expect(result.current.url).toBe('');
    expect(result.current.error?.message).toBe('Mídia indisponível');
  });

  it('ok da Edge com assinatura que falha: o locator fica no cache sem nova chamada à Edge', async () => {
    const cdn = cdnOf('assina-falha');
    seedMediaCache(cdn, 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    mocks.invoke.mockResolvedValue({ data: { status: 'ok', media_url: LOCATOR }, error: null });
    mocks.createSignedUrl.mockResolvedValue({ data: null, error: new Error('sign failed') });

    const { result } = renderHook(() => useResolvedStorageUrl(cdn));
    let refreshed: string | null = 'pendente';
    await act(async () => {
      refreshed = await result.current.refresh();
    });

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(refreshed).toBeNull();
    expect(result.current.url).toBe('');
    expect(result.current.error?.message).toBe('Mídia indisponível');
    // O locator permanente que a Edge gravou não se perdeu com a falha só da assinatura.
    expect(cachedItem()?.url).toBe(LOCATOR);
  });
});
