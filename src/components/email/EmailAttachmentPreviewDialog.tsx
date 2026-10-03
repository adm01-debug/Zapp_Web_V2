import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { EmailAttachment } from '@/hooks/integrations/useGmail';
import { isSafeEmailAttachmentImage } from '@/lib/emailAttachmentPreview';

function decodeBase64(content: string): Uint8Array {
  const binary = atob(content);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

interface EmailAttachmentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attachment: EmailAttachment | null;
  contentBase64: string | null;
}

interface BinaryAttachmentPreviewProps {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}

function BinaryAttachmentPreview({ bytes, filename, mimeType }: BinaryAttachmentPreviewProps) {
  const [objectUrl] = useState(() => {
    const copy = new Uint8Array(bytes);
    return URL.createObjectURL(new Blob([copy.buffer], { type: mimeType }));
  });

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  if (isSafeEmailAttachmentImage(mimeType)) {
    return <img src={objectUrl} alt={filename || 'Imagem anexada'} className="max-h-[65vh] max-w-full object-contain" />;
  }

  return <iframe title={`Prévia de ${filename || 'PDF'}`} src={objectUrl} sandbox="" className="h-[65vh] w-full border-0" />;
}

export function EmailAttachmentPreviewDialog({ open, onOpenChange, attachment, contentBase64 }: EmailAttachmentPreviewDialogProps) {
  const mimeType = attachment?.mime_type?.toLowerCase() || 'application/octet-stream';
  const bytes = useMemo(() => contentBase64 ? decodeBase64(contentBase64) : null, [contentBase64]);
  const text = useMemo(() => mimeType === 'text/plain' && bytes ? new TextDecoder('utf-8', { fatal: false }).decode(bytes) : '', [bytes, mimeType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-border bg-popover text-popover-foreground">
        <DialogHeader>
          <DialogTitle className="truncate">{attachment?.filename || 'Prévia do anexo'}</DialogTitle>
          <DialogDescription className="text-muted-foreground">Prévia local criada a partir do conteúdo autenticado. HTML e SVG nunca são executados.</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-64 max-h-[70vh] items-center justify-center overflow-auto rounded-xl border border-border bg-background p-3">
          {mimeType === 'text/plain' ? (
            <pre className="h-full w-full whitespace-pre-wrap break-words text-sm text-foreground">{text}</pre>
          ) : bytes && (isSafeEmailAttachmentImage(mimeType) || mimeType === 'application/pdf') ? (
            <BinaryAttachmentPreview key={`${attachment?.id || attachment?.filename || 'attachment'}:${contentBase64?.length || 0}`} bytes={bytes} filename={attachment?.filename || ''} mimeType={mimeType} />
          ) : (
            <p className="text-sm text-muted-foreground">Este tipo de arquivo não possui prévia segura. Use o download para inspecioná-lo em um aplicativo confiável.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
