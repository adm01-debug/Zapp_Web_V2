const SAFE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function isSafeEmailAttachmentImage(mimeType: string | null | undefined): boolean {
  return SAFE_IMAGE_TYPES.has((mimeType || '').toLowerCase());
}

export function canPreviewEmailAttachment(mimeType: string | null | undefined): boolean {
  const normalized = (mimeType || '').toLowerCase();
  return isSafeEmailAttachmentImage(normalized) || normalized === 'text/plain' || normalized === 'application/pdf';
}
