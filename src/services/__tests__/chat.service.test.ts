import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));
const databaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: databaseMocks.from,
    storage: { from: storageMocks.from },
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn() }),
}));

import { ChatService } from '@/services/chat.service';

describe('ChatService.fetchMessages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pagina do mais recente no banco e devolve ordem cronologica para a UI', async () => {
    const range = vi.fn().mockResolvedValue({
      data: [
        { id: 'new', created_at: '2026-09-09T12:00:00Z' },
        { id: 'old', created_at: '2026-09-09T11:00:00Z' },
      ],
      error: null,
    });
    const orderById = vi.fn().mockReturnValue({ range });
    const order = vi.fn().mockReturnValue({ order: orderById });
    databaseMocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ order }),
      }),
    });

    const result = await ChatService.fetchMessages('contact-1', 0, 2);

    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(orderById).toHaveBeenCalledWith('id', { ascending: false });
    expect(range).toHaveBeenCalledWith(0, 1);
    expect(result.data?.map((row) => row.id)).toEqual(['old', 'new']);
  });

  it('usa cursor composto para carregar mensagens anteriores sem gap por realtime', async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        { id: 'b', created_at: '2026-09-09T10:00:00Z' },
        { id: 'a', created_at: '2026-09-09T10:00:00Z' },
      ],
      error: null,
    });
    const secondOrder = vi.fn().mockReturnValue({ limit });
    const firstOrder = vi.fn().mockReturnValue({ order: secondOrder });
    const or = vi.fn().mockReturnValue({ order: firstOrder });
    databaseMocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ or }),
      }),
    });

    const result = await ChatService.fetchMessagesBefore(
      'contact-1',
      { createdAt: '2026-09-09T11:00:00Z', id: 'c' },
      2,
    );

    expect(or).toHaveBeenCalledWith(
      'created_at.lt.2026-09-09T11:00:00Z,and(created_at.eq.2026-09-09T11:00:00Z,id.lt.c)',
    );
    expect(firstOrder).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(secondOrder).toHaveBeenCalledWith('id', { ascending: false });
    expect(result.data?.map((row) => row.id)).toEqual(['a', 'b']);
  });
});

describe('ChatService.uploadAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.from.mockReturnValue({
      upload: storageMocks.upload,
      getPublicUrl: storageMocks.getPublicUrl,
    });
    storageMocks.upload.mockResolvedValue({ data: { path: 'contact/audio.webm' }, error: null });
    storageMocks.getPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://project.supabase.co/storage/v1/object/public/audio-messages/contact/audio.webm' },
    });
    vi.spyOn(Date, 'now').mockReturnValue(1234567890);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a durable object locator instead of an expiring signed URL', async () => {
    const blob = new Blob(['audio'], { type: 'audio/webm' });

    const result = await ChatService.uploadAudio('contact-1', blob);

    expect(storageMocks.upload).toHaveBeenCalledWith(
      'contact-1/1234567890.webm',
      blob,
      { contentType: 'audio/webm' }
    );
    expect(storageMocks.getPublicUrl).toHaveBeenCalledWith('contact-1/1234567890.webm');
    expect(result).toContain('/storage/v1/object/public/audio-messages/');
    expect(result).not.toContain('token=');
  });

  it('does not create a locator when upload fails', async () => {
    storageMocks.upload.mockResolvedValueOnce({ data: null, error: new Error('upload failed') });

    await expect(ChatService.uploadAudio('contact-1', new Blob())).rejects.toThrow('upload failed');
    expect(storageMocks.getPublicUrl).not.toHaveBeenCalled();
  });
});
