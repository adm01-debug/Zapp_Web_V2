/**
 * CV-116 — Autorização de vendedor para ações sensíveis.
 *
 * Verifica se o vendedor tem permissão para executar ações específicas de alto
 * impacto (conceder desconto acima do limite, aprovar condições especiais,
 * acessar histórico de preços) com base no seu nível de autorização configurado.
 */
import { useMemo } from 'react';

export type VendorLevel = 'junior' | 'pleno' | 'senior' | 'supervisor';
export type SensitiveAction =
  | 'discount_above_10'
  | 'discount_above_20'
  | 'payment_extension'
  | 'price_history_view'
  | 'bulk_negotiation'
  | 'competitor_price_match'
  | 'free_mockup';

export interface AuthorizationResult {
  allowed: boolean;
  reason: string;
  /** Se falso, sugere escalar ao supervisor. */
  escalationRequired: boolean;
}

const PERMISSIONS: Record<SensitiveAction, VendorLevel[]> = {
  discount_above_10: ['pleno', 'senior', 'supervisor'],
  discount_above_20: ['senior', 'supervisor'],
  payment_extension: ['pleno', 'senior', 'supervisor'],
  price_history_view: ['pleno', 'senior', 'supervisor'],
  bulk_negotiation: ['senior', 'supervisor'],
  competitor_price_match: ['supervisor'],
  free_mockup: ['pleno', 'senior', 'supervisor'],
};

const ACTION_LABELS: Record<SensitiveAction, string> = {
  discount_above_10: 'desconto acima de 10%',
  discount_above_20: 'desconto acima de 20%',
  payment_extension: 'extensão de prazo de pagamento',
  price_history_view: 'histórico de preços do cliente',
  bulk_negotiation: 'negociação de grande volume',
  competitor_price_match: 'igualar preço de concorrente',
  free_mockup: 'mockup gratuito',
};

const LEVEL_ORDER: VendorLevel[] = ['junior', 'pleno', 'senior', 'supervisor'];

export interface UseVendorAuthorizationOptions {
  vendorLevel: VendorLevel;
  action: SensitiveAction;
}

export function useVendorAuthorization({
  vendorLevel,
  action,
}: UseVendorAuthorizationOptions): AuthorizationResult {
  return useMemo(() => {
    const allowed = PERMISSIONS[action]?.includes(vendorLevel) ?? false;
    const minLevel = PERMISSIONS[action]?.[0] ?? 'supervisor';
    const minLevelIndex = LEVEL_ORDER.indexOf(minLevel);
    const vendorIndex = LEVEL_ORDER.indexOf(vendorLevel);

    if (allowed) {
      return {
        allowed: true,
        reason: `Nível "${vendorLevel}" autorizado para ${ACTION_LABELS[action]}.`,
        escalationRequired: false,
      };
    }

    const needsEscalation = minLevelIndex > vendorIndex;
    return {
      allowed: false,
      reason: `Nível "${vendorLevel}" não autorizado para ${ACTION_LABELS[action]}. Mínimo: "${minLevel}".`,
      escalationRequired: needsEscalation,
    };
  }, [vendorLevel, action]);
}
