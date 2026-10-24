import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: storageMocks.from },
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
