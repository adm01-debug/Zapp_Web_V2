import type { TemplateVariant } from '@/hooks/integrations/useTalkXTemplates';

/**
 * X097 — regras puras da aba Variações A/B (pesos, rótulos e tipos).
 *
 * Ficam fora de `TalkXTemplateVariants.tsx` porque o ESLint do projeto
 * (`react-refresh/only-export-components`) recusa um componente que exporta
 * constantes e funções junto: aqui as regras podem ser testadas e reusadas pelo
 * editor sem misturar módulo de UI com módulo de cálculo.
 */

/** Rótulos livres para variantes quando o controle é o texto-base (A). */
export const VARIANT_LABELS = ['B', 'C'] as const;

/** Enviadas por variante exigidas para declarar vencedora sem a marcação. */
export const MIN_SENT_FOR_WINNER = 100;

/**
 * Variante em rascunho: `id` ausente = linha nova, ainda não persistida. Ela
 * entra no save do conjunto e só recebe id na recarga depois de gravar.
 */
export type TemplateVariantDraft = Omit<TemplateVariant, 'id' | 'created_at'> & {
  id?: string;
  created_at?: string;
};

/** Resultado por variante (CAP-070 / X065). Sem linha = "sem dados ainda". */
export type TalkXVariantResult = {
  variant_id: string;
  recipients: number;
  sent: number;
  delivered: number;
  replies: number;
};

/**
 * Peso do controle = o que sobra de 100%. O conjunto só fecha 100% quando as
 * variantes somam no máximo 100 (acima disso o total passa de 100 e é recusado).
 */
export function variantWeights(drafts: Array<{ weight: number }>): {
  control: number;
  variants: number;
  total: number;
  valid: boolean;
} {
  const variants = drafts.reduce((sum, draft) => sum + Math.max(0, draft.weight), 0);
  const control = Math.max(0, 100 - variants);
  const total = control + variants;
  return { control, variants, total, valid: total === 100 };
}

/** Reparte 100% entre o controle e `count` variantes (o controle absorve o resto). */
export function splitWeightsEvenly(count: number): { control: number; variants: number[] } {
  const share = Math.floor(100 / (count + 1));
  return { control: 100 - share * count, variants: Array.from({ length: count }, () => share) };
}

/** Guarda do banco (X085): a variante tem envios atribuídos e não pode sair. */
export function isVariantInUseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('talkx_variant_in_use');
}
