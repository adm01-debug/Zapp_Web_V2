import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePrivateBucketUrl } from '../../supabase/functions/_shared/evolution-api-proxy.ts';

const ORIGIN = 'https://tnnnlkbymytvtqngbbqh.supabase.co';

describe('Evolution private storage URL resolution', () => {
  const createSignedUrl = vi.fn();
  const from = vi.fn(() => ({ createSignedUrl }));
  const supabase = { storage: { from } };

  beforeEach(() => {
    vi.clearAllMocks();
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: `${ORIGIN}/storage/v1/object/sign/audio-messages/fresh.webm?token=fresh` },
      error: null,
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['public', 'sign', 'authenticated'])(
    're-signs %s URLs before delivery to Evolution',
    async (accessType) => {
      const input = `${ORIGIN}/storage/v1/object/${accessType}/audio-messages/contact/audio.webm?token=expired`;

      const result = await resolvePrivateBucketUrl(
        supabase,
        input,
        ['audio-messages'],
        ORIGIN
      );

      expect(from).toHaveBeenCalledWith('audio-messages');
      expect(createSignedUrl).toHaveBeenCalledWith('contact/audio.webm', 300);
      expect(result).toContain('token=fresh');
    }
  );

  it('does not use the service-role signer for an untrusted origin', async () => {
    const input = 'https://attacker.example/storage/v1/object/public/audio-messages/contact/audio.webm';

    await expect(resolvePrivateBucketUrl(
      supabase,
      input,
      ['audio-messages'],
      ORIGIN
    )).resolves.toBe(input);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('does not sign objects outside the bucket allowlist', async () => {
    const input = `${ORIGIN}/storage/v1/object/public/private-documents/contact/file.pdf`;

    await expect(resolvePrivateBucketUrl(
      supabase,
      input,
      ['audio-messages'],
      ORIGIN
    )).resolves.toBe(input);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects traversal before URL normalization can collapse the path', async () => {
    const input = `${ORIGIN}/storage/v1/object/public/audio-messages/contact/../secret.webm`;

    await expect(resolvePrivateBucketUrl(
      supabase,
      input,
      ['audio-messages'],
      ORIGIN
    )).resolves.toBe(input);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('fails closed when Supabase cannot create a delivery URL', async () => {
    createSignedUrl.mockResolvedValueOnce({ data: null, error: new Error('signing failed') });
    const input = `${ORIGIN}/storage/v1/object/public/audio-messages/contact/audio.webm`;

    await expect(resolvePrivateBucketUrl(
      supabase,
      input,
      ['audio-messages'],
      ORIGIN
    )).rejects.toThrow('signing failed');
  });
});
