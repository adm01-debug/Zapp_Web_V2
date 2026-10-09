import { splitRules, type SegmentRules } from '@/hooks/integrations/useTalkXSegments';

/**
 * X099 — validação do construtor de segmentos.
 *
 * Antes, o único cuidado era o de condição em branco (X008): dava para publicar um
 * segmento sem nome útil, com nome repetido (dois cards iguais na biblioteca) ou
 * com uma descrição que estourava a coluna. Cada regra aqui é um motivo de recusa
 * com a mensagem que a tela mostra, e todas cabem em uma função pura para serem
 * provadas por teste.
 */
export const SEGMENT_NAME_MIN = 3;
export const SEGMENT_NAME_MAX = 60;
export const SEGMENT_DESCRIPTION_MAX = 160;

export interface SegmentValidationInput {
  name: string;
  description: string;
  rules: SegmentRules;
  /** Nomes já existentes na biblioteca, SEM o segmento que está sendo editado. */
  existingNames?: string[];
}

export interface SegmentValidationErrors {
  name?: string;
  description?: string;
  rules?: string;
}

const normalize = (value: string): string => (value ?? '').trim().toLocaleLowerCase('pt-BR');

export function validateSegmentName(name: string, existingNames: string[] = []): string | null {
  const trimmed = (name ?? '').trim();
  if (trimmed.length < SEGMENT_NAME_MIN) return `O nome precisa ter ao menos ${SEGMENT_NAME_MIN} caracteres.`;
  if (trimmed.length > SEGMENT_NAME_MAX) return `O nome pode ter no máximo ${SEGMENT_NAME_MAX} caracteres.`;
  if (existingNames.some((n) => normalize(n) === normalize(trimmed))) return 'Já existe um segmento com este nome.';
  return null;
}

export function validateSegmentDescription(description: string): string | null {
  if ((description ?? '').length > SEGMENT_DESCRIPTION_MAX) {
    return `A descrição pode ter no máximo ${SEGMENT_DESCRIPTION_MAX} caracteres.`;
  }
  return null;
}

/**
 * O que impede publicar é a condição EM BRANCO (X008): ela zeraria a estimativa e
 * iria inteira para o motor de regras. Segmento sem condição nenhuma continua
 * válido — é o "Toda a base" que a biblioteca já exibe e que um teste de produção
 * fixa (TalkXSegments.detailFresh.test.tsx).
 */
export function validateSegmentRules(rules: SegmentRules): string | null {
  const { incompleteCount } = splitRules(rules);
  if (incompleteCount > 0) return `Complete ou remova ${incompleteCount} condição(ões) antes de publicar.`;
  return null;
}

export function validateSegment(input: SegmentValidationInput): SegmentValidationErrors {
  const errors: SegmentValidationErrors = {};
  const name = validateSegmentName(input.name, input.existingNames ?? []);
  const description = validateSegmentDescription(input.description);
  const rules = validateSegmentRules(input.rules);
  if (name) errors.name = name;
  if (description) errors.description = description;
  if (rules) errors.rules = rules;
  return errors;
}

export function isValid(errors: SegmentValidationErrors): boolean {
  return !errors.name && !errors.description && !errors.rules;
}

/** Contador da descrição (a tela mostra "n/160"). */
export function descriptionCounter(description: string): string {
  return `${(description ?? '').length}/${SEGMENT_DESCRIPTION_MAX}`;
}
