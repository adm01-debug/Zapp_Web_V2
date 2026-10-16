/**
 * CV-090 — Detecta anexos de imagem e sugere mockup de brinde.
 *
 * CV-090: quando o cliente envia JPEG/PNG/SVG no chat, open a sugestão
 *   para criar um mockup do brinde com a logo dele.
 */
import { useState, useCallback } from 'react';

export type MessageAttachmentType = 'image/jpeg' | 'image/jpg' | 'image/png' | 'image/svg+xml';

export interface IncomingAttachment {
  id: string;
  name: string;
  mimeType: string;
  url?: string;
}

export interface UseMockupTriggerOptions {
  attachments?: IncomingAttachment[];
}

const IMAGE_MIME_TYPES: MessageAttachmentType[] = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/svg+xml',
];

export function useMockupTrigger(options: UseMockupTriggerOptions = {}) {
  const { attachments = [] } = options;
  const [dismissed, setDismissed] = useState(false);

  const logoAttachment =
    attachments.find((a) =>
      IMAGE_MIME_TYPES.includes(a.mimeType as MessageAttachmentType),
    ) ?? null;

  const shouldSuggestMockup = logoAttachment !== null && !dismissed;

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const reset = useCallback(() => {
    setDismissed(false);
  }, []);

  return { shouldSuggestMockup, logoAttachment, dismiss, reset };
}
