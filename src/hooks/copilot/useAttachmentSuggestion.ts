/**
 * CV-067 — Sugestão de anexo.
 *
 * Quando o momento da conversa pede, sugere ao vendedor anexar um artefato
 * real existente no sistema: catálogo PDF, foto do produto, tabela de preço
 * ou mockup. Só sugere anexo que existe de fato.
 */
import { useMemo } from 'react';

/** Tipo de anexo que pode ser sugerido. */
export type AttachmentType = 'catalog' | 'product_photo' | 'price_table' | 'mockup';

export interface AttachmentSuggestion {
  type: AttachmentType;
  label: string;
  description: string;
  /** URL ou identificador do arquivo no sistema. */
  fileRef: string;
  /** Relevância 0–1 para o momento atual. */
  score: number;
}

/** Mapa de palavras-chave por tipo de anexo. */
const ATTACHMENT_TRIGGERS: Record<AttachmentType, string[]> = {
  catalog: [
    'catálogo', 'catalogo', 'produtos', 'ver produtos', 'o que vocês vendem',
    'o que voces vendem', 'portfólio', 'portfolio', 'linha completa',
  ],
  product_photo: [
    'foto', 'imagem', 'como é', 'como e', 'visual', 'ver o produto',
    'mostra', 'mostrar', 'aparência', 'aparencia',
  ],
  price_table: [
    'tabela', 'preço', 'preco', 'valor', 'custo', 'quanto custa',
    'faixa de preço', 'precificação', 'lista de preços',
  ],
  mockup: [
    'mockup', 'mock', 'arte', 'gravação', 'gravacao', 'personalização',
    'personalizacao', 'como ficaria', 'como fica', 'exemplo',
  ],
};

const ATTACHMENT_LABELS: Record<AttachmentType, { label: string; description: string }> = {
  catalog: { label: 'Catálogo PDF', description: 'Enviar catálogo completo de produtos' },
  product_photo: { label: 'Foto do produto', description: 'Enviar foto do produto mencionado' },
  price_table: { label: 'Tabela de preços', description: 'Enviar tabela com faixas de quantidade' },
  mockup: { label: 'Mockup', description: 'Enviar exemplo com a gravação/personalização' },
};

export interface AttachmentAsset {
  type: AttachmentType;
  fileRef: string;
  label?: string;
}

export interface UseAttachmentSuggestionOptions {
  /** Última mensagem do cliente (gatilho principal). */
  lastClientMessage: string;
  /** Texto que o vendedor está digitando (contexto secundário). */
  draftText?: string;
  /** Ativos realmente disponíveis no sistema. Só sugerimos o que existe. */
  availableAssets: AttachmentAsset[];
  /** Número máximo de sugestões (padrão: 2). */
  maxSuggestions?: number;
}

export function useAttachmentSuggestion({
  lastClientMessage,
  draftText = '',
  availableAssets,
  maxSuggestions = 2,
}: UseAttachmentSuggestionOptions): AttachmentSuggestion[] {
  return useMemo(() => {
    if (!lastClientMessage && !draftText) return [];
    const combined = (lastClientMessage + ' ' + draftText).toLowerCase();

    const scored: AttachmentSuggestion[] = [];

    for (const asset of availableAssets) {
      const triggers = ATTACHMENT_TRIGGERS[asset.type] ?? [];
      const hits = triggers.filter((kw) => combined.includes(kw)).length;
      if (hits === 0) continue;
      const score = Math.min(hits * 0.25, 1);
      const meta = ATTACHMENT_LABELS[asset.type];
      scored.push({
        type: asset.type,
        label: asset.label ?? meta.label,
        description: meta.description,
        fileRef: asset.fileRef,
        score,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxSuggestions);
  }, [lastClientMessage, draftText, availableAssets, maxSuggestions]);
}
