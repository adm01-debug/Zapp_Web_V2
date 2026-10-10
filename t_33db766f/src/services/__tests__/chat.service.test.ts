import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

const queryBuilderMocks = vi.hoisted(() => ({
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  limit: vi.fn(),
  or: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: storageMocks.from },
    from: () => queryBuilderMocks,
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn() }),
}));

import { ChatService } from '@/services/chat.service';

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

describe('ChatService.fetchMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryBuilderMocks.select.mockReturnValue(queryBuilderMocks);
    queryBuilderMocks.eq.mockReturnValue(queryBuilderMocks);
    queryBuilderMocks.order.mockReturnValue(queryBuilderMocks);
    queryBuilderMocks.range.mockReturnValue(queryBuilderMocks);
    queryBuilderMocks.limit.mockReturnValue(queryBuilderMocks);
    queryBuilderMocks.or.mockReturnValue(queryBuilderMocks);
    queryBuilderMocks.maybeSingle.mockReturnValue(queryBuilderMocks);
    queryBuilderMocks.select.mockResolvedValue({
      data: [],
      error: null,
      count: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects only used columns instead of *', async () => {
    await ChatService.fetchMessages('contact-1', 0, 1000);

    const selectCall = queryBuilderMocks.select.mock.calls[0][0];
    expect(selectCall).not.toBe('*');
    expect(typeof selectCall).toBe('string');
    expect(selectCall.split(',')).toContain('id');
    expect(selectCall.split(',')).toContain('contact_id');
    expect(selectCall.split(',')).toContain('content');
    expect(selectCall.split(',')).toContain('sender');
    expect(selectCall.split(',')).toContain('created_at');
    expect(selectCall.split(',')).toContain('message_type');
    expect(selectCall.split(',')).toContain('media_url');
    expect(selectCall.split(',')).toContain('is_edited');
    expect(selectCall.split(',')).toContain('is_deleted');
    expect(selectCall.split(',')).toContain('external_id');
  });

  it('fetchMessagesBefore also selects only used columns instead of *', async () => {
    await ChatService.fetchMessagesBefore('contact-1', { createdAt: '2026-01-01T00:00:00Z', id: 'msg-1' }, 1000);

    const selectCall = queryBuilderMocks.select.mock.calls[0][0];
    expect(selectCall).not.toBe('*');
    expect(typeof selectCall).toBe('string');
    expect(selectCall.split(',')).toContain('id');
    expect(selectCall.split(',')).toContain('contact_id');
    expect(selectCall.split(',')).toContain('content');
    expect(selectCall.split(',')).toContain('sender');
    expect(selectCall.split(',')).toContain('created_at');
    expect(selectCall.split(',')).toContain('message_type');
    expect(selectCall.split(',')).toContain('media_url');
    expect(selectCall.split(',')).toContain('is_edited');
    expect(selectCall.split(',')).toContain('is_deleted');
    expect(selectCall.split(',')).toContain('external_id');
  });
});