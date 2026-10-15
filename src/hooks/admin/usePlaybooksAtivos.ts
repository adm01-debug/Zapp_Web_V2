import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchPlaybooksAtivos,
  setPlaybookActive,
  PlaybookWriteError,
  type Playbook,
  type PlaybookStep,
} from './usePlaybooksData';

export type { Playbook, PlaybookStep };

/**
 * PG-08 — leitura de playbooks ATIVOS para o atendente e escrita (ativar/desativar)
 * para o gerenciador.
 *
 * A leitura é só-leitura e não depende do papel: o RLS deixa qualquer
 * `authenticated` ver a tabela, então o recorte `is_active = true` é feito na
 * consulta (`fetchPlaybooksAtivos`). Sem esse recorte o atendente veria playbook
 * desativado.
 *
 * A escrita depende de admin/supervisor. Quando a policy barra, o PostgREST devolve
 * `{ data: [], error: null }` — sucesso falso. Aqui isso vira `PlaybookWriteError`
 * e cai no `onError` do mutation com mensagem visível; o cache só é invalidado
 * quando a escrita realmente aconteceu (senão a tela recarregaria para nada).
 */

export const playbooksQueryKey = ['playbooks'] as const;

export const playbooksAtivosQueryKey = (categoria?: string) =>
  [...playbooksQueryKey, 'ativos', categoria ?? 'todas'] as const;

export function usePlaybooksAtivos(categoria?: string) {
  return useQuery({
    queryKey: playbooksAtivosQueryKey(categoria),
    queryFn: async (): Promise<Playbook[]> => {
      const { data, error } = await fetchPlaybooksAtivos(categoria);
      // Erro de leitura NÃO pode virar lista vazia: lista vazia o atendente lê
      // como "não existe playbook ativo".
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

export interface AlterarPlaybookAtivo {
  id: string;
  ativo: boolean;
}

export function useSetPlaybookActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ativo }: AlterarPlaybookAtivo) => setPlaybookActive(id, ativo),
    onSuccess: async () => {
      toast.success('Playbook atualizado');
      await queryClient.invalidateQueries({ queryKey: playbooksQueryKey });
    },
    onError: (erro) => {
      toast.error(
        erro instanceof PlaybookWriteError
          ? erro.message
          : 'Não foi possível alterar o playbook. Tente novamente.',
      );
    },
  });
}
