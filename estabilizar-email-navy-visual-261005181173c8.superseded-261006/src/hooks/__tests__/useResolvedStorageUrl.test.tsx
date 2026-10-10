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
});
