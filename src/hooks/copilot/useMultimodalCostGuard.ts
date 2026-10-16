import { useMemo } from 'react';

export interface UseMultimodalCostGuardOptions {
  /** True when a key sales moment was detected */
  isKeyMoment: boolean;
  /** True when the vendor explicitly requested analysis */
  vendorRequested: boolean;
  /** Monthly cost already spent in USD — guard blocks if over limit */
  monthlySpentUsd?: number;
  /** Monthly cap in USD; undefined = no cap */
  monthlyCapUsd?: number;
}

export interface MultimodalCostGuardResult {
  allowed: boolean;
  reason: string;
}

/**
 * CV-109 — Limites de custo multimodal.
 * Images and audio are only analyzed on key moments or explicit vendor request.
 * Prevents runaway costs from analyzing every attachment in every conversation.
 */
export function useMultimodalCostGuard(options: UseMultimodalCostGuardOptions): MultimodalCostGuardResult {
  const { isKeyMoment, vendorRequested, monthlySpentUsd, monthlyCapUsd } = options;

  return useMemo(() => {
    if (monthlyCapUsd !== undefined && monthlySpentUsd !== undefined && monthlySpentUsd >= monthlyCapUsd) {
      return { allowed: false, reason: 'Limite mensal de análise de mídia atingido' };
    }
    if (vendorRequested) return { allowed: true, reason: 'Solicitado pelo vendedor' };
    if (isKeyMoment) return { allowed: true, reason: 'Momento-chave detectado' };
    return { allowed: false, reason: 'Análise de mídia reservada para momentos-chave' };
  }, [isKeyMoment, vendorRequested, monthlySpentUsd, monthlyCapUsd]);
}
