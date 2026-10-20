import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { canPreviewEmailAttachment } from '@/lib/emailAttachmentPreview';
import { EmailAttachmentPreviewDialog } from '../EmailAttachmentPreviewDialog';
import type { EmailAttachment } from '@/hooks/integrations/useGmail';

describe('canPreviewEmailAttachment', () => {
  it.each(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain', 'application/pdf'])(
    'permite somente tipo passivo conhecido: %s',
    mimeType => expect(canPreviewEmailAttachment(mimeType)).toBe(true),
  );

  it.each(['text/html', 'image/svg+xml', 'application/javascript', 'application/octet-stream', '', null, undefined])(
    'nega tipo ativo ou desconhecido: %s',
    mimeType => expect(canPreviewEmailAttachment(mimeType)).toBe(false),
  );

  it('revoga cada object URL ao trocar repetidamente a prévia e ao desmontar', () => {
    const createObjectURL = vi.fn().mockReturnValueOnce('blob:preview-1').mockReturnValueOnce('blob:preview-2');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const attachment = (id: string): EmailAttachment => ({
      id, email_message_id: 'message-1', gmail_attachment_id: `gmail-${id}`,
      filename: `${id}.png`, mime_type: 'image/png', size_bytes: 3,
    });

    const view = render(<EmailAttachmentPreviewDialog open onOpenChange={vi.fn()} attachment={attachment('one')} contentBase64="AQID" />);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    view.rerender(<EmailAttachmentPreviewDialog open onOpenChange={vi.fn()} attachment={attachment('two')} contentBase64="BAUGBw==" />);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-2');
  });
});
