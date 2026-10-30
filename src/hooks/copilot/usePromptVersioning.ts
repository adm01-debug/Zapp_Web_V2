/**
 * CV-131 — Versionamento de prompts do copiloto.
 *
 * Mapeia identificador de prompt para versão e texto.
 * Permite A/B e rollback sem deploy de código.
 */
import { useMemo } from 'react';

export interface PromptVersion {
  id: string;
  version: string;
  text: string;
}

const PROMPT_REGISTRY: Record<string, PromptVersion> = {
  'objection.price': {
    id: 'objection.price',
    version: '1.0.0',
    text: 'O cliente mencionou preço alto. Ancore em valor: mostre o custo por unidade, compare com brindes descartáveis e destaque durabilidade e impacto de marca.',
  },
  'brinde.qualify': {
    id: 'brinde.qualify',
    version: '1.0.0',
    text: 'Qualifique usando B·R·I·N·D·E: Bugdet, Responsável, Intenção, Número, Deadline, Delivery. Faça 1 pergunta por vez.',
  },
  'closing.urgency': {
    id: 'closing.urgency',
    version: '1.0.0',
    text: 'Urgência honesta: mencione prazo real de produção + gravação + frete. Nunca invente escassez.',
  },
};

export function usePromptVersioning(promptId: string): PromptVersion | null {
  return useMemo(() => PROMPT_REGISTRY[promptId] ?? null, [promptId]);
}
