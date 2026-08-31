import { describe, expect, it } from 'vitest';
import { parseSupabaseStorageObjectUrl } from '@/lib/storage_object_reference';

const ORIGIN = 'https://tnnnlkbymytvtqngbbqh.supabase.co';

describe('parseSupabaseStorageObjectUrl', () => {
  it.each(['sign', 'public', 'authenticated'])(
    'parses %s object URLs without retaining query credentials',
    (accessType) => {
      const result = parseSupabaseStorageObjectUrl(
        `${ORIGIN}/storage/v1/object/${accessType}/audio-messages/contact-1/audio%20file.webm?token=expired`,
        ['audio-messages'],
        [ORIGIN]
      );

      expect(result).toEqual({
        bucket: 'audio-messages',
        path: 'contact-1/audio file.webm',
      });
    }
  );

  it('rejects a valid-looking locator from another origin', () => {
    expect(parseSupabaseStorageObjectUrl(
      'https://attacker.example/storage/v1/object/public/audio-messages/contact/audio.webm',
      ['audio-messages'],
      [ORIGIN]
    )).toBeNull();
  });

  it('rejects buckets outside the explicit allowlist', () => {
    expect(parseSupabaseStorageObjectUrl(
      `${ORIGIN}/storage/v1/object/public/private-documents/contact/file.pdf`,
      ['audio-messages'],
      [ORIGIN]
    )).toBeNull();
  });

  it.each([
    `${ORIGIN}/storage/v1/object/public/audio-messages/contact/../secret.webm`,
    `${ORIGIN}/storage/v1/object/public/audio-messages/contact%5Csecret.webm`,
    `${ORIGIN}/storage/v1/object/public/audio-messages/`,
    'not-a-url',
  ])('rejects malformed or unsafe object paths: %s', (value) => {
    expect(parseSupabaseStorageObjectUrl(value, ['audio-messages'], [ORIGIN])).toBeNull();
  });
});
