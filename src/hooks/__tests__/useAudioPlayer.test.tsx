import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  from: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://tnnnlkbymytvtqngbbqh.supabase.co',
  supabase: {
    storage: { from: storageMocks.from },
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useAudioPlayer } from '@/hooks/communication/useAudioPlayer';

const ORIGIN = 'https://tnnnlkbymytvtqngbbqh.supabase.co';

describe('useAudioPlayer private URL renewal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.from.mockReturnValue({ createSignedUrl: storageMocks.createSignedUrl });
    storageMocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: `${ORIGIN}/storage/v1/object/sign/audio-messages/fresh.webm?token=fresh` },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not expose an expired signed URL before replacing it', async () => {
    let finishSigning: (value: unknown) => void = () => undefined;
    storageMocks.createSignedUrl.mockReturnValueOnce(new Promise((resolve) => {
      finishSigning = resolve;
    }));
    const expiredUrl = `${ORIGIN}/storage/v1/object/sign/audio-messages/contact-1/audio.webm?token=expired`;

    const { result } = renderHook(() => useAudioPlayer({ audioUrl: expiredUrl, messageId: 'message-1' }));

    expect(result.current.resolvedUrl).toBe('');
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      finishSigning({ data: { signedUrl: 'https://signed.example/fresh.webm' }, error: null });
    });

    await waitFor(() => expect(result.current.resolvedUrl).toBe('https://signed.example/fresh.webm'));
    expect(storageMocks.from).toHaveBeenCalledWith('audio-messages');
    expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('contact-1/audio.webm', 3600);
  });

  it('signs the stable public URL-shaped locator used for new private audio', async () => {
    const stableLocator = `${ORIGIN}/storage/v1/object/public/audio-messages/contact-2/new.webm`;
    const { result } = renderHook(() =>
      useAudioPlayer({ audioUrl: stableLocator, messageId: 'message-2' })
    );

    await waitFor(() => expect(result.current.resolvedUrl).toContain('token=fresh'));
    expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('contact-2/new.webm', 3600);
  });

  it('never falls back to the expired credential when signing fails', async () => {
    storageMocks.createSignedUrl.mockResolvedValueOnce({
      data: null,
      error: new Error('signing failed'),
    });
    const expiredUrl = `${ORIGIN}/storage/v1/object/sign/audio-messages/contact-3/old.webm?token=expired`;

    const { result } = renderHook(() => useAudioPlayer({ audioUrl: expiredUrl, messageId: 'message-3' }));

    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.resolvedUrl).toBe('');
  });

  it('keeps ordinary external media URLs unchanged without a HEAD request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const externalUrl = 'https://cdn.example/audio.webm';
    const { result } = renderHook(() =>
      useAudioPlayer({ audioUrl: externalUrl, messageId: 'message-4' })
    );

    await waitFor(() => expect(result.current.resolvedUrl).toBe(externalUrl));
    expect(storageMocks.createSignedUrl).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('renews a signed URL before playing after the safety window', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const stableLocator = `${ORIGIN}/storage/v1/object/public/audio-messages/contact-5/long-open.webm`;
    const { result } = renderHook(() =>
      useAudioPlayer({ audioUrl: stableLocator, messageId: 'message-5' })
    );
    await waitFor(() => expect(result.current.resolvedUrl).toContain('token=fresh'));

    const audio = {
      src: result.current.resolvedUrl,
      load: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
    };
    result.current.audioRef.current = audio as unknown as HTMLAudioElement;
    now.mockReturnValue(1_000_000 + 51 * 60 * 1000);

    await act(async () => {
      await result.current.togglePlay();
    });

    expect(storageMocks.createSignedUrl).toHaveBeenCalledTimes(2);
    expect(audio.load).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });
});
