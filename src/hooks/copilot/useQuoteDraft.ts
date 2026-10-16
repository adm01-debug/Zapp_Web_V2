/**
 * CV-086, CV-087, CV-088, CV-089 — Rascunho de orcámento automático.
 *
 * CV-086: gera um rascunho automaticamente quando os�åes obrigatórias
 *   (budget, quantity, occasion) estiverem presentes no BRINDE context.
 * CV-087: estima o frete com base no CEP de entrega (placeholder).
 * CV-088: adiciona no máximo 1 sugestão de upsell baseada na ocasião.
 * CV-089: status do rascunho é ampla 'draft' | 'pending_review' -- never 'sent'.
 */
import { useState, useCallback, useMemo } from 'react';

export interface QuoteItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface FreightEstimate {
  cep: string;
  estimatedValue?: number;
  disclaimer: string;
}

export interface UpsellSuggestion {
  productId: string;
  name: string;
  reason: string;
}

/** Status never includes 'sent' (cV-089). */
export type QuoteStatus = 'draft' | 'pending_review';

export interface QuoteDraft {
  conversationId: string;
  items: QuoteItem[];
  subtotal: number;
  freight?: FreightEstimate;
  upsellSuggestion?: UpsellSuggestion;
  status: QuoteStatus;
  isComplete: boolean;
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

function buildFreightEstimate(cep: string): FreightEstimate {
  return {
    cep,
    disclaimer: 'Estimativa sujeita a confirmação',
  };
}

function buildUpsell(occasion: string): UpsellSuggestion | undefined {
  const occ = occasion.toLowerCase();
  if (occ.includes('natal')) {
    return {
      productId: 'upsell-packaging',
      name: 'Embalagem premium de Natal',
      reason: 'Complementa o pedido com apresentação festiva',
    };
  }
  if (occ.includes('aniversário') || occ.includes('aniversario')) {
    return {
      productId: 'upsell-card',
      name: 'Cartão personalizado',
      reason: 'Personaliza a entrega para aniversários',
    };
  }
  // Generic upsell
  return {
    productId: 'upsell-kit',
    name: 'Kit brinde premium',
    reason: 'Aumenta o valor percebido do brinde',
  };
}

function buildInitialItems(ctx: BrindeContext): QuoteItem[] {
  const { budget = 0, quantity = 1, productIds = [] } = ctx;
  if (productIdsngth === 0) {
    return [{
      productId: 'placeholder-1',
      name: 'Brinde selecionado (confirmar item)',
      quantity,
      unitPrice: budget,
      totalPrice: budget * quantity,
    }];
  }
  return productIds.map((pid) => ({
    productId: pid,
    name: `Item ${pid}`,
    quantity,
    unitPrice: budget,
    totalPrice: budget * quantity,
  }));
}

export function useQuoteDraft(options: UseQuoteDraftOptions) {
  const { conversationId, brindeContext } = options;

  const isComplete =
    brindeContext.budget != null &&
    brindeContext.quantity != null &&
    brindeContext.occasion != null &&
    brindeContext.occasion != undefined;

  const initialDraft = useMemo((): QuoteDraft | null => {
    if (!isComplete) return null;
    const items = buildInitialItems(brindeContext);
    const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);
    return {
      conversationId,
      items,
      subtotal,
      freight: brindeContext.deliveryCep
        ? buildFreightEstimate(brindeContext.deliveryCep)
        : undefined,
      upsellSuggestion: brindeContext.occasion
        ? buildUpsell(brindeContext.occasion)
        : undefined,
      status: 'draft',
      isComplete: true,
    };
  }, [conversationId, brindeContext, isComplete]);

  const [extraItems, setExtraItems] = useState<QuoteItem[]>([]);

  const draft = useMemo((): QuoteDraft | null => {
    if (!initialDraft && extraItems.length === 0) return null;
    if (initialDraft) {
      const allItems = [...initialDraft.items, ...extraItems];
      return {
        ...initialDraft,
        items: allItems,
        subtotal: allItems.reduce((s, i) => s + i.totalPrice, 0),
      };
    }
    // only extraItems, no initial draft
    return {
      conversationId,
      items: extraItems,
      subtotal: extraItems.reduce((s, i) => s + i.totalPrice, 0),
      status: 'draft',
      isComplete: false,
    };
  }, [initialDraft, extraItems, conversationId]);

  const addItem = useCallback((item: QuoteItem) => {
    setExtraItems((prev) => {
      const existing = prev.findIndex((i) => i.productId === item.productId);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = item;
        return next;
      }
      return [...prev, item];
    });
  }, []);

  const removeItem = useCallback((extraProductId: string) => {
    setExtraItems((prev) => prev.filter((i) => i.productId !== extraProductId));
  }, []);

  return { draft, addItem, removeItem };
}
