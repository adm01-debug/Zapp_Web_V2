import { describe, expect, it } from 'vitest';
import { canPreviewEmailAttachment } from '@/lib/emailAttachmentPreview';

describe('canPreviewEmailAttachment', () => {
  it.each(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain', 'application/pdf'])(
    'permite somente tipo passivo conhecido: %s',
    mimeType => expect(canPreviewEmailAttachment(mimeType)).toBe(true),
  );

  it.each(['text/html', 'image/svg+xml', 'application/javascript', 'application/octet-stream', '', null, undefined])(
    'nega tipo ativo ou desconhecido: %s',
    mimeType => expect(canPreviewEmailAttachment(mimeType)).toBe(false),
  );
});
