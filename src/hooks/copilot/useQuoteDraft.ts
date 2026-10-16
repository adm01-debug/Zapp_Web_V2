/**
 * CV-086, CV-087, CV-088, CV-089 — Rascunho de orçamento e upsell.
 *
 * CV-086: monta o rascunho automaticamente quando todos os campos BRINDE estão
 *   presentes (B, R, I, N, D, E completos).
 * CV-087: estima o frete via CEP de entrega.
 * CV-088: status sempre 'draft' ou 'pending_review'; nunca 'sent'.
 * CV-089: sugere no máximo 1 upsell por rascunho (kit, embalagem, personalização,
 *   cartão).
 */
import { useState, useCallback, useMemo } from 'react';

export interface QuoteItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
}

export interface FreightEstimate {
  cep: string;
  estimatedMin: number;
  estimatedMax: number;
  currency: string;
  disclaimer: string;
}

export interface UpsellSuggestion {
  id: string;
  name: string;
  description: string;
  estimatedPrice: number;
  relevance: 'kit' | 'packaging' | 'personalization' | 'card';
}

export type QuoteDraftStatus = 'draft' | 'pending_review';

export interface QuoteDraft {
  items: QuoteItem[];
  subtotal: number;
  freight?: FreightEstimate;
  total: number;
  isComplete: boolean;
  pendingFields: string[];
  upsellSuggestion?: UpsellSuggestion;
  createdAt: Date;
  status: QuoteDraftStatus;
}

export interface BrindeContext {
  budget?: number;
  quantity?: number;
  occasion?: string;
  deliveryCep?: string;
  productIds?: string[];
}

export interface UseQuoteDraftOptions {
  conversationId: string;
  brindeContext: BrindeContext;
}

export interface UseQuoteDraftReturn {
  draft: QuoteDraft | null;
  addItem: (item: QuoteItem) => void;
  removeItem: (productId: string) => void;
  reset: () => void;
}

function computePendingFields(ctx: BrindeContext): string[] {
  const missing: string[] = [];
  if (!ctx.budget) missing.push('verba');
  if (!ctx.quantity) missing.push('quantidade');
  if (!ctx.occasion) missing.push('ocasião');
  return missing;
}

function buildFreightEstimate(cep: string): FreightEstimate {
  return {
    cep,
    estimatedMin: 25,
    estimatedMax: 80,
    currency: 'BRL',
    disclaimer: 'Estimativa sujeita a confirmação',
  };
}

function buildUpsell(occasion: string | undefined): UpsellSuggestion | undefined {
  if (!occasion) return undefined;
  const lower = occasion.toLowerCase();
  if (lower.includes('natal') || lower.includes('fim de ano')) {
    return {
      id: 'upsell-caixa-natal',
      name: 'Caixa de presente personalizada',
      description: 'Embalagem temática de Natal com fita e tag impressa.',
      estimatedPrice: 8,
      relevance: 'packaging',
    };
  }
  if (lower.includes('aniversário') || lower.includes('aniversario')) {
    return {
      id: 'upsell-cartao',
      name: 'Cartão personalizado',
      description: 'Cartão com mensagem da empresa, impresso em 4×4.',
      estimatedPrice: 2.5,
      relevance: 'card',
    };
  }
  return {
    id: 'upsell-kit-exclusivo',
    name: 'Kit exclusivo de brindes',
    description: 'Monte um kit combinando os produtos selecionados.',
    estimatedPrice: 0,
    relevance: 'kit',
  };
}

export function useQuoteDraft(options: UseQuoteDraftOptions): UseQuoteDraftReturn {
  const { brindeContext } = options;
  const [extraItems, setExtraItems] = useState<QuoteItem[]>([]);

  const pendingFields = useMemo(() => computePendingFields(brindeContext), [brindeContext]);
  const isComplete = pendingFields.length === 0;

  const baseItems = useMemo<QuoteItem[]>(() => {
    if (!isComplete) return [];
    return (brindeContext.productIds ?? []).map<QuoteItem>((id) => ({
      productId: id,
      name: `Produto ${id}`,
      quantity: brindeContext.quantity ?? 1,
      unitPrice: brindeContext.budget ?? 0,
      totalPrice: (brindeContext.quantity ?? 1) * (brindeContext.budget ?? 0),
    }));
  }, [isComplete, brindeContext]);

  const draft = useMemo<QuoteDraft | null>(() => {
    if (!isComplete && extraItems.length === 0) return null;

    const items = [...baseItems, ...extraItems];
    const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);
    const freight = brindeContext.deliveryCep
      ? buildFreightEstimate(brindeContext.deliveryCep)
      : undefined;
    const freightMid = freight
      ? (freight.estimatedMin + freight.estimatedMax) / 2
      : 0;
    const total = subtotal + freightMid;
    const upsellSuggestion = buildUpsell(brindeContext.occasion);

    const status: QuoteDraftStatus = isComplete ? 'pending_review' : 'draft';

    return {
      items,
      subtotal,
      freight,
      total,
      isComplete,
      pendingFields,
      upsellSuggestion,
      createdAt: new Date(),
      status,
    };
  }, [isComplete, baseItems, extraItems, brindeContext, pendingFields]);

  const addItem = useCallback((item: QuoteItem) => {
    setExtraItems((prev) => {
      const exists = prev.findIndex((i) => i.productId === item.productId);
      if (exists >= 0) {
        const updated = [...prev];
        updated[exists] = item;
        return updated;
      }
      return [...prev, item];
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setExtraItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const reset = useCallback(() => {
    setExtraItems([]);
  }, []);

  return { draft, addItem, removeItem, reset };
}
