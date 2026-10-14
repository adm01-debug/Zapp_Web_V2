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

const UUID_PATH = /^contact-1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webm$/;

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a durable object locator instead of an expiring signed URL', async () => {
    const blob = new Blob(['audio'], { type: 'audio/webm' });

    const result = await ChatService.uploadAudio('contact-1', blob);

    // Robustez item 6: o nome do objeto deixou de ser `Date.now()` (dois envios no
    // mesmo milissegundo gravavam no MESMO caminho) e passou a levar identificador
    // por objeto. O caminho enviado e o registrado no locator precisam ser o mesmo.
    const [uploadedPath, uploadedBlob, options] = storageMocks.upload.mock.calls[0];
    expect(uploadedPath).toMatch(UUID_PATH);
    expect(uploadedBlob).toBe(blob);
    expect(options).toEqual({ contentType: 'audio/webm' });
    expect(storageMocks.getPublicUrl).toHaveBeenCalledWith(uploadedPath);
    expect(result).toContain('/storage/v1/object/public/audio-messages/');
    expect(result).not.toContain('token=');
  });

  it('grava em caminhos distintos em envios no mesmo instante', async () => {
    await ChatService.uploadAudio('contact-1', new Blob(['a']));
    await ChatService.uploadAudio('contact-1', new Blob(['b']));

    const [firstPath] = storageMocks.upload.mock.calls[0];
    const [secondPath] = storageMocks.upload.mock.calls[1];
    expect(firstPath).toMatch(UUID_PATH);
    expect(secondPath).toMatch(UUID_PATH);
    expect(firstPath).not.toBe(secondPath);
  });

  it('does not create a locator when upload fails', async () => {
    storageMocks.upload.mockResolvedValueOnce({ data: null, error: new Error('upload failed') });

    await expect(ChatService.uploadAudio('contact-1', new Blob())).rejects.toThrow('upload failed');
    expect(storageMocks.getPublicUrl).not.toHaveBeenCalled();
  });
});
