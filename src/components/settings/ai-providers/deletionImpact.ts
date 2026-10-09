import type { AIProvider } from './types';
import { USE_FOR_OPTIONS } from './types';

/**
 * R2-API-046 — impacto REAL da exclusão de um provedor no roteamento de IA.
 *
 * O roteador (`supabase/functions/_shared/ai-routing.ts`, `resolveProvider`)
 * exige, para cada finalidade, um provedor **ativo + padrão** que a declare em
 * `use_for`. Quando não sobra candidato ele NÃO faz fallback: lança
 * `NO_PROVIDER` (HTTP 503) de propósito — a ausência de padrão virou erro
 * explícito justamente para não mascarar configuração quebrada.
 *
 * O trigger do banco (`ensure_single_default_ai_provider`, migration
 * 20260408194438) é `BEFORE INSERT OR UPDATE`: ele apenas desmarca padrões
 * sobrepostos. Não existe trigger de DELETE, nada elege sucessor.
 *
 * Logo, prometer "redirecionamento automático para o provedor padrão" na
 * confirmação de remoção era falso. Esta função devolve exatamente as
 * finalidades que ficariam SEM provedor ativo+padrão se `target` saísse da
 * lista — é essa lista que a confirmação precisa declarar.
 *
 * Regras (espelham o predicado do roteador, sem inventar política nova):
 *  - remover um provedor que não é ativo+padrão não tira cobertura de ninguém;
 *  - um "sucessor" só conta se estiver ATIVO e for PADRÃO e declarar a
 *    finalidade em `use_for` (linha inativa ou só configurada não atende);
 *  - a ordem da lista de entrada não altera o resultado.
 */
export function purposesLosingDefaultProvider(
  providers: AIProvider[],
  target: AIProvider | null | undefined,
): string[] {
  const list = Array.isArray(providers) ? providers : [];
  if (!target) return [];
  // Só um candidato do roteamento (ativo + padrão) pode deixar buraco ao sair.
  if (target.is_active !== true || target.is_default !== true) return [];

  const purposes = Array.isArray(target.use_for) ? target.use_for : [];

  return purposes.filter((purpose) => {
    const hasSuccessor = list.some(
      (row) =>
        row &&
        row.id !== target.id &&
        row.is_active === true &&
        row.is_default === true &&
        Array.isArray(row.use_for) &&
        row.use_for.includes(purpose),
    );
    return !hasSuccessor;
  });
}

/** Rótulo pt-BR de uma finalidade (`use_for`), com o valor cru como fallback. */
export function useForLabel(value: string): string {
  return USE_FOR_OPTIONS.find((option) => option.value === value)?.label || value;
}

/** Lista legível em pt-BR: "Copiloto", "Copiloto e Resumo", "A, B e C". */
export function formatPurposeList(values: string[]): string {
  const labels = values.map(useForLabel);
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}
