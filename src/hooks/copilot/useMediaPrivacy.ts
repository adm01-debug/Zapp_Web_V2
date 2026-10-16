import { useMemo, useCallback } from 'react';

export interface UseMediaPrivacyOptions {
  /** Flag from ai-feature-flags: 'ai.capability.multimodal_send_to_provider' */
  providerMediaFlagEnabled: boolean;
}

export interface MediaPrivacyResult {
  canSendToProvider: boolean;
  flagEnabled: boolean;
  /** Call this before sending any media to an AI provider */
  check: (mediaType: 'audio' | 'image' | 'document') => { allowed: boolean; reason: string };
}

/**
 * CV-110 — Privacidade de mídia.
 * Media never goes to a provider without the specific feature flag enabled.
 * Nothing is logged (no media in logs — caller responsibility).
 */
export function useMediaPrivacy(options: UseMediaPrivacyOptions): MediaPrivacyResult {
  const { providerMediaFlagEnabled } = options;

  const check = useCallback((mediaType: 'audio' | 'image' | 'document'): { allowed: boolean; reason: string } => {
    if (!providerMediaFlagEnabled) {
      return {
        allowed: false,
        reason: `Envio de ${mediaType} para provedor bloqueado (flag ai.capability.multimodal_send_to_provider desligada)`,
      };
    }
    return { allowed: true, reason: '' };
  }, [providerMediaFlagEnabled]);

  return useMemo(() => ({
    canSendToProvider: providerMediaFlagEnabled,
    flagEnabled: providerMediaFlagEnabled,
    check,
  }), [providerMediaFlagEnabled, check]);
}
