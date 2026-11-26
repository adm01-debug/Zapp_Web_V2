/**
 * useMultiplixDeadLetters — dead letter do Multiplix para o painel admin.
 *
 * A migration 20261002651230 criou `list_multiplix_dead_letters` e
 * `count_multiplix_dead_letters` "sem tela nova": quem não roda SQL não via nada.
 * Este hook é a porta de leitura no front. As duas funções checam admin/supervisor
 * DENTRO delas (SECURITY DEFINER), então o "sem permissão" chega aqui como `error`
 * — e quem mostra a tela precisa exibir "—", nunca 0.
 *
 * Dead letter = item com status='failed' E next_attempt_at nulo (tentativas
 * esgotadas). A definição vem da própria função; não se recalcula aqui.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MultiplixDeadLetter {
  item_id: string;
  dispatch_id: string;
  dispatch_name: string | null;
  attempt_count: number | null;
  error_class: string | null;
  error_message: string | null;
  failed_at: string | null;
  destino_mascarado: string | null;
}

/** Contador da fila morta. Erro NÃO vira zero: quem consome decide o que exibir. */
export function useMultiplixDeadLetterCount() {
  return useQuery({
    queryKey: ['multiplix-dead-letters', 'count'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('count_multiplix_dead_letters');
      if (error) throw new Error(error.message || 'count_multiplix_dead_letters falhou');
      const total = Number(data);
      if (!Number.isFinite(total)) {
        throw new Error('count_multiplix_dead_letters não retornou um número');
      }
      return total;
    },
    staleTime: 60_000,
    retry: 1,
  });
}

/** Últimos itens (id, horário e motivo). `enabled` busca só quando a lista é aberta. */
export function useMultiplixDeadLetters(limit = 20, enabled = true) {
  const teto = Math.min(Math.max(Math.trunc(limit) || 20, 1), 500);
  return useQuery({
    queryKey: ['multiplix-dead-letters', 'list', teto],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_multiplix_dead_letters', { p_limit: teto });
      if (error) throw new Error(error.message || 'list_multiplix_dead_letters falhou');
      return (data ?? []) as unknown as MultiplixDeadLetter[];
    },
    staleTime: 60_000,
    retry: 1,
  });
}
