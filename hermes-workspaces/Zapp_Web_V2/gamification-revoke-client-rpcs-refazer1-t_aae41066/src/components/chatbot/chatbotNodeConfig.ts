import type { ChatbotNode } from '@/hooks/integrations/useChatbotFlows';

/**
 * R2-MOD-069 (#432) — contrato de AUTORIA dos nós do editor de Chatbot.
 *
 * O formulário oferecia os tipos Condição, Ação e Transferir, mas não tinha
 * nenhum controle para definir a regra, a ação ou o destino — e `Salvar`
 * aceitava o nó vazio. Os campos declarados em `ChatbotNode['data']`
 * (`condition`, `action`, `transferTo`) existiam sem quem os preenchesse.
 *
 * Este módulo concentra os valores oferecidos pela UI e o que conta como nó
 * INCOMPLETO na hora de salvar, para que o diálogo de edição e o editor do
 * fluxo usem a mesma regra.
 */

/** Operadores oferecidos para a regra de um nó Condição. */
export interface ConfigOption {
  value: string;
  label: string;
}

export const CONDITION_OPERATORS: ConfigOption[] = [
  { value: 'equals', label: 'é igual a' },
  { value: 'not_equals', label: 'é diferente de' },
  { value: 'contains', label: 'contém' },
  { value: 'not_contains', label: 'não contém' },
  { value: 'greater_than', label: 'maior que' },
  { value: 'less_than', label: 'menor que' },
];

export const DEFAULT_CONDITION_OPERATOR = 'equals';

export function conditionOperatorLabel(value?: string): string {
  return CONDITION_OPERATORS.find((op) => op.value === value)?.label ?? value ?? '';
}

/** Ramos de uma ligação que sai de um nó Condição (o `condition` da aresta). */
export const EDGE_CONDITIONS = [
  { value: 'true', label: 'Verdadeiro' },
  { value: 'false', label: 'Falso' },
] as const;

/**
 * Campos obrigatórios que faltam no nó, na ordem em que aparecem no formulário.
 * Lista vazia = nó pronto para salvar. Só os tipos cuja configuração o editor
 * não oferecia (condição, ação e transferência) entram aqui: é o defeito do
 * cartão, e alargar a validação para os tipos já configuráveis mudaria o
 * contrato de fluxos existentes.
 */
export function missingNodeConfig(node: ChatbotNode): string[] {
  const data = node.data ?? ({} as ChatbotNode['data']);

  switch (node.type) {
    case 'condition': {
      const condition = data.condition;
      const faltando: string[] = [];
      if (!condition?.field?.trim()) faltando.push('Campo da condição');
      if (!condition?.value?.trim()) faltando.push('Valor da condição');
      return faltando;
    }
    case 'action':
      return data.action?.trim() ? [] : ['Ação'];
    case 'transfer':
      return data.transferTo?.trim() ? [] : ['Destino da transferência'];
    default:
      return [];
  }
}

export interface IncompleteNode {
  node: ChatbotNode;
  missing: string[];
}

export function findIncompleteNodes(nodes: ChatbotNode[]): IncompleteNode[] {
  return nodes
    .map((node) => ({ node, missing: missingNodeConfig(node) }))
    .filter((item) => item.missing.length > 0);
}
