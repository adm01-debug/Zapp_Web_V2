/**
 * Fase 3 — hook da porta única. `useMutation` porque a pergunta é ação explícita
 * do vendedor (não polling); nada é gravado no banco.
 */
import { useMutation } from '@tanstack/react-query';
import { askGateway, type GatewayAnswer } from '@/lib/assistant/askGateway';

export function useAssistantGateway(contactId: string | null) {
  const mutation = useMutation<GatewayAnswer, Error, string>({
    mutationFn: (query: string) => askGateway({ query, contactId }),
  });

  return {
    ask: mutation.mutate,
    answer: mutation.data ?? null,
    error: mutation.error?.message ?? null,
    isAsking: mutation.isPending,
    reset: mutation.reset,
  };
}