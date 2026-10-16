/**
 * CV-090 — Detecção de upload de logo e sugestão de mockup.
 *
 * Detecta anexos de imagem (JPEG/PNG/SVG) que podem ser logos enviados pelo
 * cliente e aciona a sugestão: "Quer ver como fica com o logo de vocês?"
 */
import { useState, useEffect, useCallback } from 'react';

export type MessageAttachmentType = 'image' | 'document' | 'audio' | 'video';

export interface IncomingAttachment {
  id: string;
  type: MessageAttachmentType;
  mimeType: string;
  filename?: string;
}

export interface UseMockupTriggerOptions {
  latestAttachments?: IncomingAttachment[];
  onLogoDetected?: (attachment: IncomingAttachment) => void;
}

export interface UseMockupTriggerReturn {
  shouldSuggestMockup: boolean;
  logoAttachment: IncomingAttachment | null;
  dismiss: () => void;
}

const LOGO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/svg+xml',
]);

function isLogoCandidate(attachment: IncomingAttachment): boolean {
  if (attachment.type !== 'image') return false;
  if (!LOGO_MIME_TYPES.has(attachment.mimeType.toLowerCase())) return false;
  return true;
}

export function useMockupTrigger(
  options: UseMockupTriggerOptions = {},
): UseMockupTriggerReturn {
  const { latestAttachments = [], onLogoDetected } = options;
  const [dismissed, setDismissed] = useState(false);
  const [logoAttachment, setLogoAttachment] = useState<IncomingAttachment | null>(null);

  useEffect(() => {
    const logo = latestAttachments.find(isLogoCandidate) ?? null;
    if (logo && logo.id !== logoAttachment?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(false);
      setLogoAttachment(logo);
      onLogoDetected?.(logo);
    } else if (!logo) {
      setLogoAttachment(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestAttachments]);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const shouldSuggestMockup = logoAttachment !== null && !dismissed;

  return { shouldSuggestMockup, logoAttachment, dismiss };
}
