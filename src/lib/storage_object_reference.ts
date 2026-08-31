export interface StorageObjectReference {
  bucket: string;
  path: string;
}

export const PRIVATE_MEDIA_BUCKETS = [
  'audio-messages',
  'team-chat-files',
  'whatsapp-media',
] as const;

const STORAGE_OBJECT_PATH_PREFIXES = [
  '/storage/v1/object/sign/',
  '/storage/v1/object/public/',
  '/storage/v1/object/authenticated/',
] as const;

function isSafeStoragePath(path: string): boolean {
  if (!path || path.includes('\\') || path.includes('\0')) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function hasUnsafeRawPathSegment(value: string): boolean {
  const pathWithoutQuery = value.split(/[?#]/, 1)[0];
  return pathWithoutQuery.split('/').some((rawSegment) => {
    let decodedSegment = rawSegment;
    try {
      // Decode twice to reject nested encodings such as %252e%252e before
      // URL normalisation can collapse them into a different object path.
      decodedSegment = decodeURIComponent(decodeURIComponent(rawSegment));
    } catch {
      return true;
    }
    return decodedSegment === '.' || decodedSegment === '..' ||
      decodedSegment.includes('\\') || decodedSegment.includes('\0');
  });
}

/**
 * Extracts a bucket and object path from Supabase Storage URLs.
 *
 * Both expiring signed URLs and stable public URL-shaped locators are accepted.
 * The latter can safely identify an object in a private bucket: access is still
 * granted only after the authenticated client creates a fresh signed URL.
 */
export function parseSupabaseStorageObjectUrl(
  value: string,
  allowedBuckets: readonly string[] = [],
  allowedOrigins: readonly string[] = []
): StorageObjectReference | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  if (hasUnsafeRawPathSegment(value)) return null;

  try {
    const parsedUrl = new URL(value);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') return null;
    if (allowedOrigins.length > 0 && !allowedOrigins.includes(parsedUrl.origin)) return null;

    const prefix = STORAGE_OBJECT_PATH_PREFIXES.find((candidate) =>
      parsedUrl.pathname.startsWith(candidate)
    );
    if (!prefix) return null;

    const encodedLocation = parsedUrl.pathname.slice(prefix.length);
    const separatorIndex = encodedLocation.indexOf('/');
    if (separatorIndex <= 0 || separatorIndex === encodedLocation.length - 1) return null;

    const bucket = decodeURIComponent(encodedLocation.slice(0, separatorIndex));
    const path = decodeURIComponent(encodedLocation.slice(separatorIndex + 1));

    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(bucket) || !isSafeStoragePath(path)) return null;
    if (allowedBuckets.length > 0 && !allowedBuckets.includes(bucket)) return null;

    return { bucket, path };
  } catch {
    return null;
  }
}

/**
 * Converts an expiring Supabase Storage URL into a durable object locator.
 *
 * The `/public/` route is intentionally used only as a URL-shaped identifier;
 * it does not make a private bucket public. Consumers must still exchange this
 * locator for a fresh signed URL before loading the object.
 */
export function toSupabaseStorageObjectLocator(
  value: string,
  allowedBuckets: readonly string[] = [],
  allowedOrigins: readonly string[] = []
): string | null {
  const reference = parseSupabaseStorageObjectUrl(value, allowedBuckets, allowedOrigins);
  if (!reference) return null;

  try {
    const origin = new URL(value).origin;
    const bucket = encodeURIComponent(reference.bucket);
    const path = reference.path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${origin}/storage/v1/object/public/${bucket}/${path}`;
  } catch {
    return null;
  }
}
